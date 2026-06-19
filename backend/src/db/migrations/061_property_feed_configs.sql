-- Feed configs: URLs salvas para sincronização automática de imóveis

CREATE TABLE IF NOT EXISTS property_feed_configs (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source         TEXT        NOT NULL,                   -- praedium | imoview | kenlo | ...
  url            TEXT        NOT NULL,
  interval_hours INTEGER     NOT NULL DEFAULT 24,        -- 1 | 6 | 12 | 24
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  last_run_at    TIMESTAMPTZ,
  last_result    JSONB,                                  -- { created_count, updated_count, error_count, total }
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_feed_configs_workspace
  ON property_feed_configs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_property_feed_configs_due
  ON property_feed_configs(is_active, last_run_at)
  WHERE is_active = true;

CREATE TRIGGER trg_property_feed_configs_updated
  BEFORE UPDATE ON property_feed_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
