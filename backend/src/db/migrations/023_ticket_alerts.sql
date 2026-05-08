-- In-app alert table for @mentions and ticket assignments
CREATE TABLE IF NOT EXISTS ticket_alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  ticket_id   UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_id    UUID        NOT NULL,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('assigned','mention','due_today')),
  message     TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_alerts_user   ON ticket_alerts(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ticket_alerts_ticket ON ticket_alerts(ticket_id);
