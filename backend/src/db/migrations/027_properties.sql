-- ================================================================
-- GTW Imobi — Migração 027: Módulo de Imóveis
-- ================================================================

-- ----------------------------------------------------------------
-- PROPERTIES (cadastro de imóveis)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Identificação
  code          TEXT NOT NULL, -- gerado automaticamente, ex: IM-0001
  title         TEXT NOT NULL,
  description   TEXT,

  -- Classificação
  property_type TEXT NOT NULL DEFAULT 'apartamento', -- apartamento | casa | casa_condominio | cobertura | kitnet_studio | sobrado | terreno_lote | sala_comercial | loja | galpao | predio_comercial | fazenda_sitio_chacara | outro
  purpose       TEXT NOT NULL DEFAULT 'venda',       -- venda | locacao | venda_locacao | temporada
  status        TEXT NOT NULL DEFAULT 'disponivel',  -- disponivel | reservado | vendido | alugado | inativo

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
  hide_address  BOOLEAN NOT NULL DEFAULT false, -- oculta endereço exato em divulgações públicas

  -- Valores
  sale_price    NUMERIC(14,2),
  rent_price    NUMERIC(14,2),
  condo_fee     NUMERIC(14,2),
  iptu          NUMERIC(14,2),

  -- Características
  total_area    NUMERIC(10,2),
  built_area    NUMERIC(10,2),
  bedrooms      INTEGER,
  bathrooms     INTEGER,
  suites        INTEGER,
  parking_spots INTEGER,
  floor_number  INTEGER,
  year_built    INTEGER,

  -- Comodidades
  amenities     TEXT[] NOT NULL DEFAULT '{}',

  -- Responsáveis
  owner_id      UUID REFERENCES contacts(id) ON DELETE SET NULL, -- proprietário
  broker_id     UUID REFERENCES users(id)    ON DELETE SET NULL, -- corretor responsável
  scout_id      UUID REFERENCES users(id)    ON DELETE SET NULL, -- captador

  -- Publicação
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  views_count   INTEGER NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, code)
);

-- ----------------------------------------------------------------
-- PROPERTY MEDIA (galeria de fotos/vídeos/plantas)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS property_media (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  media_type   TEXT NOT NULL DEFAULT 'image', -- image | video | floorplan | document
  position     INTEGER NOT NULL DEFAULT 0,
  is_cover     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_properties_workspace ON properties(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_properties_type      ON properties(workspace_id, property_type);
CREATE INDEX IF NOT EXISTS idx_properties_purpose   ON properties(workspace_id, purpose);
CREATE INDEX IF NOT EXISTS idx_properties_city      ON properties(workspace_id, city);
CREATE INDEX IF NOT EXISTS idx_properties_owner     ON properties(owner_id)  WHERE owner_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_broker    ON properties(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_media_property ON property_media(property_id, position);

-- ----------------------------------------------------------------
-- TRIGGERS: updated_at automático
-- ----------------------------------------------------------------
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
