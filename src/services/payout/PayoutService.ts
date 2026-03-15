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

    private async _cashfreeRequest(endpoint: string, method: string, body?: any) {
        const clientId = process.env.CASHFREE_CLIENT_ID;
        const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://payout-api.cashfree.com/payout/v1' 
            : 'https://payout-gamma.cashfree.com/payout/v1';

        if (!clientId || !clientSecret) {
            throw new Error('Cashfree credentials not configured');
        }

        const headers: any = {
            'X-Client-Id': clientId,
            'X-Client-Secret': clientSecret,
            'Content-Type': 'application/json'
        };

        const response = await fetch(`${baseUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        const data: any = await response.json();
        if (!response.ok || data.status === 'ERROR') {
            throw new Error(`Cashfree Payout Error: ${data.message || response.statusText}`);
        }
        return data;
    }

    // In-memory lock for demo. Use Redis in prod.
    private dailyWithdrawals = new Map<string, number>();
    private MAX_DAILY_LIMIT = 50000; // 50k INR

    async addBeneficiary(userId: string, details: any) {
        // Generate a unique beneficiary ID
        const beneficiaryId = `bene_${userId}_${Date.now()}`;

        await this._cashfreeRequest('/addBeneficiary', 'POST', {
            beneId: beneficiaryId,
            name: details.name,
            email: details.email,
            phone: details.phone,
            bankAccount: details.bankAccount,
            ifsc: details.ifsc,
            vpa: details.vpa, // Support UPI
            address1: details.address || 'N/A',
            city: details.city || 'N/A',
            state: details.state || 'N/A',
            pincode: details.pincode || '000000'
        });

        console.log(`Added real beneficiary ${beneficiaryId} for user ${userId}`);

        // Return the ID to be used in withdrawals
        return { beneficiaryId, status: 'ADDED' };
    }

    async initiateWithdrawal(userId: string, amount: number, beneficiaryId?: string, paymentMethod?: string, details?: any) {
        // 1. Check Limits & Cooldowns
        const todayUsed = this.dailyWithdrawals.get(userId) || 0;
        if (todayUsed + amount > this.MAX_DAILY_LIMIT) {
            throw new Error('Daily withdrawal limit exceeded');
        }

        // 2. Resolve Beneficiary
        let effectiveBeneId = beneficiaryId;
        if (!effectiveBeneId && details) {
            // Auto-create beneficiary if details are provided
            const beneResult = await this.addBeneficiary(userId, {
                name: details.accountHolder || details.name || 'User ' + userId.substring(0, 5),
                email: details.email || `${userId}@qwok.com`, // Fallback for demo
                phone: details.phone || '9999999999',
                bankAccount: details.accountNumber,
                ifsc: details.ifscCode,
                vpa: details.upiId,
                address1: 'N/A'
            });
            effectiveBeneId = beneResult.beneficiaryId;
        }

        if (!effectiveBeneId) {
            throw new Error('Beneficiary ID or payment details required');
        }

        // 3. Create Ledger Transaction (Lock Funds)
        const payoutId = `payout_${userId}_${Date.now()}`;
        const ledgerTxnId = `txn_payout_${payoutId}`;

        const userBalance = await this.ledger.getBalance(`liability:user_wallet:${userId}`);
        if (userBalance < amount) {
            throw new Error('Insufficient wallet funds');
        }

        const transaction: LedgerTransaction = {
            id: ledgerTxnId,
            referenceId: payoutId,
            type: TransactionType.PAYOUT_INIT,
            status: TransactionStatus.POSTED,
            metadata: { userId, beneficiaryId: effectiveBeneId, paymentMethod, amount, payoutId },
            createdAt: new Date(),
            entries: [
                {
                    transactionId: ledgerTxnId,
                    accountId: `liability:user_wallet:${userId}`,
                    direction: 'DEBIT',
                    amount: amount,
                    currency: 'INR'
                },
                {
                    transactionId: ledgerTxnId,
                    accountId: `liability:worker_payable`,
                    direction: 'CREDIT',
                    amount: amount,
                    currency: 'INR'
                }
            ]
        };

        await this.ledger.recordTransaction(transaction);

        // 4. Update Payout State
        this.dailyWithdrawals.set(userId, todayUsed + amount);

        // 5. Call Cashfree Payout API
        const transferMode = paymentMethod === 'upi' ? 'upi' : 'banktransfer';
        await this._cashfreeRequest('/requestTransfer', 'POST', {
            beneId: effectiveBeneId,
            amount: amount,
            transferId: payoutId,
            transferMode
        });
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
