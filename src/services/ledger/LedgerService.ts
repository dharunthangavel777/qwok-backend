import { ILedgerRepository } from './LedgerRepository';
import { LedgerTransaction, LedgerEntry, AccountType } from '../../models/ledger';

export class LedgerService {
    constructor(private repository: ILedgerRepository) { }

    /**
     * Records a double-entry transaction.
     * Enforces SUM(DEBITS) == SUM(CREDITS).
     * Updates account balances atomically.
     */
    async recordTransaction(transaction: LedgerTransaction): Promise<void> {
        // 1. Validate Invariants
        this.validateDoubleEntry(transaction);

        // 2. Execute Atomically
        await this.repository.runAtomic(async () => {
            // a. Save Transaction Record
            await this.repository.recordTransaction(transaction);
        });
    }

    async getBalance(accountId: string): Promise<number> {
        return this.repository.getBalance(accountId);
    }

    async getAllTransactions(): Promise<LedgerTransaction[]> {
        return this.repository.getAllTransactions();
    }

    async getDetailedTransactions(filters?: { accountId?: string; limit?: number }): Promise<LedgerTransaction[]> {
        return this.repository.getDetailedTransactions(filters);
    }

    private validateDoubleEntry(transaction: LedgerTransaction): void {
        let sumDebits = 0;
        let sumCredits = 0;

        for (const entry of transaction.entries) {
            if (entry.direction === 'DEBIT') {
                sumDebits += entry.amount;
            } else {
                sumCredits += entry.amount;
            }
        }

        if (sumDebits !== sumCredits) {
            throw new Error(`Ledger Invariant Violated: Sum of Debits (${sumDebits}) != Sum of Credits (${sumCredits})`);
        }

        if (sumDebits <= 0) {
            throw new Error(`Ledger Error: Transaction amount must be positive`);
        }
    }

    async checkBalanceInvariant(): Promise<{ balanced: boolean; netBalance: number }> {
        const netBalance = await this.repository.getGlobalBalanceSum();
        return {
            balanced: netBalance === 0,
            netBalance
        };
    }

    private getAccountTypeFromId(accountId: string): string {
        // ID convention: "type:name:id"
        // e.g., "liability:user_wallet:123" -> liability -> LIABILITY
        // e.g., "asset:cashfree_clearing" -> asset -> ASSET
        const parts = accountId.split(':');
        if (parts.length < 1) return 'LIABILITY'; // Default/Fallback or Error

        const typeStr = parts[0].toUpperCase();
        return typeStr;
    }
}
