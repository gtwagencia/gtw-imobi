-- Grupos de atendimento para roteamento inteligente de leads pela IA
CREATE TABLE IF NOT EXISTS ai_routing_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  group_type    TEXT NOT NULL DEFAULT 'geral',
  -- 'compra_venda' | 'aluguel' | 'empreendimento' | 'plantao' | 'investimento' | 'geral'
  routing_mode  TEXT NOT NULL DEFAULT 'round_robin',
  -- 'round_robin' | 'manual'
  last_assigned_index INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_routing_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES ai_routing_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_routing_groups_workspace ON ai_routing_groups(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routing_group_members_group ON ai_routing_group_members(group_id, is_active);
