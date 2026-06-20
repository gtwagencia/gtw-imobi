ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_contacts_ai_profile ON contacts USING gin(ai_profile);
