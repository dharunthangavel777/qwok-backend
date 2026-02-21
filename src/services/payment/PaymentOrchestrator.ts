import { LedgerService } from '../ledger/LedgerService';
import { EscrowService, EscrowState } from '../escrow/EscrowService';
import { TransactionType, TransactionStatus, LedgerTransaction } from '../../models/ledger';

export class PaymentOrchestrator {
    constructor(
        private ledger: LedgerService,
        private escrow: EscrowService
    ) { }

    async createPaymentOrder(projectId: string, bidAmount: number, userId: string): Promise<any> {
        const platformFee = Math.round(bidAmount * 0.05 * 100) / 100;
        const tax = Math.round(platformFee * 0.18 * 100) / 100;
        const totalPayable = bidAmount + platformFee + tax;

        try {
            await this.escrow.createEscrow(projectId, bidAmount);
        } catch (e) { }

        const orderId = `order_${projectId}_${Date.now()}`;
        const paymentSessionId = `session_${orderId}_enc`;

        return {
            orderId,
            paymentSessionId,
            amount: totalPayable,
            currency: 'INR',
            breakdown: { bid: bidAmount, fee: platformFee, tax: tax }
        };
    }

    async releaseFunds(projectId: string, amount: number, workerId: string) {
        await this.escrow.recordRelease(projectId, amount);

        const pId = `txn_rel_${projectId}_${Date.now()}`;
        const txn: LedgerTransaction = {
            id: pId,
            referenceId: projectId,
            type: TransactionType.ESCROW_RELEASE,
            status: TransactionStatus.POSTED,
            metadata: { projectId, workerId },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: pId,
                    accountId: `liability:escrow_account`,
                    direction: 'DEBIT',
                    amount: amount,
                    currency: 'INR'
                },
                {
                    transactionId: pId,
                    accountId: `liability:user_wallet:${workerId}`,
                    direction: 'CREDIT',
                    amount: amount,
                    currency: 'INR'
                }
            ]
        };
        await this.ledger.recordTransaction(txn);
    }

    async resolveDispute(projectId: string, terminalAction: 'RELEASE' | 'REFUND', workerId: string) {
        const p = await this.escrow.getProject(projectId);
        if (!p) throw new Error('Project not found');

        const remainingAmount = p.totalAmount - p.releasedAmount;
        if (remainingAmount <= 0) throw new Error('No remaining funds to resolve');

        const terminalState = terminalAction === 'RELEASE' ? EscrowState.RELEASED : EscrowState.REFUNDED;
        await this.escrow.resolveDispute(projectId, terminalState);

        const txnId = `txn_dispute_${projectId}_${Date.now()}`;
        const targetAccount = terminalAction === 'RELEASE'
            ? `liability:user_wallet:${workerId}`
            : `asset:cashfree_clearing`;

        const transaction: LedgerTransaction = {
            id: txnId,
            referenceId: projectId,
            type: TransactionType.ESCROW_RELEASE,
            status: TransactionStatus.POSTED,
            metadata: { projectId, terminalAction, workerId },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: txnId,
                    accountId: 'liability:escrow_account',
                    direction: 'DEBIT',
                    amount: remainingAmount,
                    currency: 'INR'
                },
                {
                    transactionId: txnId,
                    accountId: targetAccount,
                    direction: 'CREDIT',
                    amount: remainingAmount,
                    currency: 'INR'
                }
            ]
        };

        await this.ledger.recordTransaction(transaction);
    }
}
