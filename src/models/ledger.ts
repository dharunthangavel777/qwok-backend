export enum AccountType {
    ASSET = 'ASSET',
    LIABILITY = 'LIABILITY',
    EQUITY = 'EQUITY',
    REVENUE = 'REVENUE',
    EXPENSE = 'EXPENSE',
}

export enum TransactionType {
    DEPOSIT_ESCROW = 'DEPOSIT_ESCROW',
    ESCROW_RELEASE = 'ESCROW_RELEASE',
    PLATFORM_FEE = 'PLATFORM_FEE',
    TAX = 'TAX',
    PAYOUT_INIT = 'PAYOUT_INIT',
    PAYOUT_SETTLED = 'PAYOUT_SETTLED',
    PAYOUT_FAIL = 'PAYOUT_FAIL',
    REFUND = 'REFUND',
    MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

export enum TransactionStatus {
    PENDING = 'PENDING',
    POSTED = 'POSTED',
    VOIDED = 'VOIDED',
}

export interface LedgerAccount {
    id: string; // e.g., 'liability:user_wallet:123'
    type: AccountType;
    currency: string;
    balance: number; // Current balance (cached/aggregated)
    updatedAt: Date;
}

export interface LedgerEntry {
    id?: string;
    transactionId: string;
    accountId: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    currency: string;
}

export interface LedgerTransaction {
    id: string;
    referenceId: string; // Order ID, Payout ID
    type: TransactionType;
    status: TransactionStatus;
    description?: string;
    metadata: Record<string, any>;
    createdAt: Date;
    entries: LedgerEntry[];
}
