ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS meta_source_url TEXT;
