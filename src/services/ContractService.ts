import * as admin from 'firebase-admin';
import { notificationService } from './NotificationService';

export class ContractService {
    private get db() { return admin.firestore(); }

    async createContract(userId: string, data: any) {
        const { projectId, agreedBudget, paymentType, startDate, expectedCompletion } = data;

        if (!projectId || !agreedBudget || !paymentType) throw new Error("Missing required fields");

        const projectDoc = await this.db.collection("projects").doc(projectId).get();
        if (!projectDoc.exists) throw new Error("Project not found");
        if (projectDoc.data()?.ownerId !== userId) throw new Error("Permission denied");

        // Centralized fee calculation
        let commissionRate = 0.10;
        const settingsDoc = await this.db.collection("platform_settings").doc("revenue").get();
        if (settingsDoc.exists) commissionRate = settingsDoc.data()?.commissionRate || 0.10;

        const platformFee = parseFloat(agreedBudget) * commissionRate;

        const contractRef = this.db.collection("contracts").doc();
        await contractRef.set({
            id: contractRef.id,
            projectId,
            agreedBudget: parseFloat(agreedBudget),
            platformFee,
            commissionRate,
            paymentType,
            startDate: startDate
                ? admin.firestore.Timestamp.fromDate(new Date(startDate))
                : admin.firestore.FieldValue.serverTimestamp(),
            expectedCompletion: expectedCompletion
                ? admin.firestore.Timestamp.fromDate(new Date(expectedCompletion))
                : null,
            ownerAccepted: false,
            workerAccepted: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, contractId: contractRef.id, platformFee };
    }

    async acceptContract(userId: string, data: any) {
        const { contractId, role } = data;
        if (!contractId || !role) throw new Error("Missing fields");

        const contractRef = this.db.collection("contracts").doc(contractId);

        const result = await this.db.runTransaction(async (transaction) => {
            const contractDoc = await transaction.get(contractRef);
            if (!contractDoc.exists) throw new Error("Contract not found");

            const projectRef = this.db.collection("projects").doc(contractDoc.data()!.projectId);
            const projectDoc = await transaction.get(projectRef);
            if (!projectDoc.exists) throw new Error("Project not found");

            const projectData = projectDoc.data()!;
            const updates: Record<string, any> = {};

            if (role === 'owner') {
                if (projectData.ownerId !== userId) throw new Error("Permission denied");
                updates.ownerAccepted = true;
                updates.ownerAcceptedAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (role === 'worker') {
                if (projectData.workerId !== userId) throw new Error("Permission denied");
                updates.workerAccepted = true;
                updates.workerAcceptedAt = admin.firestore.FieldValue.serverTimestamp();
            } else {
                throw new Error("Invalid role");
            }

            transaction.update(contractRef, updates);

            return {
                projectId: projectData.id,
                recipientId: role === 'owner' ? projectData.workerId : projectData.ownerId,
                role
            };
        });

        await notificationService.sendNotification(
            result.recipientId,
            'Contract Update',
            `The contract for your project has been accepted by the ${result.role}.`,
            { projectId: result.projectId, contractId },
            'contract_accepted'
        );

        return { success: true };
    }
}

export const contractService = new ContractService();
