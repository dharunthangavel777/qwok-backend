import { LedgerTransaction, LedgerEntry, AccountType } from '../../models/ledger';

export interface ILedgerRepository {
    recordTransaction(transaction: LedgerTransaction): Promise<void>;
    getBalance(accountId: string): Promise<number>;
    getAllTransactions(): Promise<LedgerTransaction[]>;
    getDetailedTransactions(filters?: { accountId?: string; limit?: number }): Promise<LedgerTransaction[]>;
    getGlobalBalanceSum(): Promise<number>;
    // ensure consistency in transaction
    runAtomic(operation: () => Promise<void>): Promise<void>;
}

// Mock In-Memory Repository for demonstration/initial logic testing
// In Production: Replace with PostgresLedgerRepository or FirestoreLedgerRepository
export class InMemoryLedgerRepository implements ILedgerRepository {
    private transactions: LedgerTransaction[] = [];
    private balances = new Map<string, number>();

    async recordTransaction(transaction: LedgerTransaction): Promise<void> {
        this.transactions.push(transaction);

        // Update aggregated balances
        for (const entry of transaction.entries) {
            const current = this.balances.get(entry.accountId) || 0;
            // DEBIT = Increase for Assets, Decrease for Liabilities (usually)
            // But for simple "balance" view:
            // Asset: Debit (+), Credit (-)
            // Liability: Credit (+), Debit (-)
            // Revenue: Credit (+)
            // Expense: Debit (+)

            // To simplify: We store "Signed Balance" from perspective of the account type? 
            // Or just raw Debit/Credit sums?
            // Let's implement simple signed arithmetic based on account type name prefix for now.

            let change = 0;
            if (entry.accountId.startsWith('asset:')) {
                change = entry.direction === 'DEBIT' ? entry.amount : -entry.amount;
            } else {
                // Liabilities, Revenue, Equity -> Credit is Positive
                change = entry.direction === 'CREDIT' ? entry.amount : -entry.amount;
            }

            this.balances.set(entry.accountId, current + change);
        }
    }

    async getBalance(accountId: string): Promise<number> {
        return this.balances.get(accountId) || 0;
    }

    async getAllTransactions(): Promise<LedgerTransaction[]> {
        return [...this.transactions];
    }

    async getDetailedTransactions(filters?: { accountId?: string; limit?: number }): Promise<LedgerTransaction[]> {
        let list = [...this.transactions];
        if (filters?.accountId) {
            list = list.filter(tx => tx.entries.some(e => e.accountId === filters.accountId));
        }
        return list.slice(0, filters?.limit || 100);
    }

    async getGlobalBalanceSum(): Promise<number> {
        let sum = 0;
        for (const tx of this.transactions) {
            for (const entry of tx.entries) {
                sum += (entry.direction === 'CREDIT' ? entry.amount : -entry.amount);
            }
        }
        return sum;
    }

    async runAtomic(operation: () => Promise<void>): Promise<void> {
        // In-memory is inherently atomic for synchronous parts, but async wise...
        // simpler to just execute for now
        await operation();
    }
}
