import { LedgerService } from './services/ledger/LedgerService';
import { InMemoryLedgerRepository } from './services/ledger/LedgerRepository';
import { TransactionType, TransactionStatus } from './models/ledger';

async function testLedger() {
    const repo = new InMemoryLedgerRepository();
    const service = new LedgerService(repo);

    console.log('--- Testing Ledger Consistency ---');
    try {
        await service.recordTransaction({
            id: 'tx-1',
            referenceId: 'order-1',
            type: TransactionType.DEPOSIT_ESCROW,
            status: TransactionStatus.POSTED,
            metadata: {},
            createdAt: new Date(),
            entries: [
                { accountId: 'asset:cash', amount: 10000, direction: 'DEBIT', transactionId: 'tx-1', currency: 'INR' },
                { accountId: 'liability:escrow:user-1', amount: 10000, direction: 'CREDIT', transactionId: 'tx-1', currency: 'INR' }
            ]
        });
        console.log('✅ Balanced transaction recorded successfully');
    } catch (e) {
        console.error('❌ Balanced transaction failed:', (e as Error).message);
    }

    try {
        await service.recordTransaction({
            id: 'tx-2',
            referenceId: 'order-2',
            type: TransactionType.DEPOSIT_ESCROW,
            status: TransactionStatus.POSTED,
            metadata: {},
            createdAt: new Date(),
            entries: [
                { accountId: 'asset:cash', amount: 10000, direction: 'DEBIT', transactionId: 'tx-2', currency: 'INR' },
                { accountId: 'liability:escrow:user-1', amount: 9999, direction: 'CREDIT', transactionId: 'tx-2', currency: 'INR' }
            ]
        });
        console.error('❌ Unbalanced transaction was incorrectly accepted');
    } catch (e) {
        console.log('✅ Unbalanced transaction rejected correctly:', (e as Error).message);
    }
}

testLedger();
