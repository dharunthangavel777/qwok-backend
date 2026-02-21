import { Request, Response, NextFunction } from 'express';
import { redisClient, IDEMPOTENCY_PREFIX } from '../config/redis';
import crypto from 'crypto';

interface IdempotencyRecord {
    status: 'IN_PROGRESS' | 'COMPLETED';
    response?: any;
    statusCode?: number;
    userId?: string;
    requestHash: string;
}

export const idempotencyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'] as string;

    if (!key) {
        return res.status(400).json({ error: 'Idempotency-Key header is required' });
    }

    // Bind key to User ID and Endpoint for security scope
    // Assuming req.user is populated by Auth Middleware beforehand
    // const userId = req.user?.uid || 'anonymous'; 
    // const endpoint = req.path;
    // const scopedKey = `${IDEMPOTENCY_PREFIX}${userId}:${endpoint}:${key}`;

    // For simplicity in this v1 implementation, we just prefix globally but you MUST scope it in prod
    // The 'user_id' scope is critical as per design
    const userId = (req as any).user?.uid || 'all';
    const scopedKey = `${IDEMPOTENCY_PREFIX}${userId}:${key}`;

    try {
        const existingRecord = await redisClient.get(scopedKey);

        if (existingRecord) {
            const record: IdempotencyRecord = JSON.parse(existingRecord);

            // Request Payload Hashing Check
            // Verify that the new request payload matches the original one for this key
            const currentHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

            if (record.requestHash !== currentHash) {
                return res.status(409).json({ error: 'Idempotency Key Conflict: Payload mismatch for same key.' });
            }

            if (record.status === 'IN_PROGRESS') {
                return res.status(429).json({ error: 'Request with this Idempotency Key is currently processing.' });
            }

            if (record.status === 'COMPLETED') {
                return res.status(record.statusCode || 200).json(record.response);
            }
        }

        // No existing record, create "IN_PROGRESS" lock
        const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        const newRecord: IdempotencyRecord = {
            status: 'IN_PROGRESS',
            requestHash,
            userId
        };

        // Auto-expire lock after 24 hours
        await redisClient.set(scopedKey, JSON.stringify(newRecord), 'EX', 60 * 60 * 24);

        // Override res.json to capture response
        const originalJson = res.json;
        res.json = function (body) {
            const statusCode = res.statusCode;

            // Save completed response (Async, don't await blocking response)
            const completeRecord: IdempotencyRecord = {
                status: 'COMPLETED',
                response: body,
                statusCode,
                requestHash,
                userId
            };

            redisClient.set(scopedKey, JSON.stringify(completeRecord), 'EX', 60 * 60 * 24).catch(err => {
                console.error('Failed to save idempotency response', err);
            });

            return originalJson.call(this, body);
        };

        next();
        return;
    } catch (error) {
        console.error('Idempotency Error', error);
        next(error);
        return;
    }
};
