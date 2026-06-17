ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_password_token   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
