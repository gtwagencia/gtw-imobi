'use strict';

const { query } = require('../../config/database');

// ── Geração de código sequencial (IM-0001, IM-0002, ...) ────────────────────

async function generateCode(workspaceId) {
  const r = await query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 'IM-(\\d+)')::int), 0) + 1 AS next
     FROM properties WHERE workspace_id = $1`,
    [workspaceId]
  );
  return `IM-${String(r.rows[0].next).padStart(4, '0')}`;
}

// ── List ──────────────────────────────────────────────────────────────────

async function list(workspaceId, {
  search, type, purpose, status, city,
  minPrice, maxPrice, bedrooms, ownerId, brokerId,
  page = 1, limit = 50,
} = {}) {
  const offset = (page - 1) * limit;
  const params = [workspaceId];
  let where = 'WHERE p.workspace_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (p.title ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.neighborhood ILIKE $${params.length} OR p.city ILIKE $${params.length})`;
  }
  if (type) {
    params.push(type);
    where += ` AND p.property_type = $${params.length}`;
  }
  if (purpose) {
    params.push(purpose);
    where += ` AND p.purpose = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND p.status = $${params.length}`;
  }
  if (city) {
    params.push(`%${city}%`);
    where += ` AND p.city ILIKE $${params.length}`;
  }
  if (bedrooms) {
    params.push(bedrooms);
    where += ` AND p.bedrooms >= $${params.length}`;
  }
  if (ownerId) {
    params.push(ownerId);
    where += ` AND p.owner_id = $${params.length}`;
  }
  if (brokerId) {
    params.push(brokerId);
    where += ` AND p.broker_id = $${params.length}`;
  }
  if (minPrice != null) {
    params.push(minPrice);
    where += ` AND COALESCE(p.sale_price, p.rent_price, 0) >= $${params.length}`;
  }
  if (maxPrice != null) {
    params.push(maxPrice);
    where += ` AND COALESCE(p.sale_price, p.rent_price, 0) <= $${params.length}`;
  }

  const countRes = await query(`SELECT COUNT(*) FROM properties p ${where}`, params);
  const total    = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT p.*,
            (SELECT pm.url FROM property_media pm
              WHERE pm.property_id = p.id AND pm.is_cover = true LIMIT 1) AS cover_url,
            owner.name  AS owner_name,
            broker.name AS broker_name
     FROM properties p
     LEFT JOIN contacts owner ON owner.id = p.owner_id
     LEFT JOIN users broker   ON broker.id = p.broker_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

// ── Get by id ─────────────────────────────────────────────────────────────

async function getById(propertyId, workspaceId) {
  const r = await query(
    `SELECT p.*,
            owner.name  AS owner_name,
            broker.name AS broker_name,
            scout.name  AS scout_name
     FROM properties p
     LEFT JOIN contacts owner ON owner.id = p.owner_id
     LEFT JOIN users broker   ON broker.id = p.broker_id
     LEFT JOIN users scout    ON scout.id = p.scout_id
     WHERE p.id = $1 AND p.workspace_id = $2`,
    [propertyId, workspaceId]
  );
  if (!r.rows.length) return null;

  const media = await query(
    'SELECT * FROM property_media WHERE property_id = $1 ORDER BY position ASC, created_at ASC',
    [propertyId]
  );

  return { ...r.rows[0], media: media.rows };
}

// ── Feed (integração com o site) ─────────────────────────────────────────

/**
 * Imóveis disponíveis para publicação no feed XML do site, com fotos.
 */
async function listForFeed(workspaceId) {
  const r = await query(
    `SELECT p.*, owner.name AS owner_name, broker.name AS broker_name
     FROM properties p
     LEFT JOIN contacts owner ON owner.id = p.owner_id
     LEFT JOIN users broker   ON broker.id = p.broker_id
     WHERE p.workspace_id = $1 AND p.status = 'disponivel'
     ORDER BY p.created_at DESC`,
    [workspaceId]
  );
  if (!r.rows.length) return [];

  const ids = r.rows.map(p => p.id);
  const mediaRes = await query(
    `SELECT * FROM property_media
     WHERE property_id = ANY($1) AND media_type = 'image'
     ORDER BY property_id, position ASC`,
    [ids]
  );
  const mediaByProperty = {};
  for (const m of mediaRes.rows) {
    (mediaByProperty[m.property_id] ||= []).push(m);
  }

  return r.rows.map(p => ({ ...p, media: mediaByProperty[p.id] || [] }));
}

// ── Get by code ───────────────────────────────────────────────────────────

async function getByCode(workspaceId, code) {
  const r = await query('SELECT id FROM properties WHERE workspace_id = $1 AND code = $2', [workspaceId, code]);
  if (!r.rows.length) return null;

  const property = await getById(r.rows[0].id, workspaceId);
  const coverRes = await query(
    `SELECT url FROM property_media WHERE property_id = $1 AND is_cover = true LIMIT 1`,
    [property.id]
  );
  return { ...property, cover_url: coverRes.rows[0]?.url || null };
}

// ── Create ────────────────────────────────────────────────────────────────

