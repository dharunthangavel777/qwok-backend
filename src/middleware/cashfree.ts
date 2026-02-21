import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Cashfree Signature Verification Middleware
export const verifyCashfreeSignature = (req: Request, res: Response, next: NextFunction) => {
    try {
        const signature = req.headers['x-webhook-signature'] as string;
        const timestamp = req.headers['x-webhook-timestamp'] as string;

        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Missing Webhook Signature Headers' });
        }

        // Protection against Replay Attacks (5 minute window)
        const requestTime = parseInt(timestamp);
        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - requestTime) > 300) {
            return res.status(401).json({ error: 'Webhook Timestamp Expired (Replay Attack Protection)' });
        }

        // Construct the payload for verification (Cashfree specific format)
        // usually: timestamp + rawBody
        // IMPORTANT: Make sure you use body-parser raw or similar to get raw body
        const rawBody = (req as any).rawBody;
        if (!rawBody) {
            console.error('Raw body not found. Ensure body-parser is configured with { verify: ... }');
            return res.status(500).json({ error: 'Internal Server Error: Raw Body Missing' });
        }

        const payload = timestamp + rawBody;
        const secret = process.env.CASHFREE_CLIENT_SECRET;

        if (!secret) {
            throw new Error("CASHFREE_CLIENT_SECRET not configured");
        }

        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('base64');

        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(generatedSignature))) {
            next();
            return;
        } else {
            console.warn(`Invalid Signature. Expected: ${generatedSignature}, Got: ${signature}`);
            return res.status(403).json({ error: 'Invalid Webhook Signature' });
        }
    } catch (error) {
        console.error('Signature Verification Error', error);
        return res.status(403).json({ error: 'Signature Verification Failed' });
    }
};
