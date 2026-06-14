-- ================================================================
-- GTW Imobi — Migração 028: Perfis de permissão personalizados
-- ================================================================
-- Adiciona os roles 'captador' e 'auxiliar_administrativo' em
-- workspace_memberships e cria a tabela permission_profiles, que guarda
-- um mapa de permissões (módulo -> visível/oculto) por perfil/workspace.

-- ----------------------------------------------------------------
-- Novos roles permitidos em workspace_memberships
-- ----------------------------------------------------------------
ALTER TABLE workspace_memberships
  DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;

ALTER TABLE workspace_memberships
  ADD CONSTRAINT workspace_memberships_role_check
  CHECK (role IN ('admin', 'agent', 'member', 'tickets_only', 'captador', 'auxiliar_administrativo'));

-- ----------------------------------------------------------------
-- PERMISSION_PROFILES (um perfil por role-slug, por workspace)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permission_profiles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  permissions  JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_permission_profiles_workspace ON permission_profiles(workspace_id);

CREATE TRIGGER trg_permission_profiles_updated
  BEFORE UPDATE ON permission_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- Backfill: cria os 6 perfis padrão para cada workspace já existente
-- ----------------------------------------------------------------
INSERT INTO permission_profiles (workspace_id, slug, name, is_system, permissions)
SELECT w.id, p.slug, p.name, p.is_system, p.permissions::jsonb
FROM workspaces w
CROSS JOIN (VALUES
  ('admin',  'Administrador', true,
    '{"conversations":true,"contacts":true,"properties":true,"kanban":true,"broadcasts":true,"inboxes":true,"departments":true,"canned":true,"labels":true,"reports":true}'),
  ('tickets_only', 'Somente Tickets', true,
    '{"conversations":false,"contacts":false,"properties":false,"kanban":false,"broadcasts":false,"inboxes":false,"departments":false,"canned":false,"labels":false,"reports":false}'),
  ('agent', 'Corretor', false,
    '{"conversations":true,"contacts":true,"properties":true,"kanban":false,"broadcasts":false,"inboxes":false,"departments":false,"canned":false,"labels":false,"reports":false}'),
  ('member', 'Membro', false,
    '{"conversations":true,"contacts":true,"properties":true,"kanban":false,"broadcasts":false,"inboxes":false,"departments":false,"canned":false,"labels":false,"reports":false}'),
  ('captador', 'Captador', false,
    '{"conversations":false,"contacts":true,"properties":true,"kanban":false,"broadcasts":false,"inboxes":false,"departments":false,"canned":false,"labels":false,"reports":false}'),
  ('auxiliar_administrativo', 'Auxiliar Administrativo', false,
    '{"conversations":true,"contacts":true,"properties":true,"kanban":true,"broadcasts":true,"inboxes":true,"departments":true,"canned":true,"labels":true,"reports":true}')
) AS p(slug, name, is_system, permissions)
ON CONFLICT (workspace_id, slug) DO NOTHING;
