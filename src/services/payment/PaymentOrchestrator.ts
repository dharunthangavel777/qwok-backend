import { LedgerService } from '../ledger/LedgerService';
import { EscrowService, EscrowState } from '../escrow/EscrowService';
import { TransactionType, TransactionStatus, LedgerTransaction } from '../../models/ledger';
import { notificationService } from '../NotificationService';

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
            await this.escrow.createEscrow(projectId, bidAmount, userId, 'worker_placeholder'); // Assuming workerId can be passed here
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

        // Notify Worker
        await notificationService.sendNotification(
            workerId,
            "Funds Released 💰",
            `Success! The funds of ₹${amount} held in escrow have been released to your wallet.`,
            { projectId },
            "escrow_released"
        );
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

        // Notify Both Parties
        const pData = await this.escrow.getProject(projectId);
        const recipientIds = [pData?.workerId, pData?.ownerId].filter(id => id !== undefined);

        for (const recipientId of recipientIds) {
            await notificationService.sendNotification(
                recipientId!,
                "Dispute Resolved ✅",
                `The dispute regarding your project has been resolved. Action taken: ${terminalAction}.`,
                { projectId, action: terminalAction },
                "dispute_resolved"
            );
        }
    }
}
