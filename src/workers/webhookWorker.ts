import { Worker, Job } from 'bullmq';
import { queueRedisClient, redisClient } from '../config/redis';
import { ledgerService } from '../services';
import { TransactionType, TransactionStatus, LedgerTransaction } from '../models/ledger';

// Initialize Services (Dependency Injection would be better here)
// ledgerService is now imported from central provider (src/services/index.ts)

export const webhookWorker = new Worker('cashfree-webhooks', async (job: Job) => {
    const { eventId, eventType, payload } = job.data;
    console.log(`Processing Webhook Job ${job.id}: ${eventType}`);

    try {
        switch (eventType) {
            case 'PAYMENT_SUCCESS_WEBHOOK':
                await handlePaymentSuccess(payload);
                break;

            case 'TRANSFER_SUCCESS_WEBHOOK': // Payout Success
                await handlePayoutSuccess(payload);
                break;

            case 'TRANSFER_FAILED_WEBHOOK': // Payout Failed
            case 'TRANSFER_REVERSED_WEBHOOK':
                await handlePayoutFailure(payload);
                break;

            default:
                console.warn(`Unhandled Webhook Type: ${eventType}`);
        }
    } catch (error) {
        console.error(`Webhook Processing Failed: ${error}`);
        throw error; // Triggers BullMQ retry
    }
}, {
    connection: queueRedisClient,
    concurrency: 5 // Parallel processing
});

async function handlePaymentSuccess(payload: any) {
    const data = payload.data;
    const orderId = data.order.order_id;
    const orderAmount = parseFloat(data.payment.payment_amount);
    const currency = data.payment.payment_currency;

    // 1. Validation Logic
    // Check if Order exists in DB (Mock check)
    // Check if Amount matches (Mock check)

    // 2. Create Ledger Transaction (Deposit)
    // Debit: Cashfree Clearing (Asset)
    // Credit: Escrow Liability (Liability) -> User Funds
    // Credit: Platform Fees (Revenue)
    // Credit: Tax Payable (Liability)

    // Simplified Calculation (Real logic needs tax rules)
    const fee = orderAmount * 0.05; // 5% platform fee
    const tax = fee * 0.18; // 18% GST on Fee
    const netEscrow = orderAmount; // Actually, usually User deposits X, we hold X. Fees might be deducted or added.
    // Let's assume Deposit = Project Value. Fees are separate or we deduct now?
    // Enterprise V3: Deposit 1050 -> 1000 Escrow, 50 Fee/Tax.

    // Logic: We recorded "Expected Amount" in Order. We match it here.
    // Assuming 1000 Principal + 50 Fee.

    const transaction: LedgerTransaction = {
        id: `txn_${orderId}`,
        referenceId: orderId,
        type: TransactionType.DEPOSIT_ESCROW,
        status: TransactionStatus.POSTED,
        metadata: { source: 'WEBHOOK', provider_ref: data.payment.cf_payment_id },
        createdAt: new Date(),
        entries: [
            {
                transactionId: `txn_${orderId}`,
                accountId: 'asset:cashfree_clearing',
                direction: 'DEBIT',
                amount: orderAmount,
                currency
            },
            {
                transactionId: `txn_${orderId}`,
                accountId: 'liability:escrow_account',
                direction: 'CREDIT',
                amount: orderAmount - fee - tax, // Principal
                currency
            },
            {
                transactionId: `txn_${orderId}`,
                accountId: 'revenue:platform_fees',
                direction: 'CREDIT',
                amount: fee,
                currency
            },
            {
                transactionId: `txn_${orderId}`,
                accountId: 'liability:tax_payable',
                direction: 'CREDIT',
                amount: tax,
                currency
            }
        ]
    };

    // 3. Record to Ledger
    await ledgerService.recordTransaction(transaction);

    // 4. Trigger Escrow State Machine (Update Project Status to FUNDED)
    // TODO: Call ProjectService.updateStatus(funded)
    console.log(`Escrow Funded for Order ${orderId}`);
}

async function handlePayoutSuccess(payload: any) {
    // Logic: Debit Worker Payable, Credit Bank (or Cashfree Clearing if pre-funded)
    // Actually:
    // Payout Request: Debit Wallet, Credit Payable (Pending)
    // Payout Success: Debit Payable, Credit Cashfree Clearing (Asset)
    console.log('Handling Payout Success', payload.data.transfer_id);
}

async function handlePayoutFailure(payload: any) {
    // Logic: Reverse! 
    // Debit Payable, Credit Wallet
    console.log('Handling Payout Failure - REVERSING', payload.data.transfer_id);
}
