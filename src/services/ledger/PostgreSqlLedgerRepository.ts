import { ILedgerRepository } from './LedgerRepository';
import { LedgerTransaction } from '../../models/ledger';
import pool from '../../config/database';

export class PostgreSqlLedgerRepository implements ILedgerRepository {
    async recordTransaction(transaction: LedgerTransaction): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const txSql = `
                INSERT INTO ledger_transactions (id, reference_id, type, status, description, metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            await client.query(txSql, [
                transaction.id,
                transaction.referenceId,
                transaction.type,
                transaction.status,
                transaction.description,
                JSON.stringify(transaction.metadata || {})
            ]);

            const entrySql = `
                INSERT INTO ledger_entries (transaction_id, account_id, amount, direction)
                VALUES ($1, $2, $3, $4)
            `;
            for (const entry of transaction.entries) {
                await client.query(entrySql, [
                    transaction.id,
                    entry.accountId,
                    Math.round(entry.amount), // Ensure integer (Paise)
                    entry.direction
                ]);
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async getBalance(accountId: string): Promise<number> {
        const sql = `
            SELECT 
                SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) as balance
            FROM ledger_entries
            WHERE account_id = $1
        `;
        const res = await pool.query(sql, [accountId]);
        const balance = res.rows[0]?.balance || '0';
        
        // Liability/Revenue/Equity accounts: Credit is positive usually.
        // ASSET accounts: Debit is positive.
        // The SQL above returns (Credit - Debit).
        // If it's an asset account, we might want to flip it?
        // Let's stick to signed balance where Credit is positive for consistency with double-entry math.
        // UI can interpret based on account type.
        
        return parseInt(balance, 10);
    }

    async getAllTransactions(): Promise<LedgerTransaction[]> {
        const res = await pool.query('SELECT * FROM ledger_transactions ORDER BY created_at DESC LIMIT 100');
        return res.rows.map((row: any) => ({
            id: row.id,
            referenceId: row.reference_id,
            type: row.type,
            status: row.status,
            description: row.description,
            metadata: row.metadata,
            entries: [], // Note: Entries are not loaded here for performance
            createdAt: row.created_at
        }));
    }

    async getDetailedTransactions(filters?: { accountId?: string; limit?: number }): Promise<LedgerTransaction[]> {
        let sql = `
            SELECT t.*, 
                   json_agg(e.*) as entries
            FROM ledger_transactions t
            JOIN ledger_entries e ON t.id = e.transaction_id
        `;
        const params: any[] = [];
        if (filters?.accountId) {
            sql += ` WHERE t.id IN (SELECT transaction_id FROM ledger_entries WHERE account_id = $1)`;
            params.push(filters.accountId);
        }
        sql += ` GROUP BY t.id ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
        params.push(filters?.limit || 50);

        const res = await pool.query(sql, params);
        return res.rows.map((row: any) => ({
            id: row.id,
            referenceId: row.reference_id,
            type: row.type,
            status: row.status,
            description: row.description,
            metadata: row.metadata,
            createdAt: row.created_at,
            entries: row.entries.map((e: any) => ({
                id: e.id,
                transactionId: e.transaction_id,
                accountId: e.account_id,
                direction: e.direction,
                amount: parseInt(e.amount, 10),
                currency: 'INR' // Default or fetch from meta
            }))
        }));
    }

    async getGlobalBalanceSum(): Promise<number> {
        const sql = `SELECT SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) as net_balance FROM ledger_entries`;
        const res = await pool.query(sql);
        return parseInt(res.rows[0]?.net_balance || '0', 10);
    }

    async runAtomic(operation: () => Promise<void>): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await operation();
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}
