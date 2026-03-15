import { Queue, Worker, QueueEvents } from 'bullmq';
import { queueRedisClient, redisClient } from '../config/redis';

// Webhook Queue - Buffers incoming webhooks from Cashfree
export const webhookQueue = new Queue('cashfree-webhooks', {
    connection: queueRedisClient,
    defaultJobOptions: {
        attempts: 5, // Retry up to 5 times
        backoff: {
            type: 'exponential',
            delay: 1000, // 1s, 2s, 4s, 8s, 16s
        },
        removeOnComplete: true,
    },
});
webhookQueue.on('error', (err) => console.error('[webhookQueue] Error:', err.message));

// Projection Queue - Buffers Ledger updates to be synced to Firestore
export const projectionQueue = new Queue('firestore-projections', {
    connection: queueRedisClient,
    defaultJobOptions: {
        attempts: 10, // Higher retry for projection as it must eventually succeed
        backoff: {
            type: 'exponential',
            delay: 500,
        },
        removeOnComplete: true,
    },
});
projectionQueue.on('error', (err) => console.error('[projectionQueue] Error:', err.message));

// Resume AI Parsing Queue
export const resumeQueue = new Queue('resume-parsing', {
    connection: queueRedisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { count: 100 }, // Keep last 100 results for polling
        removeOnFail: { count: 50 },
    },
});
resumeQueue.on('error', (err) => console.error('[resumeQueue] Error:', err.message));

// Setup Queue Events for monitoring
export const webhookQueueEvents = new QueueEvents('cashfree-webhooks', { connection: queueRedisClient });
export const projectionQueueEvents = new QueueEvents('firestore-projections', { connection: queueRedisClient });
export const resumeQueueEvents = new QueueEvents('resume-parsing', { connection: queueRedisClient });

webhookQueueEvents.on('error', (err) => console.error('[webhookQueueEvents] Error:', err.message));
projectionQueueEvents.on('error', (err) => console.error('[projectionQueueEvents] Error:', err.message));
resumeQueueEvents.on('error', (err) => console.error('[resumeQueueEvents] Error:', err.message));

webhookQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`Webhook Job ${jobId} failed: ${failedReason}`);
    // In production: Alert to Slack/PagerDuty
});

projectionQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`Projection Job ${jobId} failed: ${failedReason}`);
});

resumeQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[Resume] Job ${jobId} failed: ${failedReason}`);
});
