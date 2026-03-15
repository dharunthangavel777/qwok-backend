import * as admin from 'firebase-admin';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FraudSignal {
    type: 'MULTI_ACCOUNT' | 'PAYMENT_FAILURE' | 'ABNORMAL_WITHDRAWAL' | 'SPAM_ACTIVITY';
    severity: number;
    timestamp: Date;
    metadata?: any;
}

export class FraudIntelligenceService {
    private get db() { return admin.firestore(); }

    /**
     * Calculate and update the risk score for a user
     */
    async calculateRiskScore(userId: string): Promise<RiskLevel> {
        const userRef = this.db.collection('users').doc(userId);
        const signalsSnapshot = await userRef.collection('fraud_signals').get();
        
        let totalScore = 0;
        signalsSnapshot.forEach(doc => {
            const signal = doc.data() as FraudSignal;
            totalScore += signal.severity;
        });

        let level: RiskLevel = 'LOW';
        if (totalScore >= 80) level = 'CRITICAL';
        else if (totalScore >= 50) level = 'HIGH';
        else if (totalScore >= 20) level = 'MEDIUM';

        await userRef.update({ 
            fraudRiskScore: totalScore,
            fraudRiskLevel: level,
            lastRiskReview: admin.firestore.FieldValue.serverTimestamp()
        });

        return level;
    }

    /**
     * Record a new fraud signal for a user
     */
    async addSignal(userId: string, signal: Omit<FraudSignal, 'timestamp'>): Promise<void> {
        const userRef = this.db.collection('users').doc(userId);
        await userRef.collection('fraud_signals').add({
            ...signal,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Trigger immediate re-calculation
        await this.calculateRiskScore(userId);
    }

    async getHighRiskUsers(): Promise<any[]> {
        const snapshot = await this.db.collection('users')
            .where('fraudRiskLevel', 'in', ['HIGH', 'CRITICAL'])
            .orderBy('fraudRiskScore', 'desc')
            .limit(50)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}

export const fraudIntelligence = new FraudIntelligenceService();
