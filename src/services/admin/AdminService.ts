import { LedgerService } from '../ledger/LedgerService';
import pool from '../../config/database';
import { redisClient } from '../../config/redis';
import { webhookQueue, projectionQueue } from '../../queues';

export interface SystemHealth {
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    ledger: {
        totalTransactions: number;
        isBalanced: boolean;
        lastChecked: Date;
    };
    infrastructure: {
        postgres: 'CONNECTED' | 'DISCONNECTED';
        redis: 'CONNECTED' | 'DISCONNECTED';
        queues: {
            webhookQueue: number;
            projectionQueue: number;
        };
    };
    uptime: number;
}

export class AdminService {
    private startTime: number;

    constructor(private ledger: LedgerService) {
        this.startTime = Date.now();
    }

    async getSystemHealth(): Promise<SystemHealth> {
        const transactions = await this.ledger.getAllTransactions();

        // Ledger Integrity Check
        let totalSum = 0;
        for (const txn of transactions) {
            for (const entry of txn.entries) {
                totalSum += entry.direction === 'DEBIT' ? -entry.amount : entry.amount;
            }
        }

        // Real Infrastructure Checks
        let postgresStatus: 'CONNECTED' | 'DISCONNECTED' = 'DISCONNECTED';
        try {
            await pool.query('SELECT 1');
            postgresStatus = 'CONNECTED';
        } catch (e) {
            console.error('[Health] Postgres Check Failed:', e);
        }

        let redisStatus: 'CONNECTED' | 'DISCONNECTED' = 'DISCONNECTED';
        try {
            await redisClient.ping();
            redisStatus = 'CONNECTED';
        } catch (e) {
            console.error('[Health] Redis Check Failed:', e);
        }

        // Queue counts
        let webhookCount = 0;
        let projectionCount = 0;
        try {
            webhookCount = await webhookQueue.count();
            projectionCount = await projectionQueue.count();
        } catch (e) {
            console.error('[Health] Queue Count Failed:', e);
        }

        const isLedgerBalanced = Math.abs(totalSum) < 0.001;
        const isHealthy = isLedgerBalanced && postgresStatus === 'CONNECTED' && redisStatus === 'CONNECTED';

        return {
            status: isHealthy ? 'HEALTHY' : (postgresStatus === 'DISCONNECTED' || redisStatus === 'DISCONNECTED' ? 'DOWN' : 'DEGRADED'),
            ledger: {
                totalTransactions: transactions.length,
                isBalanced: isLedgerBalanced,
                lastChecked: new Date()
            },
            infrastructure: {
                postgres: postgresStatus,
                redis: redisStatus,
                queues: {
                    webhookQueue: webhookCount,
                    projectionQueue: projectionCount
                }
            },
            uptime: Math.floor((Date.now() - this.startTime) / 1000)
        };
    }
}
