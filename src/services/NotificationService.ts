import * as admin from 'firebase-admin';

export class NotificationService {
    async sendNotification(userId: string, title: string, body: string, data: any = {}, category: string = 'general') {
        try {
            const db = admin.firestore();
            const userDoc = await db.collection("users").doc(userId).get();

            if (!userDoc.exists) {
                console.warn(`[Notification] User ${userId} not found`);
                return;
            }

            const userData = userDoc.data();
            const fcmToken = userData?.fcmToken;

            // Audit
            await db.collection("notifications").add({
                userId,
                title,
                body,
                data,
                category,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            if (!fcmToken) {
                console.warn(`[Notification] No FCM token for user ${userId}`);
                return;
            }

            const message = {
                notification: { title, body },
                data: {
                    ...data,
                    click_action: "FLUTTER_NOTIFICATION_CLICK",
                    category
                },
                token: fcmToken
            };

            await admin.messaging().send(message);
            console.log(`[Notification] Sent to ${userId}: ${title}`);

        } catch (error) {
            console.error(`[Notification] Error sending to ${userId}:`, error);
        }
    }
}

export const notificationService = new NotificationService();
