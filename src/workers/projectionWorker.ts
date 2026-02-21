import { Worker, Job } from 'bullmq';
import { queueRedisClient } from '../config/redis';
import { FirestoreRepository } from '../services/firestore/FirestoreRepository';

const firestoreRepo = new FirestoreRepository();

export const projectionWorker = new Worker('firestore-projections', async (job: Job) => {
    const { type, data } = job.data;
    console.log(`Processing Projection Job ${job.id}: ${type}`);

    try {
        switch (type) {
            case 'BALANCE_UPDATE':
                await firestoreRepo.updateWalletBalance(data.userId, data.newBalance);
                break;
            case 'ESCROW_UPDATE':
                await firestoreRepo.updateEscrowStatus(data.projectId, data.status, data.balance);
                break;
            case 'TRANSACTION_RECORD':
                await firestoreRepo.addTransactionRecord(data.userId, data.record);
                break;
            default:
                console.warn(`Unknown Projection Type: ${type}`);
        }
    } catch (error) {
        console.error(`Projection Failed: ${error}`);
        throw error; // Trigger retry
    }
}, {
    connection: queueRedisClient,
    concurrency: 5
});
