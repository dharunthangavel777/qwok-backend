import { Firestore } from '@google-cloud/firestore';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  variations: {
    id: string;
    name: string;
    weight: number; // 0 to 100
    metrics: {
      impressions: number;
      conversions: number;
    };
  }[];
  targeting: {
    roles?: string[];
    platform?: string[];
  };
  createdAt: Date;
}

export class ABTestingService {
  private get db() {
    const { admin } = require('../../index');
    return admin.firestore();
  }
  private collection = 'experiments';

  constructor() {}

  async listExperiments(): Promise<Experiment[]> {
    const snapshot = await this.db.collection(this.collection).get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Experiment));
  }

  async createExperiment(experiment: Omit<Experiment, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await this.db.collection(this.collection).add({
      ...experiment,
      createdAt: new Date(),
    });
    return docRef.id;
  }

  async updateExperiment(id: string, updates: Partial<Experiment>): Promise<void> {
    await this.db.collection(this.collection).doc(id).update(updates);
  }

  async recordMetric(experimentId: string, variationId: string, type: 'impression' | 'conversion'): Promise<void> {
    const docRef = this.db.collection(this.collection).doc(experimentId);
    const doc = await docRef.get();
    if (!doc.exists) return;

    const data = doc.data() as Experiment;
    const variationIndex = data.variations.findIndex(v => v.id === variationId);
    if (variationIndex === -1) return;

    const metricKey = type === 'impression' ? 'impressions' : 'conversions';
    data.variations[variationIndex].metrics[metricKey]++;

    await docRef.update({ variations: data.variations });
  }
}
