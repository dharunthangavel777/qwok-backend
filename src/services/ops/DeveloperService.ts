import { Firestore } from '@google-cloud/firestore';
import * as crypto from 'crypto';

export interface APIKey {
  id: string;
  key: string;
  name: string;
  ownerId: string;
  status: 'active' | 'revoked';
  permissions: string[];
  createdAt: Date;
  lastUsedAt?: Date;
}

export class DeveloperService {
  private db: Firestore;
  private collection = 'api_keys';

  constructor(db: Firestore) {
    this.db = db;
  }

  async generateKey(ownerId: string, name: string, permissions: string[]): Promise<APIKey> {
    const key = `qwk_${crypto.randomBytes(24).toString('hex')}`;
    const apiKey: Omit<APIKey, 'id'> = {
      key,
      name,
      ownerId,
      status: 'active',
      permissions,
      createdAt: new Date(),
    };

    const docRef = await this.db.collection(this.collection).add(apiKey);
    return { id: docRef.id, ...apiKey };
  }

  async listKeys(ownerId?: string): Promise<APIKey[]> {
    let query: any = this.db.collection(this.collection);
    if (ownerId) {
      query = query.where('ownerId', '==', ownerId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as APIKey));
  }

  async revokeKey(id: string): Promise<void> {
    await this.db.collection(this.collection).doc(id).update({ status: 'revoked' });
  }

  async validateKey(key: string): Promise<APIKey | null> {
    const snapshot = await this.db.collection(this.collection)
      .where('key', '==', key)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data() as Omit<APIKey, 'id'>;

    await doc.ref.update({ lastUsedAt: new Date() });
    return { id: doc.id, ...data };
  }
}
