'use strict';

const { query } = require('../../config/database');

// ── Geração de código sequencial (EMP-0001, EMP-0002, ...) ──────────────────

async function generateCode(workspaceId) {
  const r = await query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 'EMP-(\\d+)')::int), 0) + 1 AS next
     FROM developments WHERE workspace_id = $1`,
    [workspaceId]
  );
  return `EMP-${String(r.rows[0].next).padStart(4, '0')}`;
}

// ── List ──────────────────────────────────────────────────────────────────

async function list(workspaceId, {
  search, constructionStatus, city, page = 1, limit = 50,
} = {}) {
  const offset = (page - 1) * limit;
  const params = [workspaceId];
  let where = 'WHERE d.workspace_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (d.name ILIKE $${params.length} OR d.code ILIKE $${params.length} OR d.neighborhood ILIKE $${params.length} OR d.city ILIKE $${params.length})`;
  }
  if (constructionStatus) {
    params.push(constructionStatus);
    where += ` AND d.construction_status = $${params.length}`;
  }
  if (city) {
    params.push(`%${city}%`);
    where += ` AND d.city ILIKE $${params.length}`;
  }

  const countRes = await query(`SELECT COUNT(*) FROM developments d ${where}`, params);
  const total    = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT d.*,
            (SELECT dm.url FROM development_media dm
              WHERE dm.development_id = d.id AND dm.is_cover = true LIMIT 1) AS cover_url,
            (SELECT COUNT(*) FROM properties p WHERE p.development_id = d.id)::int AS units_count
     FROM developments d
     ${where}
     ORDER BY d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

// ── Get by id ─────────────────────────────────────────────────────────────

async function getById(developmentId, workspaceId) {
  const r = await query(
    `SELECT d.* FROM developments d WHERE d.id = $1 AND d.workspace_id = $2`,
    [developmentId, workspaceId]
  );
  if (!r.rows.length) return null;

  const media = await query(
    'SELECT * FROM development_media WHERE development_id = $1 ORDER BY position ASC, created_at ASC',
    [developmentId]
  );
  const units = await query(
    `SELECT id, code, title, property_type, purpose, status, sale_price, rent_price, bedrooms,
            (SELECT pm.url FROM property_media pm WHERE pm.property_id = properties.id AND pm.is_cover = true LIMIT 1) AS cover_url
     FROM properties WHERE development_id = $1 ORDER BY created_at DESC`,
    [developmentId]
  );

  return { ...r.rows[0], media: media.rows, units: units.rows };
}

// ── Get by code ───────────────────────────────────────────────────────────

async function getByCode(workspaceId, code) {
  const r = await query('SELECT id FROM developments WHERE workspace_id = $1 AND code = $2', [workspaceId, code]);
  if (!r.rows.length) return null;

  const development = await getById(r.rows[0].id, workspaceId);
  const coverRes = await query(
    `SELECT url FROM development_media WHERE development_id = $1 AND is_cover = true LIMIT 1`,
    [development.id]
  );
  return { ...development, cover_url: coverRes.rows[0]?.url || null };
}

// ── Create ────────────────────────────────────────────────────────────────

async function create(workspaceId, body) {
  const code = await generateCode(workspaceId);
  const {
    name, description, builderName,
    constructionStatus, deliveryDate,
    zipCode, street, number, complement, neighborhood, city, state, latitude, longitude,
    amenities, isFeatured,
  } = body;

  const r = await query(
    `INSERT INTO developments (
       workspace_id, code, name, description, builder_name,
       construction_status, delivery_date,
       zip_code, street, number, complement, neighborhood, city, state, latitude, longitude,
       amenities, is_featured
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,
       $8,$9,$10,$11,$12,$13,$14,$15,$16,
       $17,$18
     ) RETURNING *`,
    [
      workspaceId, code, name, description || null, builderName || null,
      constructionStatus || 'em_obras', deliveryDate || null,
      zipCode || null, street || null, number || null, complement || null, neighborhood || null, city || null, state || null, latitude ?? null, longitude ?? null,
      amenities || [], isFeatured || false,
    ]
  );
  return r.rows[0];
}

// ── Update ────────────────────────────────────────────────────────────────

const UPDATE_FIELD_MAP = {
  name: 'name', description: 'description', builderName: 'builder_name',
  constructionStatus: 'construction_status', deliveryDate: 'delivery_date',
  zipCode: 'zip_code', street: 'street', number: 'number', complement: 'complement',
  neighborhood: 'neighborhood', city: 'city', state: 'state',
  latitude: 'latitude', longitude: 'longitude',
  amenities: 'amenities',
  isFeatured: 'is_featured', publishedAt: 'published_at',
};

async function update(developmentId, workspaceId, body) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  vals.push(developmentId, workspaceId);

  const r = await query(
    `UPDATE developments SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING id`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Empreendimento não encontrado'), { status: 404 });
  return getById(developmentId, workspaceId);
}

// ── Remove ────────────────────────────────────────────────────────────────

async function remove(developmentId, workspaceId) {
  const r = await query(
    'DELETE FROM developments WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [developmentId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Empreendimento não encontrado'), { status: 404 });
}

// ── Media ─────────────────────────────────────────────────────────────────

async function assertDevelopmentExists(developmentId, workspaceId) {
  const r = await query('SELECT id FROM developments WHERE id = $1 AND workspace_id = $2', [developmentId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Empreendimento não encontrado'), { status: 404 });
}

async function addMedia(developmentId, workspaceId, { url, mediaType }) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const posRes = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next, COUNT(*)::int AS cnt FROM development_media WHERE development_id = $1',
    [developmentId]
  );
  const { next, cnt } = posRes.rows[0];

  const r = await query(
    `INSERT INTO development_media (development_id, url, media_type, position, is_cover)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [developmentId, url, mediaType || 'image', next, cnt === 0]
  );
  return r.rows[0];
}

async function removeMedia(mediaId, developmentId, workspaceId) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const removed = await query(
    'DELETE FROM development_media WHERE id = $1 AND development_id = $2 RETURNING is_cover',
    [mediaId, developmentId]
  );
  if (!removed.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });

  if (removed.rows[0].is_cover) {
    const next = await query(
      'SELECT id FROM development_media WHERE development_id = $1 ORDER BY position ASC LIMIT 1',
      [developmentId]
    );
    if (next.rows.length) {
      await query('UPDATE development_media SET is_cover = true WHERE id = $1', [next.rows[0].id]);
    }
  }
}

async function reorderMedia(developmentId, workspaceId, orderedIds) {
  await assertDevelopmentExists(developmentId, workspaceId);

  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE development_media SET position = $1 WHERE id = $2 AND development_id = $3',
      [i, orderedIds[i], developmentId]
    );
  }
}

async function setCover(mediaId, developmentId, workspaceId) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const media = await query('SELECT id FROM development_media WHERE id = $1 AND development_id = $2', [mediaId, developmentId]);
  if (!media.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });

  await query('UPDATE development_media SET is_cover = false WHERE development_id = $1', [developmentId]);
  await query('UPDATE development_media SET is_cover = true WHERE id = $1', [mediaId]);
}

async function setShowOnSite(mediaId, developmentId, workspaceId, showOnSite) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const r = await query(
    'UPDATE development_media SET show_on_site = $1 WHERE id = $2 AND development_id = $3 RETURNING id',
    [showOnSite, mediaId, developmentId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });
}

module.exports = {
  list, getById, getByCode, create, update, remove,
  addMedia, removeMedia, reorderMedia, setCover, setShowOnSite,
};
