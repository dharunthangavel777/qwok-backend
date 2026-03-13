import { LedgerService } from '../ledger/LedgerService';
import { TransactionType, TransactionStatus, LedgerTransaction } from '../../models/ledger';
import { notificationService } from '../NotificationService';

export enum PayoutStatus {
    INITIATED = 'INITIATED',
    PROCESSING = 'PROCESSING',
    SETTLED = 'SETTLED',
    FAILED = 'FAILED',
    REVERSED = 'REVERSED'
}

export interface WithdrawalRequest {
    id: string;
    userId: string;
    amount: number;
    beneficiaryId: string;
    status: PayoutStatus;
    createdAt: Date;
}

export class PayoutService {
    constructor(private ledger: LedgerService) { }

    // In-memory lock for demo. Use Redis in prod.
    private dailyWithdrawals = new Map<string, number>();
    private MAX_DAILY_LIMIT = 50000; // 50k INR

    async addBeneficiary(userId: string, details: any) {
        // Generate a unique beneficiary ID
        const beneficiaryId = `bene_${userId}_${Date.now()}`;

        // TODO: Call Cashfree Payouts API to add beneficiary
        // const response = await cashfree.payouts.addBeneficiary({
        //     beneId: beneficiaryId,
        //     name: details.name,
        //     email: details.email,
        //     phone: details.phone,
        //     bankAccount: details.bankAccount,
        //     ifsc: details.ifsc,
        //     address1: details.address,
        //     city: details.city,
        //     state: details.state,
        //     pincode: details.pincode
        // });

        console.log(`[MOCK] Added beneficiary ${beneficiaryId} for user ${userId}`);

        // Return the ID to be used in withdrawals
        return { beneficiaryId, status: 'ADDED' };
    }

    async initiateWithdrawal(userId: string, amount: number, beneficiaryId: string) {
        // 1. Check Limits & Cooldowns
        const todayUsed = this.dailyWithdrawals.get(userId) || 0;
        if (todayUsed + amount > this.MAX_DAILY_LIMIT) {
            throw new Error('Daily withdrawal limit exceeded');
        }

        // 2. Create Ledger Transaction (Lock Funds)
        // Debit: User Wallet (Liability)
        // Credit: Worker Payable (Liability) -> Funds in transit
        const payoutId = `payout_${userId}_${Date.now()}`;
        const ledgerTxnId = `txn_payout_${payoutId}`;

        // Verify Balance First (Optimistic check, Ledger `recordTransaction` will fail if negative balance is enforced, 
        // but our simple ledger service currently just records. We should add balance check here.)
        const userBalance = await this.ledger.getBalance(`liability:user_wallet:${userId}`);
        if (userBalance < amount) { // Balance is Credit (positive for liability). 
            // Wait, Liability balance: Credit is positive. Debit reduces it.
            // So if Credit Sum - Debit Sum < Amount -> Fail.
            // Assuming getBalance returns the "net value".
            throw new Error('Insufficient wallet funds');
        }

        const transaction: LedgerTransaction = {
            id: ledgerTxnId,
            referenceId: payoutId,
            type: TransactionType.PAYOUT_INIT,
            status: TransactionStatus.POSTED,
            metadata: { userId, beneficiaryId },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: ledgerTxnId,
                    accountId: `liability:user_wallet:${userId}`,
                    direction: 'DEBIT', // Reduce User Wallet
                    amount: amount,
                    currency: 'INR'
                },
                {
                    transactionId: ledgerTxnId,
                    accountId: `liability:worker_payable`, // Increase Payable Liability
                    direction: 'CREDIT',
                    amount: amount,
                    currency: 'INR'
                }
            ]
        };

        await this.ledger.recordTransaction(transaction);

        // 3. Update Payout State -> PROCESSING
        // Save to DB (mock)
        this.dailyWithdrawals.set(userId, todayUsed + amount);

        // 4. Call Cashfree Payout API
        // Implementation of Cashfree call...
        // If Cashfree call fails synchronously:
        //    Reverse Ledger Transaction immediately? Or mark FAILED and run reversal job?
        //    Best practice: Mark FAILED. Return error.

        // 5. Notify User
        await notificationService.sendNotification(
            userId,
            "Payout Initiated! 💰",
            `Your earnings of ₹${amount} are on the way to your account. We’ll notify you once they arrive!`,
            { payoutId },
            "payout_initiated"
        );

        return { payoutId, status: PayoutStatus.PROCESSING };
    }

    async handlePayoutSettled(payoutId: string, amount: number, userId: string) {
        // Triggered by Webhook (TRANSFER_SUCCESS)
        // Debit: Worker Payable
        // Credit: Cashfree Clearing (Asset) NO!
        // Credit: External Bank (Asset) -> Only if we track External Bank.
        // Usually: Credit Cashfree Clearing (Asset) because that asset is gone.

        // Asset:Cashfree_Clearing. Debit = Money In. Credit = Money Out.

        const ledgerTxnId = `txn_settle_${payoutId}`;
        const transaction: LedgerTransaction = {
            id: ledgerTxnId,
            referenceId: payoutId,
            type: TransactionType.PAYOUT_SETTLED,
            status: TransactionStatus.POSTED,
            metadata: { payoutId, userId },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: ledgerTxnId,
                    accountId: 'liability:worker_payable', // Reduce Liability (We paid them)
                    direction: 'DEBIT',
                    amount: amount,
                    currency: 'INR'
                },
                {
                    transactionId: ledgerTxnId,
                    accountId: 'asset:cashfree_clearing', // Reduce Asset (Money left our account)
                    direction: 'CREDIT',
                    amount: amount,
                    currency: 'INR'
                }
            ]
        };

        await this.ledger.recordTransaction(transaction);

        // Notify User
        await notificationService.sendNotification(
            userId,
            "Payout Successful! ✅",
            `Your funds of ₹${amount} have been successfully settled into your account. Enjoy your earnings!`,
            { payoutId },
            "payout_settled"
        );
    }

    async handlePayoutFailed(payoutId: string, userId: string, amount: number) {
        // Triggered by Webhook (TRANSFER_FAILED)
        // Reverse initiation

        const ledgerTxnId = `txn_fail_${payoutId}`;

        // Reversal:
        // Debit: Worker Payable (Clear the pending)
        // Credit: User Wallet (Refund the user)

        const transaction: LedgerTransaction = {
            id: ledgerTxnId,
            referenceId: payoutId,
            type: TransactionType.PAYOUT_FAIL,
            status: TransactionStatus.POSTED,
            metadata: { payoutId, reason: 'reversed' },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: ledgerTxnId,
                    accountId: 'liability:worker_payable',
                    direction: 'DEBIT',
                    amount: amount,
                    currency: 'INR'
                },
                {
                    transactionId: ledgerTxnId,
                    accountId: `liability:user_wallet:${userId}`,
                    direction: 'CREDIT',
                    amount: amount,
                    currency: 'INR'
                }
            ]
        };
        await this.ledger.recordTransaction(transaction);

        // Update Daily Limit? Maybe credit back the limit too.
        const todayUsed = this.dailyWithdrawals.get(userId) || 0;
        this.dailyWithdrawals.set(userId, Math.max(0, todayUsed - amount));

        // Notify User
        await notificationService.sendNotification(
            userId,
            "Payout Failed ❌",
            "We encountered an issue while processing your payout of ₹" + amount + ". The funds have been returned to your wallet.",
            { payoutId },
            "payout_failed"
        );
    }
}
