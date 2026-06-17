'use strict';

const { query } = require('../../config/database');

// ── Helpers ───────────────────────────────────────────────────────────────

function err(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

// ── listUnits ─────────────────────────────────────────────────────────────
// Retorna unidades de um empreendimento com filtros opcionais.
// filters: { status, zone, block, floor, page, limit }
// Inclui contagens agregadas: total, disponivel, reservado, vendido

async function listUnits(developmentId, workspaceId, {
  status, zone, block, floor, page = 1, limit = 200,
} = {}) {
  const offset = (page - 1) * limit;
  const params = [developmentId, workspaceId];
  let where = 'WHERE p.development_id = $1 AND p.workspace_id = $2';

  if (status) {
    params.push(status);
    where += ` AND p.status = $${params.length}`;
  }
  if (zone) {
    params.push(zone);
    where += ` AND p.price_zone = $${params.length}`;
  }
  if (block) {
    params.push(block);
    where += ` AND p.block_label = $${params.length}`;
  }
  if (floor !== undefined && floor !== null && floor !== '') {
    params.push(parseInt(floor, 10));
    where += ` AND p.unit_floor = $${params.length}`;
  }

  // contagens
  const countRes = await query(
    `SELECT
       COUNT(*)::int                                                        AS total,
       COUNT(*) FILTER (WHERE p.status = 'disponivel')::int                AS disponivel,
       COUNT(*) FILTER (WHERE p.status = 'reservado')::int                 AS reservado,
       COUNT(*) FILTER (WHERE p.status = 'vendido')::int                   AS vendido
     FROM properties p ${where}`,
    params
  );
  const counts = countRes.rows[0];

  params.push(limit, offset);
  const r = await query(
    `SELECT
       p.id, p.code, p.title, p.property_type, p.status, p.sale_price, p.total_area,
       p.block_label, p.lot_label, p.map_shape,
       p.area_front, p.area_depth, p.area_left, p.area_right,
       p.price_per_m2, p.price_zone, p.unit_floor, p.unit_number,
       p.reserved_until, p.reserved_by, p.notes
     FROM properties p
     ${where}
     ORDER BY p.block_label NULLS LAST, p.lot_label NULLS LAST, p.unit_floor NULLS LAST, p.created_at
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, ...counts, page, limit };
}

// ── getUnit ───────────────────────────────────────────────────────────────

async function getUnit(unitId, workspaceId) {
  const r = await query(
    `SELECT p.*
     FROM properties p
     WHERE p.id = $1 AND p.workspace_id = $2`,
    [unitId, workspaceId]
  );
  if (!r.rows.length) throw err('Unidade não encontrada', 404);
  return r.rows[0];
}

// ── updateUnit ────────────────────────────────────────────────────────────
// Campos aceitos: status, sale_price, price_per_m2, price_zone, map_shape,
//   block_label, lot_label, unit_floor, unit_number, area_front, area_depth,
//   area_left, area_right, total_area, reserved_until, reserved_by, notes

const UNIT_FIELD_MAP = {
  status:       'status',
  salePrice:    'sale_price',
  pricePerM2:   'price_per_m2',
  priceZone:    'price_zone',
  mapShape:     'map_shape',
  blockLabel:   'block_label',
  lotLabel:     'lot_label',
  unitFloor:    'unit_floor',
  unitNumber:   'unit_number',
  areaFront:    'area_front',
  areaDepth:    'area_depth',
  areaLeft:     'area_left',
  areaRight:    'area_right',
  totalArea:    'total_area',
  reservedUntil:'reserved_until',
  reservedBy:   'reserved_by',
  notes:        'notes',
};

const UNIT_JSONB_FIELDS = new Set(['mapShape']);

async function updateUnit(unitId, workspaceId, body) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UNIT_FIELD_MAP)) {
    if (body[k] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      vals.push(UNIT_JSONB_FIELDS.has(k) ? JSON.stringify(body[k]) : body[k]);
    }
  }

  if (!fields.length) throw err('Nenhum campo para atualizar');
  vals.push(unitId, workspaceId);

  const r = await query(
    `UPDATE properties SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING id`,
    vals
  );
  if (!r.rows.length) throw err('Unidade não encontrada', 404);
  return getUnit(unitId, workspaceId);
}

// ── bulkPriceAdjust ───────────────────────────────────────────────────────
// mode: 'per_m2'  → sale_price = total_area * value
// mode: 'percent' → sale_price = sale_price * (1 + value/100)
// mode: 'fixed'   → sale_price = value
// zoneFilter e blockFilter são opcionais

async function bulkPriceAdjust(developmentId, workspaceId, {
  mode, value, zoneFilter, blockFilter,
} = {}) {
  if (!['per_m2', 'percent', 'fixed'].includes(mode)) {
    throw err('mode deve ser per_m2, percent ou fixed');
  }
  if (value === undefined || value === null) throw err('value é obrigatório');

  const numValue = parseFloat(value);
  if (isNaN(numValue)) throw err('value deve ser numérico');

  const params = [developmentId, workspaceId];
  let where = 'WHERE development_id = $1 AND workspace_id = $2';

  if (zoneFilter) {
    params.push(zoneFilter);
    where += ` AND price_zone = $${params.length}`;
  }
  if (blockFilter) {
    params.push(blockFilter);
    where += ` AND block_label = $${params.length}`;
  }

  let setClause;
  if (mode === 'per_m2') {
    params.push(numValue);
    setClause = `sale_price = ROUND(total_area * $${params.length}, 2), price_per_m2 = $${params.length}`;
  } else if (mode === 'percent') {
    params.push(numValue);
    setClause = `sale_price = ROUND(sale_price * (1 + $${params.length} / 100.0), 2)`;
  } else {
    params.push(numValue);
    setClause = `sale_price = $${params.length}`;
  }

  const r = await query(
    `UPDATE properties SET ${setClause} ${where} RETURNING id`,
    params
  );
  return { updated: r.rows.length };
}

// ── importCSV ─────────────────────────────────────────────────────────────
// Colunas esperadas: quadra, lote, area_m2, frente, fundo, lateral_e,
//   lateral_d, preco_base, zona, andar, numero_unidade, tipo
// Retorna { created, skipped, errors }

async function importCSV(developmentId, workspaceId, csvText, userId) {
  // Verifica se empreendimento pertence ao workspace
  const devRes = await query(
    'SELECT id, development_type FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);
  const devType = devRes.rows[0].development_type;

  // Parse manual do CSV
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) throw err('CSV vazio ou sem dados');

  // Detecta separador
  const headerLine = lines[0];
  const sep = headerLine.includes(';') ? ';' : ',';

  const headers = headerLine.split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));

  const colIdx = {};
  const COLS = ['quadra', 'lote', 'area_m2', 'frente', 'fundo', 'lateral_e', 'lateral_d',
                 'preco_base', 'zona', 'andar', 'numero_unidade', 'tipo'];
  for (const col of COLS) {
    colIdx[col] = headers.indexOf(col);
  }

  // Busca o próximo número sequencial de código
  const codeRes = await query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 'IM-(\\d+)')::int), 0) AS base
     FROM properties WHERE workspace_id = $1`,
    [workspaceId]
  );
  let nextCode = parseInt(codeRes.rows[0].base, 10) + 1;

  const created = [];
  const skipped = [];
  const errors  = [];

  const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cells = line.split(sep).map(c => c.trim().replace(/"/g, ''));

    const get = (col) => {
      const idx = colIdx[col];
      return idx >= 0 ? (cells[idx] || '').trim() : '';
    };

    try {
      const quadra       = get('quadra');
      const lote         = get('lote');
      const areaM2       = parseFloat(get('area_m2'))   || null;
      const frente       = parseFloat(get('frente'))    || null;
      const fundo        = parseFloat(get('fundo'))     || null;
      const lateralE     = parseFloat(get('lateral_e')) || null;
      const lateralD     = parseFloat(get('lateral_d')) || null;
      const precoBase    = parseFloat(get('preco_base'))|| null;
      const zona         = get('zona')                  || null;
      const andar        = get('andar') ? parseInt(get('andar'), 10) : null;
      const numUnidade   = get('numero_unidade')        || null;
      const tipoCSV      = get('tipo');

      // Determina property_type
      let propertyType;
      if (tipoCSV) {
        propertyType = tipoCSV;
      } else if (devType === 'predio') {
        propertyType = 'apartamento';
      } else {
        propertyType = 'terreno_lote';
      }

      // Título padrão
      const title = quadra && lote
        ? `Quadra ${quadra} Lote ${lote}`
        : numUnidade
          ? `Unidade ${numUnidade}`
          : `Unidade ${i + 1}`;

      // Verifica duplicata por block_label + lot_label no mesmo empreendimento
      if (quadra && lote) {
        const dup = await query(
          `SELECT id FROM properties WHERE development_id = $1 AND block_label = $2 AND lot_label = $3`,
          [developmentId, quadra, lote]
        );
        if (dup.rows.length) {
          skipped.push({ line: i + 2, reason: `Quadra ${quadra} Lote ${lote} já existe` });
          continue;
        }
      }

      const code = `IM-${String(nextCode).padStart(4, '0')}`;
      nextCode++;

      const pricePerM2 = areaM2 && precoBase ? Math.round((precoBase / areaM2) * 100) / 100 : null;

      const r = await query(
        `INSERT INTO properties (
           workspace_id, development_id, code, title, property_type,
           status, purpose, total_area,
           block_label, lot_label,
           area_front, area_depth, area_left, area_right,
           sale_price, price_per_m2, price_zone,
           unit_floor, unit_number,
           created_by
         ) VALUES (
           $1,$2,$3,$4,$5,
           'disponivel','venda',$6,
           $7,$8,
           $9,$10,$11,$12,
           $13,$14,$15,
           $16,$17,
           $18
         ) RETURNING id, code`,
        [
          workspaceId, developmentId, code, title, propertyType,
          areaM2,
          quadra || null, lote || numUnidade || null,
          frente, fundo, lateralE, lateralD,
          precoBase, pricePerM2, zona,
          andar, numUnidade || null,
          userId || null,
        ]
      );

      created.push({ id: r.rows[0].id, code: r.rows[0].code, title });
    } catch (e) {
      errors.push({ line: i + 2, error: e.message });
    }
  }

  return { created: created.length, skipped: skipped.length, errors: errors.length, details: { created, skipped, errors } };
}

// ── listZones ─────────────────────────────────────────────────────────────

async function listZones(developmentId, workspaceId) {
  // Confirma que o empreendimento pertence ao workspace
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  const r = await query(
    `SELECT z.*,
            COUNT(p.id)::int AS units_count
     FROM development_price_zones z
     LEFT JOIN properties p ON p.development_id = z.development_id AND p.price_zone = z.name
     WHERE z.development_id = $1
     GROUP BY z.id
     ORDER BY z.name`,
    [developmentId]
  );
  return r.rows;
}

// ── createZone ────────────────────────────────────────────────────────────

async function createZone(developmentId, workspaceId, body) {
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  const { name, description, modifierType, modifierValue, color } = body;
  if (!name) throw err('name é obrigatório');
  if (!['per_m2', 'fixed', 'percent'].includes(modifierType)) {
    throw err('modifierType deve ser per_m2, fixed ou percent');
  }

  const r = await query(
    `INSERT INTO development_price_zones
       (development_id, name, description, modifier_type, modifier_value, color)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      developmentId,
      name,
      description || null,
      modifierType || 'per_m2',
      modifierValue ?? 0,
      color || '#3b82f6',
    ]
  );
  return r.rows[0];
}

// ── updateZone ────────────────────────────────────────────────────────────

async function updateZone(zoneId, developmentId, workspaceId, body) {
  // Confirma ownership via development
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  const ZONE_FIELD_MAP = {
    name:          'name',
    description:   'description',
    modifierType:  'modifier_type',
    modifierValue: 'modifier_value',
    color:         'color',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(ZONE_FIELD_MAP)) {
    if (body[k] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      vals.push(body[k]);
    }
  }

  if (!fields.length) throw err('Nenhum campo para atualizar');
  vals.push(zoneId, developmentId);

  const r = await query(
    `UPDATE development_price_zones SET ${fields.join(', ')}
     WHERE id = $${idx} AND development_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw err('Zona não encontrada', 404);
  return r.rows[0];
}

// ── deleteZone ────────────────────────────────────────────────────────────

async function deleteZone(zoneId, developmentId, workspaceId) {
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  const r = await query(
    'DELETE FROM development_price_zones WHERE id = $1 AND development_id = $2 RETURNING id',
    [zoneId, developmentId]
  );
  if (!r.rows.length) throw err('Zona não encontrada', 404);
}

// ── applyPriceZone ────────────────────────────────────────────────────────
// Aplica a lógica de preço de uma zona a todas as unidades com price_zone = zoneName

async function applyPriceZone(developmentId, workspaceId, zoneName, zoneConfig) {
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  // Busca config da zona se não fornecida
  let config = zoneConfig;
  if (!config) {
    const zRes = await query(
      'SELECT * FROM development_price_zones WHERE development_id = $1 AND name = $2',
      [developmentId, zoneName]
    );
    if (!zRes.rows.length) throw err('Zona não encontrada', 404);
    config = zRes.rows[0];
  }

  const { modifier_type: modifierType, modifier_value: modifierValue } = config;
  const val = parseFloat(modifierValue);

  let setClause;
  if (modifierType === 'per_m2') {
    setClause = `sale_price = ROUND(total_area * ${val}, 2), price_per_m2 = ${val}`;
  } else if (modifierType === 'fixed') {
    setClause = `sale_price = ${val}`;
  } else if (modifierType === 'percent') {
    setClause = `sale_price = ROUND(sale_price * (1 + ${val} / 100.0), 2)`;
  } else {
    throw err('modifier_type inválido');
  }

  const r = await query(
    `UPDATE properties SET ${setClause}
     WHERE development_id = $1 AND price_zone = $2 AND workspace_id = $3
     RETURNING id`,
    [developmentId, zoneName, workspaceId]
  );
  return { updated: r.rows.length, zone: zoneName };
}

module.exports = {
  listUnits, getUnit, updateUnit, bulkPriceAdjust, importCSV,
  listZones, createZone, updateZone, deleteZone, applyPriceZone,
};
