import * as admin from 'firebase-admin';
import { notificationService } from './NotificationService';

export class UserService {
    private get db() { return admin.firestore(); }

    async initializeUser(uid: string) {
        const userRef = this.db.collection("users").doc(uid);
        const doc = await userRef.get();

        if (doc.exists && doc.data()?.createdAt) {
            return { success: true, message: "User already initialized" };
        }

        await userRef.set({
            role: 'worker',
            isVerified: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            walletBalance: 0,
            ownerRequestStatus: 'none',
            isTrialActive: false,
            hasSeenSubscription: false,
            activeMode: 'job',
            subscriptionTier: 'Free'
        }, { merge: true });

        await notificationService.sendNotification(
            uid,
            "Welcome to Work Hub! 🚀",
            "We're excited to have you on board. Complete your profile to get started.",
            {},
            "account_welcome"
        );

        return { success: true, message: "User initialized successfully" };
    }

    async requestWithdrawal(uid: string, amount: number) {
        if (!amount || amount <= 0) throw new Error("Invalid amount");

        const userRef = this.db.collection("users").doc(uid);

        await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const userData = userDoc.data()!;
            const currentBalance = userData.walletBalance || 0;

            const settingsDoc = await transaction.get(this.db.collection("platform_settings").doc("revenue"));
            const minWithdrawal = settingsDoc.exists ? (settingsDoc.data()?.minWithdrawal || 50) : 50;

            if (amount < minWithdrawal) throw new Error(`Minimum withdrawal is ₹${minWithdrawal}`);
            if (amount > currentBalance) throw new Error("Insufficient wallet balance");

            transaction.update(userRef, {
                walletBalance: admin.firestore.FieldValue.increment(-amount),
                pendingWithdrawal: admin.firestore.FieldValue.increment(amount)
            });

            const requestRef = this.db.collection("withdrawal_requests").doc();
            transaction.set(requestRef, {
                id: requestRef.id,
                userId: uid,
                amount: amount,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await notificationService.sendNotification(
            uid,
            "Withdrawal Pending",
            `Your request for ₹${amount} has been received and is being processed.`,
            {},
            "withdrawal_pending"
        );

        return { success: true, message: "Withdrawal request submitted" };
    }

    async checkEligibility(uid: string) {
        const userDoc = await this.db.collection("users").doc(uid).get();
        if (!userDoc.exists) throw new Error("User not found");

        const userData = userDoc.data()!;
        const profileCompletion = userData.profileCompletion || 0;
        const threshold = 80;

        return {
            success: true,
            profileCompletion,
            isEligible: profileCompletion >= threshold,
            threshold
        };
    }
}

export const userService = new UserService();
