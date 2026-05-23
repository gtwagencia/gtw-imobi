'use strict';

const { query } = require('../../config/database');

async function list(workspaceId, { search, tags, page = 1, limit = 50 } = {}) {
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

  const countRes = await query(`SELECT COUNT(*) FROM contacts c ${where}`, params);
  const total    = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT c.*,
            COUNT(DISTINCT conv.id)::int AS conversation_count,
            COUNT(DISTINCT d.id)::int    AS deal_count
     FROM contacts c
     LEFT JOIN conversations conv ON conv.contact_id = c.id
     LEFT JOIN deals d ON d.contact_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

async function getById(contactId, workspaceId) {
  const r = await query(
    'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
    [contactId, workspaceId]
  );
  return r.rows[0] || null;
}

async function create(workspaceId, body) {
  const {
    name, phone, email, avatarUrl,
    metaLeadId, metaCampaignId, metaAdsetId, metaAdId, metaFormId,
    utmSource, utmCampaign, utmMedium,
    tags, notes, customFields,
  } = body;

  const r = await query(
    `INSERT INTO contacts
       (workspace_id, name, phone, email, avatar_url,
        meta_lead_id, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id,
        utm_source, utm_campaign, utm_medium,
        tags, notes, custom_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (workspace_id, phone) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email,
           meta_lead_id = COALESCE(EXCLUDED.meta_lead_id, contacts.meta_lead_id),
           updated_at = NOW()
     RETURNING *`,
    [workspaceId, name, phone || null, email || null, avatarUrl || null,
      metaLeadId || null, metaCampaignId || null, metaAdsetId || null,
      metaAdId || null, metaFormId || null,
      utmSource || null, utmCampaign || null, utmMedium || null,
      tags || [], notes || null, customFields || {}]
  );
  return r.rows[0];
}

async function update(contactId, workspaceId, body) {
  const map = {
    name: 'name', phone: 'phone', email: 'email', avatarUrl: 'avatar_url',
    tags: 'tags', notes: 'notes', customFields: 'custom_fields',
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
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  return r.rows[0];
}

async function remove(contactId, workspaceId) {
  const r = await query(
    'DELETE FROM contacts WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [contactId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
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

async function csvImport(workspaceId, csvText) {
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
    const fields = parseCsvLine(lines[i]);
    const name   = colIdx.name  >= 0 ? fields[colIdx.name]  : null;
    const phone  = colIdx.phone >= 0 ? fields[colIdx.phone] : null;
    const email  = colIdx.email >= 0 ? fields[colIdx.email] : null;
    const tags   = colIdx.tags  >= 0 && fields[colIdx.tags]
      ? fields[colIdx.tags].split(';').map(t => t.trim()).filter(Boolean)
      : [];
    const notes  = colIdx.notes >= 0 ? fields[colIdx.notes] : null;

    if (!name?.trim()) { results.errors.push({ line: i + 1, error: 'Nome ausente' }); continue; }

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
        [workspaceId, name.trim(), phone?.trim() || null, email?.trim() || null, tags, notes?.trim() || null]
      );
      if (r.rows[0]?.inserted) results.imported++;
      else results.updated++;
    } catch (err) {
      results.errors.push({ line: i + 1, error: err.message });
    }
  }

  return results;
}

module.exports = { list, getById, create, update, remove, listConversations, csvImport };
