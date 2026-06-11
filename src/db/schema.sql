-- Vanguard Growth Backend - PostgreSQL Schema

-- Enable uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CLIENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    business_name   VARCHAR(255) NOT NULL,
    whatsapp_number VARCHAR(50) NOT NULL,
    industry        VARCHAR(100) NOT NULL DEFAULT 'other',
    qualifying_question TEXT NOT NULL DEFAULT 'What made you interested in our services today?',
    calendly_link   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(50) NOT NULL,
    email           VARCHAR(255),
    source          VARCHAR(100) DEFAULT 'meta-ads',
    ai_tag          VARCHAR(10) DEFAULT 'UNKNOWN' CHECK (ai_tag IN ('HOT', 'WARM', 'COLD', 'UNKNOWN')),
    status          VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'active', 'appointment_set', 'converted', 'dead', 'cancelled')),
    follow_up_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    appointment_date TIMESTAMPTZ,
    ai_reason       TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_ai_tag ON leads(ai_tag);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    direction   VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content     TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);

-- ============================================================================
-- FOLLOW_UP_JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS follow_up_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    follow_up_number INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_lead_id ON follow_up_jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_status ON follow_up_jobs(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_scheduled_at ON follow_up_jobs(scheduled_at);

-- ============================================================================
-- AUTO-UPDATE FUNCTION for updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update triggers
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();