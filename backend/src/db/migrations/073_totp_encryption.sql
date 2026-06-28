-- Migração 073: Marca que two_factor_secret agora é criptografado na camada de aplicação.
-- Formato: iv_hex:tag_hex:ciphertext_hex (AES-256-GCM)
-- Secrets legados (base32 plain) continuam funcionando durante rotação gradual.
-- Requer env: TOTP_ENCRYPTION_KEY=<64 hex chars = 32 bytes>

COMMENT ON COLUMN users.two_factor_secret IS
  'AES-256-GCM encrypted TOTP secret. Format: iv:tag:ciphertext (hex). '
  'Legacy plain base32 values are still accepted at read time for backward compat. '
  'Requires TOTP_ENCRYPTION_KEY env var (64 hex chars).';
