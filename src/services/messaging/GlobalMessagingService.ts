import { admin } from '../../index';

export class GlobalMessagingService {
  private messaging = admin.messaging();
  private db = admin.firestore();

  async broadcastMessage(title: string, body: string, target?: 'all' | 'workers' | 'owners') {
    const topic = target || 'all';
    
    // 1. Send Push Notification via FCM Topics
    const message = {
      notification: { title, body },
      topic: `broadcast_${topic}`
    };

    const response = await this.messaging.send(message);

    // 2. Log Broadcast in Firestore for history
    await this.db.collection('admin_broadcasts').add({
      title,
      body,
      target: topic,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      response
    });

    return response;
  }

  async getBroadcastLogs() {
    const snap = await this.db.collection('admin_broadcasts').orderBy('sentAt', 'desc').limit(50).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}

export const globalMessagingService = new GlobalMessagingService();
