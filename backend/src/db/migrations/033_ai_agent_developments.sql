-- ================================================================
-- GTW Imobi — Migração 033: Agente de IA ponta-a-ponta + Empreendimentos
-- ================================================================
-- Suporta:
--  1. Modelo de negócio do workspace (imobiliária x construtora/incorporadora),
--     usado pela Lais para adaptar seu comportamento e ferramentas.
--  2. Roteamento automático de conversas para setores específicos
--     (departments.ai_routing_description).
--  3. Empreendimentos (lançamentos/condomínios) como entidade própria,
--     com galeria de mídia e unidades (properties) vinculadas.
--  4. Controle de visibilidade por foto no site (property_media.show_on_site).

-- ----------------------------------------------------------------
-- WORKSPACES: modelo de negócio
-- ----------------------------------------------------------------
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS business_model TEXT NOT NULL DEFAULT 'imobiliaria';
  -- imobiliaria  -> trabalha com imóveis de terceiros e/ou empreendimentos
  -- construtora  -> trabalha apenas com empreendimentos/unidades próprias

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_business_model_check;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_business_model_check
  CHECK (business_model IN ('imobiliaria', 'construtora'));

-- ----------------------------------------------------------------
-- PROPERTY MEDIA: exibir ou não no site
-- ----------------------------------------------------------------
ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS show_on_site BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------------------------------------------
-- DEPARTMENTS: contexto de roteamento para a IA
-- ----------------------------------------------------------------
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS ai_routing_description TEXT;
  -- Texto livre descrevendo quando transferir a conversa para este setor,
  -- ex: "Financeiro: 2ª via de boleto, pagamentos, inadimplência, distrato."

-- ----------------------------------------------------------------
-- DEVELOPMENTS (empreendimentos/lançamentos)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS developments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Identificação
  code          TEXT NOT NULL, -- gerado automaticamente, ex: EMP-0001
  name          TEXT NOT NULL,
  description   TEXT,
  builder_name  TEXT, -- construtora/incorporadora responsável

  -- Status da obra
  construction_status TEXT NOT NULL DEFAULT 'em_obras', -- lancamento | em_obras | pronto
  delivery_date TIMESTAMPTZ,

  -- Endereço
  zip_code      TEXT,
  street        TEXT,
  number        TEXT,
  complement    TEXT,
  neighborhood  TEXT,
  city          TEXT,
  state         TEXT,
  latitude      NUMERIC(10,6),
  longitude     NUMERIC(10,6),

  -- Comodidades do empreendimento (área comum)
  amenities     TEXT[] NOT NULL DEFAULT '{}',

  -- Publicação
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, code)
);

CREATE TABLE IF NOT EXISTS development_media (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  development_id UUID NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  media_type     TEXT NOT NULL DEFAULT 'image', -- image | video | floorplan | document
  position       INTEGER NOT NULL DEFAULT 0,
  is_cover       BOOLEAN NOT NULL DEFAULT false,
  show_on_site   BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vincula uma unidade (property) ao seu empreendimento
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS development_id UUID REFERENCES developments(id) ON DELETE SET NULL;

-- Vincula um negócio (deal) a um empreendimento quando o lead é sobre um
-- lançamento (e não sobre uma unidade específica)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS development_id UUID REFERENCES developments(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_developments_workspace     ON developments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_development_media_dev      ON development_media(development_id, position);
CREATE INDEX IF NOT EXISTS idx_properties_development     ON properties(development_id) WHERE development_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_development          ON deals(development_id) WHERE development_id IS NOT NULL;

-- ----------------------------------------------------------------
-- TRIGGERS: updated_at automático
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_developments_updated ON developments;
CREATE TRIGGER trg_developments_updated BEFORE UPDATE ON developments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