async function create(workspaceId, body) {
  const code = await generateCode(workspaceId);
  const {
    title, description,
    propertyType, purpose, status,
    zipCode, street, number, complement, neighborhood, city, state, latitude, longitude, hideAddress,
    salePrice, rentPrice, condoFee, iptu,
    totalArea, builtArea, bedrooms, bathrooms, suites, parkingSpots, floorNumber, yearBuilt,
    amenities,
    ownerId, brokerId, scoutId, developmentId,
    isFeatured,
  } = body;

  const r = await query(
    `INSERT INTO properties (
       workspace_id, code, title, description,
       property_type, purpose, status,
       zip_code, street, number, complement, neighborhood, city, state, latitude, longitude, hide_address,
       sale_price, rent_price, condo_fee, iptu,
       total_area, built_area, bedrooms, bathrooms, suites, parking_spots, floor_number, year_built,
       amenities, owner_id, broker_id, scout_id, development_id, is_featured
     ) VALUES (
       $1,$2,$3,$4, $5,$6,$7,
       $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
       $18,$19,$20,$21,
       $22,$23,$24,$25,$26,$27,$28,$29,
       $30,$31,$32,$33,$34,$35
     ) RETURNING *`,
    [
      workspaceId, code, title, description || null,
      propertyType || 'apartamento', purpose || 'venda', status || 'disponivel',
      zipCode || null, street || null, number || null, complement || null, neighborhood || null, city || null, state || null, latitude ?? null, longitude ?? null, hideAddress || false,
      salePrice ?? null, rentPrice ?? null, condoFee ?? null, iptu ?? null,
      totalArea ?? null, builtArea ?? null, bedrooms ?? null, bathrooms ?? null, suites ?? null, parkingSpots ?? null, floorNumber ?? null, yearBuilt ?? null,
      amenities || [], ownerId || null, brokerId || null, scoutId || null, developmentId || null, isFeatured || false,
    ]
  );
  return r.rows[0];
}

// ── Update ────────────────────────────────────────────────────────────────

const UPDATE_FIELD_MAP = {
  title: 'title', description: 'description',
  propertyType: 'property_type', purpose: 'purpose', status: 'status',
  zipCode: 'zip_code', street: 'street', number: 'number', complement: 'complement',
  neighborhood: 'neighborhood', city: 'city', state: 'state',
  latitude: 'latitude', longitude: 'longitude', hideAddress: 'hide_address',
  salePrice: 'sale_price', rentPrice: 'rent_price', condoFee: 'condo_fee', iptu: 'iptu',
  totalArea: 'total_area', builtArea: 'built_area',
  bedrooms: 'bedrooms', bathrooms: 'bathrooms', suites: 'suites',
  parkingSpots: 'parking_spots', floorNumber: 'floor_number', yearBuilt: 'year_built',
  amenities: 'amenities',
  ownerId: 'owner_id', brokerId: 'broker_id', scoutId: 'scout_id', developmentId: 'development_id',
  isFeatured: 'is_featured', publishedAt: 'published_at',
};

async function update(propertyId, workspaceId, body) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  vals.push(propertyId, workspaceId);

  const r = await query(
    `UPDATE properties SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING id`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });
  return getById(propertyId, workspaceId);
}

// ── Remove ────────────────────────────────────────────────────────────────

async function remove(propertyId, workspaceId) {
  const r = await query(
    'DELETE FROM properties WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [propertyId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });
}

// ── Media ─────────────────────────────────────────────────────────────────

async function assertPropertyExists(propertyId, workspaceId) {
  const r = await query('SELECT id FROM properties WHERE id = $1 AND workspace_id = $2', [propertyId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });
}

async function addMedia(propertyId, workspaceId, { url, mediaType }) {
  await assertPropertyExists(propertyId, workspaceId);

  const posRes = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next, COUNT(*)::int AS cnt FROM property_media WHERE property_id = $1',
    [propertyId]
  );
  const { next, cnt } = posRes.rows[0];

  const r = await query(
    `INSERT INTO property_media (property_id, url, media_type, position, is_cover)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [propertyId, url, mediaType || 'image', next, cnt === 0]
  );
  return r.rows[0];
}

async function removeMedia(mediaId, propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);

  const removed = await query(
    'DELETE FROM property_media WHERE id = $1 AND property_id = $2 RETURNING is_cover',
    [mediaId, propertyId]
  );
  if (!removed.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });

  if (removed.rows[0].is_cover) {
    const next = await query(
      'SELECT id FROM property_media WHERE property_id = $1 ORDER BY position ASC LIMIT 1',
      [propertyId]
    );
    if (next.rows.length) {
      await query('UPDATE property_media SET is_cover = true WHERE id = $1', [next.rows[0].id]);
    }
  }
}

async function reorderMedia(propertyId, workspaceId, orderedIds) {
  await assertPropertyExists(propertyId, workspaceId);

  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE property_media SET position = $1 WHERE id = $2 AND property_id = $3',
      [i, orderedIds[i], propertyId]
    );
  }
}

async function setCover(mediaId, propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);

  const media = await query('SELECT id FROM property_media WHERE id = $1 AND property_id = $2', [mediaId, propertyId]);
  if (!media.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });

  await query('UPDATE property_media SET is_cover = false WHERE property_id = $1', [propertyId]);
  await query('UPDATE property_media SET is_cover = true WHERE id = $1', [mediaId]);
}

async function setShowOnSite(mediaId, propertyId, workspaceId, showOnSite) {
  await assertPropertyExists(propertyId, workspaceId);

  const r = await query(
    'UPDATE property_media SET show_on_site = $1 WHERE id = $2 AND property_id = $3 RETURNING id',
    [showOnSite, mediaId, propertyId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Mídia não encontrada'), { status: 404 });
}

module.exports = {
  list, getById, getByCode, create, update, remove,
  addMedia, removeMedia, reorderMedia, setCover, setShowOnSite,
  listForFeed,
};
