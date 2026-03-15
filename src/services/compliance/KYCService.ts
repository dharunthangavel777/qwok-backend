import * as admin from 'firebase-admin';

export type KYCStatus = 'NOT_STARTED' | 'PENDING' | 'REJECTED' | 'APPROVED';
export type KYCType = 'INDIVIDUAL' | 'BUSINESS';

export interface KYCDocument {
    type: 'ID_CARD' | 'PASSPORT' | 'BUSINESS_LICENSE' | 'TAX_DOC';
    url: string;
    uploadedAt: Date;
}

export class KYCService {
    private get db() { return admin.firestore(); }

    async submitKYC(userId: string, type: KYCType, documents: KYCDocument[]): Promise<void> {
        await this.db.collection('verifications').doc(userId).set({
            userId,
            type,
            documents: documents.map(d => ({ ...d, uploadedAt: new Date() })),
            status: 'PENDING',
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update user record status
        await this.db.collection('users').doc(userId).update({
            kycStatus: 'PENDING'
        });
    }

    async reviewKYC(userId: string, status: 'APPROVED' | 'REJECTED', reviewerId: string, notes?: string): Promise<void> {
        await this.db.collection('verifications').doc(userId).update({
            status,
            reviewerId,
            reviewerNotes: notes,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update user record status
        await this.db.collection('users').doc(userId).update({
            kycStatus: status,
            isVerified: status === 'APPROVED'
        });
    }

    async getPendingVerifications(): Promise<any[]> {
        const snapshot = await this.db.collection('verifications')
            .where('status', '==', 'PENDING')
            .orderBy('submittedAt', 'asc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}

export const kycService = new KYCService();
