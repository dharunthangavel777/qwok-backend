import * as admin from 'firebase-admin';

export interface PolicyRule {
    id: string;
    name: string;
    description: string;
    condition: string; // JSON logic or a simple string-based predicate
    action: 'FLAG' | 'BLOCK' | 'SUSPEND' | 'NOTIFY';
    entity: 'JOB' | 'USER' | 'MESSAGE' | 'TRANSACTION';
    isActive: boolean;
}

export class PolicyEngineService {
    private db = admin.firestore();

    /**
     * Evaluate an entity against all active policies
     */
    async evaluate(entity: any, type: PolicyRule['entity']): Promise<PolicyRule[]> {
        const snapshot = await this.db.collection('policies')
            .where('entity', '==', type)
            .where('isActive', '==', true)
            .get();

        const triggeredPolicies: PolicyRule[] = [];

        for (const doc of snapshot.docs) {
            const rule = doc.data() as PolicyRule;
            if (this.checkCondition(entity, rule.condition)) {
                triggeredPolicies.push(rule);
            }
        }

        return triggeredPolicies;
    }

    private checkCondition(entity: any, condition: string): boolean {
        // Basic Implementation: In production, use 'json-logic-js' or similar.
        // For now, we support simple key-value checks like "salary < 500"
        try {
            if (condition.includes('<')) {
                const [key, val] = condition.split('<').map(s => s.trim());
                return entity[key] < parseFloat(val);
            }
            if (condition.includes('>')) {
                const [key, val] = condition.split('>').map(s => s.trim());
                return entity[key] > parseFloat(val);
            }
            if (condition.includes('==')) {
                const [key, val] = condition.split('==').map(s => s.trim());
                return String(entity[key]) === val.replace(/'/g, "");
            }
        } catch (e) {
            console.error('[PolicyEngine] Condition check failed:', e);
        }
        return false;
    }

    async createPolicy(rule: Omit<PolicyRule, 'id'>): Promise<string> {
        const docRef = await this.db.collection('policies').add({
            ...rule,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    }

    async getPolicies(): Promise<PolicyRule[]> {
        const snapshot = await this.db.collection('policies').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PolicyRule));
    }
}

export const policyEngine = new PolicyEngineService();
