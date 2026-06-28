'use strict';

const axios   = require('axios');
const { query } = require('../../config/database');
const logger    = require('../../utils/logger');
const { callLLM } = require('../../services/ai.service');

const META_API_VERSION = 'v19.0';
const META_BASE        = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Resolve AI config do workspace ─────────────────────────────────────────

async function getAiConfig(workspaceId) {
  const r = await query(
    `SELECT anthropic_api_key, openai_api_key, gemini_api_key, custom_ai_api_key,
            ai_base_url, ai_provider, ai_model
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const ws = r.rows[0];
  if (!ws) return null;

  const provider = ws.ai_provider || 'anthropic';
  const apiKey   = provider === 'custom'  ? ws.custom_ai_api_key
                 : provider === 'openai'  ? ws.openai_api_key
                 : provider === 'gemini'  ? ws.gemini_api_key
                 : ws.anthropic_api_key   || process.env.ANTHROPIC_API_KEY;
  const baseUrl  = provider === 'custom'  ? ws.ai_base_url : null;

  return { provider, apiKey, baseUrl, model: ws.ai_model || null };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slugifyName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 200);
}

function extractVariables(text) {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const vars = [...new Set(matches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
  return vars;
}

function buildBodyExample(body) {
  const vars = extractVariables(body);
  if (!vars.length) return undefined;
  return { body_text: [vars.map(() => 'exemplo')] };
}

function buildComponents({ headerType, headerText, body, footerText, buttons = [] }) {
  const comps = [];

  if (headerType === 'TEXT' && headerText) {
    comps.push({ type: 'HEADER', format: 'TEXT', text: headerText });
  }

  const bodyComp = { type: 'BODY', text: body };
  const example  = buildBodyExample(body);
  if (example) bodyComp.example = example;
  comps.push(bodyComp);

  if (footerText) {
    comps.push({ type: 'FOOTER', text: footerText });
  }

  if (Array.isArray(buttons) && buttons.length) {
    comps.push({ type: 'BUTTONS', buttons });
  }

  return comps;
}

// ── Geração de variações via LLM ───────────────────────────────────────────

async function generateVariations(baseBody, count, aiConfig) {
  const { provider, apiKey, baseUrl, model } = aiConfig;

  const variables = extractVariables(baseBody);
  const varNote   = variables.length
    ? `Preserve EXATAMENTE os placeholders {{${variables.join('}}, {{')}}} no mesmo lugar e ordem.`
    : '';

  const system = `Você é especialista em redação de templates do WhatsApp Business para o setor imobiliário.
Gere variações de templates que seguem as políticas do Meta:
- Sem linguagem excessivamente promocional ou spam
- Sem uso excessivo de MAIÚSCULAS
- Sem promessas falsas ou garantias absolutas
- Texto natural, não robótico
- Foco em valor para o destinatário
${varNote}
Responda SOMENTE com um array JSON válido de strings — sem explicações, sem markdown.`;

  const prompt = `Template original:
"${baseBody}"

Gere ${count} variações diferentes deste template. Cada variação deve:
1. Manter o mesmo objetivo/intenção
2. Usar tom ligeiramente diferente (formal, amigável, direto, consultivo...)
3. Ter estrutura de frase diferente
4. Ter entre ${Math.max(10, baseBody.length - 50)} e ${baseBody.length + 100} caracteres

Responda APENAS com um array JSON de ${count} strings.
Exemplo: ["Variação 1...", "Variação 2...", ...]`;

  let raw = '';
  try {
    raw = await callLLM({
      provider, apiKey, baseUrl, model,
      system,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Resposta sem array JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Array vazio');

    return parsed.slice(0, count).map(s => String(s).trim());
  } catch (err) {
    logger.warn('wa-templates: falha ao gerar variações', { err: err.message, raw: raw.slice(0, 200) });
    // Fallback: retorna apenas o corpo original como única variação
    return [baseBody];
  }
}

// ── Submissão para Meta Graph API ──────────────────────────────────────────

async function submitToMeta({ wabaId, accessToken, name, category, language, components }) {
  const url = `${META_BASE}/${wabaId}/message_templates`;
  const resp = await axios.post(url, {
    name, category, language, components,
  }, {
    params:  { access_token: accessToken },
    timeout: 15000,
  });
  return resp.data; // { id, status }
}

// ── Criar batch ────────────────────────────────────────────────────────────

async function createBatch(workspaceId, userId, {
  baseName, category, language, headerType, headerText,
  footerText, buttons, baseBody, variantCount,
}) {
  const slug = slugifyName(baseName);
  if (!slug) throw Object.assign(new Error('Nome inválido (use apenas letras, números e _)'), { status: 400 });

  const count = Math.min(Math.max(parseInt(variantCount, 10) || 5, 1), 10);

  // Busca workspace para WABA + access token + AI config
  const wsRes = await query(
    `SELECT meta_waba_id, meta_access_token,
            anthropic_api_key, openai_api_key, gemini_api_key, custom_ai_api_key,
            ai_base_url, ai_provider, ai_model
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  if (!wsRes.rows.length) throw Object.assign(new Error('Workspace não encontrado'), { status: 404 });
  const ws = wsRes.rows[0];

  if (!ws.meta_waba_id || !ws.meta_access_token) {
    throw Object.assign(new Error('WABA ID e token de acesso Meta não configurados neste workspace'), { status: 400 });
  }

  // Cria o batch no DB
  const batchRes = await query(
    `INSERT INTO whatsapp_template_batches
       (workspace_id, created_by, base_name, category, language,
        header_type, header_text, footer_text, buttons, base_body, variant_count, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'generating') RETURNING *`,
    [workspaceId, userId, slug, category || 'MARKETING', language || 'pt_BR',
     headerType || null, headerText || null, footerText || null,
     JSON.stringify(buttons || []), baseBody, count]
  );
  const batch = batchRes.rows[0];

  // Monta config de IA
  const provider = ws.ai_provider || 'anthropic';
  const apiKey   = provider === 'custom'  ? ws.custom_ai_api_key
                 : provider === 'openai'  ? ws.openai_api_key
                 : provider === 'gemini'  ? ws.gemini_api_key
                 : ws.anthropic_api_key   || process.env.ANTHROPIC_API_KEY;
  const aiConfig = { provider, apiKey, baseUrl: provider === 'custom' ? ws.ai_base_url : null, model: ws.ai_model };

  // Gera variações
  let bodies;
  try {
    bodies = await generateVariations(baseBody, count, aiConfig);
  } catch (e) {
    bodies = [baseBody];
  }
  // Garante pelo menos `count` entradas (repete a original se necessário)
  while (bodies.length < count) bodies.push(baseBody);

  // Submete cada variação ao Meta e salva no DB
  const variants = [];
  let approvedAny = false;

  for (let i = 0; i < bodies.length; i++) {
    const varName    = `${slug}_v${i + 1}`;
    const components = buildComponents({
      headerType, headerText, body: bodies[i], footerText, buttons,
    });

    let metaId = null, metaStatus = 'pending', metaResponse = null, submittedAt = null;
    let rejectionReason = null;

    try {
      const metaResp = await submitToMeta({
        wabaId:      ws.meta_waba_id,
        accessToken: ws.meta_access_token,
        name:        varName,
        category:    category || 'MARKETING',
        language:    language || 'pt_BR',
        components,
      });
      metaId       = metaResp.id   || null;
      metaStatus   = (metaResp.status || 'PENDING').toLowerCase();
      metaResponse = metaResp;
      submittedAt  = new Date();
      if (metaStatus === 'approved') approvedAny = true;
    } catch (err) {
      const errData   = err.response?.data || { message: err.message };
      metaResponse    = errData;
      metaStatus      = 'failed';
      rejectionReason = errData?.error?.message || err.message;
      logger.warn('wa-templates: falha ao submeter variante', { varName, err: err.message });
    }

    const vRes = await query(
      `INSERT INTO whatsapp_template_variants
         (batch_id, variant_index, name, body, status, meta_template_id,
          rejection_reason, meta_response, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [batch.id, i + 1, varName, bodies[i], metaStatus,
       metaId, rejectionReason, metaResponse ? JSON.stringify(metaResponse) : null, submittedAt]
    );
    variants.push(vRes.rows[0]);
  }

  // Atualiza status geral do batch
  const allFailed  = variants.every(v => v.status === 'failed');
  const batchStatus = approvedAny ? 'approved'
                    : allFailed   ? 'failed'
                    :               'submitted';

  await query(
    `UPDATE whatsapp_template_batches SET status = $1, updated_at = NOW() WHERE id = $2`,
    [batchStatus, batch.id]
  );

  return { ...batch, status: batchStatus, variants };
}

// ── Sincronizar status do Meta ─────────────────────────────────────────────

async function syncBatchStatus(batchId, workspaceId) {
  const batchRes = await query(
    `SELECT b.*, w.meta_waba_id, w.meta_access_token
     FROM whatsapp_template_batches b
     JOIN workspaces w ON w.id = b.workspace_id
     WHERE b.id = $1 AND b.workspace_id = $2`,
    [batchId, workspaceId]
  );
  if (!batchRes.rows.length) throw Object.assign(new Error('Batch não encontrado'), { status: 404 });
  const batch = batchRes.rows[0];

  if (!batch.meta_waba_id || !batch.meta_access_token) {
    throw Object.assign(new Error('WABA ID / token não configurados'), { status: 400 });
  }

  const varRes = await query(
    `SELECT * FROM whatsapp_template_variants WHERE batch_id = $1 ORDER BY variant_index`,
    [batchId]
  );
  const variants = varRes.rows;
  const updated  = [];

  for (const variant of variants) {
    if (variant.status === 'approved') { updated.push(variant); continue; }

    try {
      const resp = await axios.get(`${META_BASE}/${batch.meta_waba_id}/message_templates`, {
        params: {
          name:         variant.name,
          fields:       'id,name,status,rejection_reason',
          access_token: batch.meta_access_token,
        },
        timeout: 10000,
      });

      const data    = resp.data?.data?.[0];
      if (!data) { updated.push(variant); continue; }

      const newStatus    = (data.status || 'PENDING').toLowerCase();
      const newRejection = data.rejection_reason || null;
      const approvedAt   = newStatus === 'approved' ? new Date() : variant.approved_at;

      await query(
        `UPDATE whatsapp_template_variants
         SET status = $1, rejection_reason = $2, approved_at = $3,
             meta_template_id = COALESCE(meta_template_id, $4), updated_at = NOW()
         WHERE id = $5`,
        [newStatus, newRejection, approvedAt, data.id || null, variant.id]
      );
      updated.push({ ...variant, status: newStatus, rejection_reason: newRejection, approved_at: approvedAt });
    } catch (err) {
      logger.warn('wa-templates: falha ao sincronizar variante', { variantName: variant.name, err: err.message });
      updated.push(variant);
    }
  }

  // Atualiza status do batch
  const approvedAny = updated.some(v => v.status === 'approved');
  const allRejected = updated.every(v => ['rejected', 'disabled', 'failed'].includes(v.status));
  const newBatchStatus = approvedAny ? 'approved' : allRejected ? 'rejected' : 'submitted';

  await query(
    `UPDATE whatsapp_template_batches SET status = $1, updated_at = NOW() WHERE id = $2`,
    [newBatchStatus, batchId]
  );

  return { ...batch, status: newBatchStatus, variants: updated };
}

// ── Listagem ───────────────────────────────────────────────────────────────

async function listBatches(workspaceId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const r = await query(
    `SELECT b.*,
            u.name AS created_by_name,
            json_agg(v ORDER BY v.variant_index) AS variants
     FROM whatsapp_template_batches b
     LEFT JOIN users u ON u.id = b.created_by
     LEFT JOIN whatsapp_template_variants v ON v.batch_id = b.id
     WHERE b.workspace_id = $1
     GROUP BY b.id, u.name
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [workspaceId, limit, offset]
  );
  const countRes = await query(
    'SELECT COUNT(*) FROM whatsapp_template_batches WHERE workspace_id = $1',
    [workspaceId]
  );
  return {
    data:  r.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page,
    limit,
  };
}

async function getBatch(batchId, workspaceId) {
  const r = await query(
    `SELECT b.*, u.name AS created_by_name
     FROM whatsapp_template_batches b
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.id = $1 AND b.workspace_id = $2`,
    [batchId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Batch não encontrado'), { status: 404 });
  const batch = r.rows[0];

  const vRes = await query(
    `SELECT * FROM whatsapp_template_variants WHERE batch_id = $1 ORDER BY variant_index`,
    [batchId]
  );
  batch.variants = vRes.rows;
  return batch;
}

module.exports = { createBatch, syncBatchStatus, listBatches, getBatch };
