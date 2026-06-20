'use strict';

const { query, pool } = require('../../config/database');

async function list(workspaceId, {
  search, tags, contactType, brokerId,
  aiCity, aiDevelopment, aiPerfil, aiTipoImovel,
  hasAiProfile,
  page = 1, limit = 50,
} = {}) {
  const offset = (page - 1) * limit;
  const params = [workspaceId];
  let where = 'WHERE c.workspace_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }

  if (tags?.length) {
    params.push(tags);
    where += ` AND c.tags && $${params.length}::text[]`;
  }

  if (contactType?.length) {
    params.push(contactType);
    where += ` AND c.contact_type && $${params.length}::text[]`;
  }

  if (brokerId) {
    params.push(brokerId);
    where += ` AND c.assigned_broker_id = $${params.length}`;
  }

  // Filtros por perfil de IA
  if (hasAiProfile) {
    where += ` AND c.ai_profile != '{}'::jsonb`;
  }
  if (aiCity) {
    params.push(aiCity);
    where += ` AND c.ai_profile->>'cidade_interesse' ILIKE $${params.length}`;
  }
  if (aiDevelopment) {
    params.push(aiDevelopment);
    where += ` AND c.ai_profile->>'empreendimento_interesse' ILIKE $${params.length}`;
  }
  if (aiPerfil) {
    params.push(aiPerfil);
    where += ` AND c.ai_profile->>'perfil' = $${params.length}`;
  }
  if (aiTipoImovel) {
    params.push(aiTipoImovel);
    where += ` AND c.ai_profile->>'tipo_imovel' ILIKE $${params.length}`;
  }

  const countRes = await query(`SELECT COUNT(*) FROM contacts c ${where}`, params);
  const total    = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT c.*,
            ab.name       AS assigned_broker_name,
            ab.avatar_url AS assigned_broker_avatar,
            COUNT(DISTINCT conv.id)::int AS conversation_count,
            COUNT(DISTINCT d.id)::int    AS deal_count
     FROM contacts c
     LEFT JOIN users ab ON ab.id = c.assigned_broker_id
     LEFT JOIN conversations conv ON conv.contact_id = c.id
     LEFT JOIN deals d ON d.contact_id = c.id
     ${where}
     GROUP BY c.id, ab.name, ab.avatar_url
     ORDER BY c.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

async function getById(contactId, workspaceId) {
  const r = await query(
    `SELECT c.*, ab.name AS assigned_broker_name, ab.avatar_url AS assigned_broker_avatar
     FROM contacts c
     LEFT JOIN users ab ON ab.id = c.assigned_broker_id
     WHERE c.id = $1 AND c.workspace_id = $2`,
    [contactId, workspaceId]
  );
  return r.rows[0] || null;
}

/**
 * Atualiza um contato já existente com dados de um novo lead que chegou por
 * outro canal/formato de telefone (mesmo número, normalizado). Preenche
 * apenas campos vazios — nunca sobrescreve dados já preenchidos — e une tags.
 */
async function mergeIncomingIntoExisting(existing, body) {
  const {
    name, email, avatarUrl,
    metaLeadId, metaCampaignId, metaAdsetId, metaAdId, metaFormId,
    utmSource, utmCampaign, utmMedium,
    tags, notes,
  } = body;

  // Contatos criados via WhatsApp sem nome salvo recebem o próprio telefone
  // como nome (ver webhooks.router.js) — nesse caso, um nome real vindo de
  // outro canal pode substituí-lo.
  const hasPlaceholderName = !existing.name || existing.name === existing.phone;
  const mergedTags = Array.from(new Set([...(existing.tags || []), ...(tags || [])]));

  const r = await query(
    `UPDATE contacts SET
       name             = $1,
       email            = COALESCE(email, $2),
       avatar_url       = COALESCE(avatar_url, $3),
       meta_lead_id     = COALESCE(meta_lead_id, $4),
       meta_campaign_id = COALESCE(meta_campaign_id, $5),
       meta_adset_id    = COALESCE(meta_adset_id, $6),
       meta_ad_id       = COALESCE(meta_ad_id, $7),
       meta_form_id     = COALESCE(meta_form_id, $8),
       utm_source       = COALESCE(utm_source, $9),
       utm_campaign     = COALESCE(utm_campaign, $10),
       utm_medium       = COALESCE(utm_medium, $11),
       notes            = COALESCE(notes, $12),
       tags             = $13,
       updated_at       = NOW()
     WHERE id = $14
     RETURNING *`,
    [
      hasPlaceholderName && name ? name : existing.name,
      email || null, avatarUrl || null, metaLeadId || null,
      metaCampaignId || null, metaAdsetId || null, metaAdId || null, metaFormId || null,
      utmSource || null, utmCampaign || null, utmMedium || null,
      notes || null, mergedTags, existing.id,
    ]
  );
  return r.rows[0];
}

async function create(workspaceId, body) {
  const {
    name, phone, email, avatarUrl,
    metaLeadId, metaCampaignId, metaAdsetId, metaAdId, metaFormId,
    utmSource, utmCampaign, utmMedium,
    tags, notes, customFields,
    contactType, documentType, documentNumber, assignedBrokerId,
  } = body;

  // Mesmo telefone em outro formato (com/sem 9º dígito, com/sem +55, outro
  // canal) já cadastrado? Reaproveita o contato existente em vez de criar um
  // duplicado — é a mesma pessoa entrando em contato por outro meio.
  if (phone) {
    const dup = await query(
      `SELECT * FROM contacts
       WHERE workspace_id = $1
         AND phone_normalized = gtw_normalize_phone_br($2)
         AND phone_normalized IS NOT NULL
         AND phone IS DISTINCT FROM $2
       LIMIT 1`,
      [workspaceId, phone]
    );
    if (dup.rows[0]) return mergeIncomingIntoExisting(dup.rows[0], body);
  }

  const r = await query(
    `INSERT INTO contacts
       (workspace_id, name, phone, email, avatar_url,
        meta_lead_id, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id,
        utm_source, utm_campaign, utm_medium,
        tags, notes, custom_fields,
        contact_type, document_type, document_number, assigned_broker_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (workspace_id, phone) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email,
           meta_lead_id = COALESCE(EXCLUDED.meta_lead_id, contacts.meta_lead_id),
           updated_at = NOW()
     RETURNING *`,
    [workspaceId, name, phone || null, email || null, avatarUrl || null,
      metaLeadId || null, metaCampaignId || null, metaAdsetId || null,
      metaAdId || null, metaFormId || null,
      utmSource || null, utmCampaign || null, utmMedium || null,
      tags || [], notes || null, customFields || {},
      contactType || [], documentType || null, documentNumber || null, assignedBrokerId || null]
  );
  return r.rows[0];
}

async function update(contactId, workspaceId, body) {
  const map = {
    name: 'name', phone: 'phone', email: 'email', avatarUrl: 'avatar_url',
    tags: 'tags', notes: 'notes', customFields: 'custom_fields',
    contactType: 'contact_type', documentType: 'document_type',
    documentNumber: 'document_number', assignedBrokerId: 'assigned_broker_id',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  vals.push(contactId, workspaceId);

  const r = await query(
    `UPDATE contacts SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING id`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  return getById(contactId, workspaceId);
}

async function remove(contactId, workspaceId) {
  const r = await query(
    'DELETE FROM contacts WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [contactId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
}

// ── Deduplicação por telefone ────────────────────────────────────────────────

/**
 * Lista grupos de contatos que compartilham o mesmo telefone normalizado
 * (ex: registros antigos criados antes da deduplicação automática, ou
 * cadastros manuais com formatos diferentes do mesmo número).
 */
async function listDuplicates(workspaceId) {
  const r = await query(
    `SELECT c.id, c.name, c.phone, c.phone_normalized, c.email, c.tags,
            c.contact_type, c.created_at,
            COUNT(DISTINCT conv.id)::int AS conversation_count,
            COUNT(DISTINCT d.id)::int    AS deal_count
     FROM contacts c
     LEFT JOIN conversations conv ON conv.contact_id = c.id
     LEFT JOIN deals d ON d.contact_id = c.id
     WHERE c.workspace_id = $1
       AND c.phone_normalized IN (
         SELECT phone_normalized FROM contacts
         WHERE workspace_id = $1 AND phone_normalized IS NOT NULL
         GROUP BY phone_normalized HAVING COUNT(*) > 1
       )
     GROUP BY c.id
     ORDER BY c.phone_normalized, c.created_at`,
    [workspaceId]
  );

  const groups = new Map();
  for (const row of r.rows) {
    const key = row.phone_normalized;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([phoneNormalized, contacts]) => ({ phoneNormalized, contacts }));
}

/**
 * Mescla `duplicateId` em `primaryId`: reatribui conversas, negócios, visitas,
 * tickets, eventos de conversão e imóveis (proprietário) para o contato
 * principal, une tags/dados em branco e remove o contato duplicado.
 */
async function mergeContacts(workspaceId, primaryId, duplicateId) {
  if (primaryId === duplicateId) {
    throw Object.assign(new Error('Selecione dois contatos diferentes para mesclar'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT * FROM contacts WHERE id = ANY($1::uuid[]) AND workspace_id = $2 FOR UPDATE`,
      [[primaryId, duplicateId], workspaceId]
    );
    if (r.rows.length !== 2) {
      throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
    }
    const primary   = r.rows.find(c => c.id === primaryId);
    const duplicate = r.rows.find(c => c.id === duplicateId);

    // Reatribui referências do contato duplicado para o principal
    await client.query('UPDATE deals               SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
    await client.query('UPDATE conversations       SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
    await client.query('UPDATE meta_conversion_events SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
    await client.query('UPDATE tickets             SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
    await client.query('UPDATE property_visits     SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
    await client.query('UPDATE properties          SET owner_id   = $1 WHERE owner_id   = $2', [primaryId, duplicateId]);

    // broadcast_contacts tem UNIQUE(broadcast_id, contact_id) — remove do duplicado
    // os envios que colidiriam com os do principal antes de reatribuir o restante
    await client.query(
      `DELETE FROM broadcast_contacts bc
       WHERE bc.contact_id = $2
         AND EXISTS (SELECT 1 FROM broadcast_contacts p WHERE p.contact_id = $1 AND p.broadcast_id = bc.broadcast_id)`,
      [primaryId, duplicateId]
    );
    await client.query('UPDATE broadcast_contacts SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);

    // Preenche campos vazios do principal com dados do duplicado e une tags/custom_fields
    const mergedTags = Array.from(new Set([...(primary.tags || []), ...(duplicate.tags || [])]));
    await client.query(
      `UPDATE contacts SET
         email            = COALESCE(email, $1),
         avatar_url       = COALESCE(avatar_url, $2),
         meta_lead_id     = COALESCE(meta_lead_id, $3),
         meta_campaign_id = COALESCE(meta_campaign_id, $4),
         meta_adset_id    = COALESCE(meta_adset_id, $5),
         meta_ad_id       = COALESCE(meta_ad_id, $6),
         meta_form_id     = COALESCE(meta_form_id, $7),
         utm_source       = COALESCE(utm_source, $8),
         utm_campaign     = COALESCE(utm_campaign, $9),
         utm_medium       = COALESCE(utm_medium, $10),
         notes            = COALESCE(notes, $11),
         tags             = $12,
         custom_fields    = $13::jsonb || custom_fields,
         updated_at       = NOW()
       WHERE id = $14`,
      [
        duplicate.email, duplicate.avatar_url, duplicate.meta_lead_id,
        duplicate.meta_campaign_id, duplicate.meta_adset_id, duplicate.meta_ad_id, duplicate.meta_form_id,
        duplicate.utm_source, duplicate.utm_campaign, duplicate.utm_medium,
        duplicate.notes, mergedTags, JSON.stringify(duplicate.custom_fields || {}), primaryId,
      ]
    );

    await client.query('DELETE FROM contacts WHERE id = $1', [duplicateId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getById(primaryId, workspaceId);
}

async function listConversations(contactId, workspaceId) {
  const r = await query(
    `SELECT c.id, c.status, c.created_at, c.last_message_at, c.last_message_text,
            c.unread_count, c.assignee_id, c.sla_breached,
            i.name AS inbox_name,
            u.name AS assignee_name
     FROM conversations c
     JOIN inboxes i ON i.id = c.inbox_id
     LEFT JOIN users u ON u.id = c.assignee_id
     WHERE c.contact_id = $1 AND c.workspace_id = $2
     ORDER BY c.last_message_at DESC NULLS LAST`,
    [contactId, workspaceId]
  );
  return r.rows;
}

// ── CSV Import ──────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function cleanPhone(raw) {
  if (!raw) return null;
  // Remove @s.whatsapp.net e sufixo de dispositivo :XX
  return raw.replace(/@s\.whatsapp\.net$/i, '').replace(/:\d+$/, '').replace(/\D/g, '') || null;
}

// Mapeamento flexível de nomes de colunas
const COL_MAP = {
  name:  ['nome', 'name', 'contato', 'contact'],
  phone: ['telefone', 'phone', 'fone', 'celular', 'whatsapp', 'tel'],
  email: ['email', 'e-mail', 'mail'],
  tags:  ['tags', 'tag', 'etiquetas', 'label'],
  notes: ['notas', 'notes', 'observacoes', 'observações', 'obs'],
};

function detectColumn(headers, aliases) {
  return headers.findIndex(h =>
    aliases.some(alias => h.toLowerCase().replace(/[^a-z]/g, '').includes(alias.replace(/[^a-z]/g, '')))
  );
}

async function csvImport(workspaceId, csvText, { defaultTag } = {}) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw Object.assign(new Error('CSV deve ter ao menos um cabeçalho e uma linha de dados'), { status: 400 });

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());

  const colIdx = {
    name:  detectColumn(headers, COL_MAP.name),
    phone: detectColumn(headers, COL_MAP.phone),
    email: detectColumn(headers, COL_MAP.email),
    tags:  detectColumn(headers, COL_MAP.tags),
    notes: detectColumn(headers, COL_MAP.notes),
  };

  const results = { imported: 0, updated: 0, errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const fields     = parseCsvLine(lines[i]);
    const rawPhone   = colIdx.phone >= 0 ? fields[colIdx.phone] : null;
    const cleanedPhone = cleanPhone(rawPhone);
    const rawName    = colIdx.name  >= 0 ? fields[colIdx.name]  : null;
    const name       = rawName?.trim() || cleanedPhone;
    const email      = colIdx.email >= 0 ? fields[colIdx.email] : null;
    const csvTags    = colIdx.tags  >= 0 && fields[colIdx.tags]
      ? fields[colIdx.tags].split(';').map(t => t.trim()).filter(Boolean)
      : [];
    const tags       = defaultTag && !csvTags.includes(defaultTag) ? [...csvTags, defaultTag] : csvTags;
    const notes      = colIdx.notes >= 0 ? fields[colIdx.notes] : null;

    if (!name?.trim()) { results.errors.push({ line: i + 1, error: 'Nome e telefone ausentes' }); continue; }

    try {
      const r = await query(
        `INSERT INTO contacts (workspace_id, name, phone, email, tags, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (workspace_id, phone) DO UPDATE
           SET name = EXCLUDED.name,
               email = COALESCE(EXCLUDED.email, contacts.email),
               tags = CASE WHEN array_length(EXCLUDED.tags, 1) > 0 THEN EXCLUDED.tags ELSE contacts.tags END,
               notes = COALESCE(EXCLUDED.notes, contacts.notes),
               updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [workspaceId, name.trim(), cleanedPhone || null, email?.trim() || null, tags, notes?.trim() || null]
      );
      if (r.rows[0]?.inserted) results.imported++;
      else results.updated++;
    } catch (err) {
      results.errors.push({ line: i + 1, error: err.message });
    }
  }

  return results;
}

// ── Perfil de IA ─────────────────────────────────────────────────────────────

async function updateAiProfile(contactId, workspaceId, profilePatch) {
  const r = await query(
    `UPDATE contacts
     SET ai_profile = ai_profile || $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id`,
    [JSON.stringify(profilePatch), contactId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  return getById(contactId, workspaceId);
}

module.exports = { list, getById, create, update, remove, listConversations, csvImport, listDuplicates, mergeContacts, updateAiProfile };
