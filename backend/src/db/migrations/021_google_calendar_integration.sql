-- Google Calendar integration per user
CREATE TABLE IF NOT EXISTS user_google_integrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email  TEXT,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  token_expiry  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Maps ticket → Google Calendar event ID (per assignee)
CREATE TABLE IF NOT EXISTS ticket_google_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_google_integrations_user ON user_google_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_google_events_ticket    ON ticket_google_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_google_events_user      ON ticket_google_events(user_id);
