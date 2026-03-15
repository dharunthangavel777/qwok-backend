import { Firestore } from '@google-cloud/firestore';

export interface SecurityEvent {
  id: string;
  type: 'auth_failure' | 'large_withdrawal' | 'policy_violation' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metadata: any;
  timestamp: Date;
  resolved: boolean;
}

export class SOCService {
  private get db() {
    const { admin } = require('../../index');
    return admin.firestore();
  }
  private collection = 'security_events';

  constructor() {}

  async logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<string> {
    const docRef = await this.db.collection(this.collection).add({
      ...event,
      timestamp: new Date(),
      resolved: false,
    });
    return docRef.id;
  }

  async getRecentEvents(limit: number = 50): Promise<SecurityEvent[]> {
    const snapshot = await this.db.collection(this.collection)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as SecurityEvent));
  }

  async resolveEvent(id: string): Promise<void> {
    await this.db.collection(this.collection).doc(id).update({ resolved: true });
  }

  async getThreatSummary(): Promise<any> {
    const snapshot = await this.db.collection(this.collection)
      .where('resolved', '==', false)
      .get();
    
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    snapshot.forEach((doc: any) => {
      const data = doc.data() as SecurityEvent;
      if (summary[data.severity] !== undefined) {
        summary[data.severity]++;
      }
    });

    return summary;
  }
}
