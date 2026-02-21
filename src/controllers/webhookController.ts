import { Request, Response } from 'express';
import { webhookQueue } from '../queues';
import crypto from 'crypto';

export const handleCashfreeWebhook = async (req: Request, res: Response) => {
    try {
        const rawBody = (req as any).rawBody; // Assumes raw middleware ran
        const payload = req.body;

        // 1. Signature Verification happens in Middleware (cashfree.ts)
        // 2. Here we just validate strict business rules before Queuing

        if (!payload || !payload.data || !payload.type) {
            return res.status(400).json({ error: 'Invalid Webhook Payload Structure check' });
        }

        const eventId = req.headers['x-webhook-id'] as string || crypto.randomUUID();
        const eventType = payload.type;

        // 3. Push to Queue (Fast response to Cashfree)
        await webhookQueue.add(eventType, {
            eventId,
            eventType,
            payload,
            receivedAt: new Date().toISOString()
        }, {
            jobId: eventId, // Idempotency at Queue level
            removeOnComplete: true
        });

        console.log(`Webhook Queued: ${eventType} [${eventId}]`);
        return res.status(200).json({ status: 'OK', message: 'Webhook received' });

    } catch (error) {
        console.error('Webhook Handler Error', error);
        return res.status(500).json({ error: 'Internal Handling Error' });
    }
};
