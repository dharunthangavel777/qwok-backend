import './env'; // Forces dotenv to load first
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;

console.log('[Redis] Initializing. Config found:', {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || '6379',
    hasPassword: !!process.env.REDIS_PASSWORD,
    hasUrl: !!redisUrl,
    urlPrefix: redisUrl ? redisUrl.substring(0, 10) + '...' : 'none',
    tls: process.env.REDIS_TLS === 'true'
});

const redisOptions: any = redisUrl ? redisUrl : {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    tls: process.env.REDIS_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
};

// Primary Redis Client
export const redisClient = new Redis(redisOptions);

// Dedicated Redis Client for BullMQ
export const queueRedisClient = new Redis(redisOptions, {
    maxRetriesPerRequest: null,
});

let redisErrorReported = false;
let queueRedisErrorReported = false;

redisClient.on('error', (err) => {
    if (!redisErrorReported) {
        console.error('[Redis] Client Error:', err.message);
        redisErrorReported = true;
    }
});
queueRedisClient.on('error', (err) => {
    if (!queueRedisErrorReported) {
        console.error('[Redis-Queue] Client Error:', err.message);
        queueRedisErrorReported = true;
    }
});

redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
    redisErrorReported = false;
});

export const IDEMPOTENCY_PREFIX = 'idemp:';
export const WEBHOOK_PREFIX = 'webhook:';
