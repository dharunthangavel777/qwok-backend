import { admin } from '../../index';

export interface SupportTicket {
  id?: string;
  userId: string;
  subject: string;
  description: string;
  category: 'technical' | 'payment' | 'dispute' | 'account' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  assignedTo?: string;
  createdAt: any;
  updatedAt: any;
  messages: {
    senderId: string;
    text: string;
    timestamp: any;
  }[];
}

export class SupportTicketService {
  private db = admin.firestore();

  async getTickets(status?: string) {
    let query: any = this.db.collection('support_tickets');
    if (status) query = query.where('status', '==', status);
    
    const snap = await query.orderBy('createdAt', 'desc').get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async assignTicket(ticketId: string, adminId: string) {
    await this.db.collection('support_tickets').doc(ticketId).update({
      assignedTo: adminId,
      status: 'assigned',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async updateStatus(ticketId: string, status: SupportTicket['status']) {
    await this.db.collection('support_tickets').doc(ticketId).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async addComment(ticketId: string, senderId: string, text: string) {
    await this.db.collection('support_tickets').doc(ticketId).update({
      messages: admin.firestore.FieldValue.arrayUnion({
        senderId,
        text,
        timestamp: new Date()
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

export const supportTicketService = new SupportTicketService();
