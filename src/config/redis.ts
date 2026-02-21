import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    tls: process.env.REDIS_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
};

// Primary Redis Client for General Caching & Idempotency
export const redisClient = new Redis(redisConfig as any);

// Dedicated Redis Client for BullMQ (needs separate connection for blocking commands)
export const queueRedisClient = new Redis(redisConfig as any, {
    maxRetriesPerRequest: null, // Critical for BullMQ
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
queueRedisClient.on('error', (err) => console.error('Queue Redis Client Error', err));

export const IDEMPOTENCY_PREFIX = 'idemp:';
export const WEBHOOK_PREFIX = 'webhook:';
