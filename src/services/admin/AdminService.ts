import { LedgerService } from '../ledger/LedgerService';

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

        // Infrastructure check (Mocked for in-memory)
        return {
            status: Math.abs(totalSum) < 0.001 ? 'HEALTHY' : 'DEGRADED',
            ledger: {
                totalTransactions: transactions.length,
                isBalanced: Math.abs(totalSum) < 0.001,
                lastChecked: new Date()
            },
            infrastructure: {
                postgres: 'CONNECTED', // Mock
                redis: 'CONNECTED',    // Mock
                queues: {
                    webhookQueue: 0,   // Mock
                    projectionQueue: 0  // Mock
                }
            },
            uptime: Math.floor((Date.now() - this.startTime) / 1000)
        };
    }
}
