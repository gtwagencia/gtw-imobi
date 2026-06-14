-- ================================================================
-- GTW Imobi — Migração 035: deduplicação de leads por telefone
-- normalizado entre canais (WhatsApp, Instagram, formulário do site...)
-- ================================================================

-- ----------------------------------------------------------------
-- Função utilitária: normaliza um telefone brasileiro para um formato
-- canônico (DDD + número, sempre com o 9º dígito do celular), permitindo
-- comparar números recebidos em formatos diferentes:
--   "5511999998888", "11999998888", "11 99999-8888", "551199998888"
--   (sem o 9º dígito, formato antigo), "11999998888@s.whatsapp.net" etc.
-- Para números que não se encaixam no padrão BR, retorna só os dígitos.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION gtw_normalize_phone_br(raw TEXT)
RETURNS TEXT AS $$
DECLARE
  digits    TEXT;
  ddd       TEXT;
  local_num TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;

  digits := regexp_replace(split_part(raw, '@', 1), '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;

  -- Remove o código do país do Brasil (55), se vier junto com DDD + número
  IF left(digits, 2) = '55' AND length(digits) IN (12, 13) THEN
    digits := substring(digits FROM 3);
  END IF;

  -- DDD (2 dígitos) + número local — adiciona o 9º dígito do celular quando
  -- ausente (formato antigo: DDD + 8 dígitos começando em 6-9)
  IF length(digits) IN (10, 11) THEN
    ddd       := left(digits, 2);
    local_num := substring(digits FROM 3);
    IF length(local_num) = 8 AND left(local_num, 1) IN ('6','7','8','9') THEN
      local_num := '9' || local_num;
    END IF;
    digits := ddd || local_num;
  END IF;

  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------
-- CONTACTS: coluna phone_normalized, mantida automaticamente via trigger
-- ----------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

UPDATE contacts SET phone_normalized = gtw_normalize_phone_br(phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION gtw_contacts_set_phone_normalized()
RETURNS TRIGGER AS $$
BEGIN
  NEW.phone_normalized := gtw_normalize_phone_br(NEW.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_phone_normalized ON contacts;
CREATE TRIGGER trg_contacts_phone_normalized
  BEFORE INSERT OR UPDATE OF phone ON contacts
  FOR EACH ROW EXECUTE FUNCTION gtw_contacts_set_phone_normalized();

CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON contacts(workspace_id, phone_normalized);
