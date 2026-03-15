-- Double-entry Ledger Tables
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY,
    reference_id TEXT UNIQUE,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES ledger_transactions(id),
    account_id TEXT NOT NULL,
    amount BIGINT NOT NULL, -- Amount in Paise (integers)
    direction TEXT NOT NULL, -- DEBIT or CREDIT
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);

-- Escrow Tables
CREATE TABLE IF NOT EXISTS escrows (
    project_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    total_amount BIGINT NOT NULL, -- In Paise
    released_amount BIGINT NOT NULL, -- In Paise
    state TEXT NOT NULL,
    submission_id TEXT,
    owner_approved BOOLEAN DEFAULT FALSE,
    worker_submitted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escrows_owner_id ON escrows(owner_id);
CREATE INDEX IF NOT EXISTS idx_escrows_worker_id ON escrows(worker_id);

-- Skill Verification Tables
CREATE TABLE IF NOT EXISTS skills_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    status TEXT NOT NULL, -- VERIFIED, UNVERIFIED, DECLINED
    source TEXT NOT NULL, -- AI_RESUME, GITHUB, MANUAL, CERTIFICATE
    confidence FLOAT DEFAULT 1.0,
    metadata JSONB,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skills_verification_user_id ON skills_verification(user_id);
