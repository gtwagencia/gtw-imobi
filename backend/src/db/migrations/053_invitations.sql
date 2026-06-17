-- Convites de organização (para usuários que ainda não têm conta)
CREATE TABLE IF NOT EXISTS invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  token        TEXT NOT NULL UNIQUE,
  invited_by   UUID NOT NULL REFERENCES users(id),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token  ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email, org_id);
