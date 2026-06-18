'use strict';

const { query } = require('../../config/database');
const aiSvc      = require('../../services/ai.service');
const logger     = require('../../utils/logger');

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_STATUS = new Set(['disponivel', 'reservado', 'vendido']);

function resolveAiCredentials(ws) {
  const provider = ws.ai_provider || 'anthropic';
  const apiKey   = provider === 'custom'    ? (ws.custom_ai_api_key || 'ollama')
                 : provider === 'openai'    ? ws.openai_api_key
                 : provider === 'gemini'    ? ws.gemini_api_key
                 :                           ws.anthropic_api_key;
  const baseUrl  = provider === 'custom' ? ws.ai_base_url : null;
  const canRun   = provider === 'custom' ? !!ws.ai_base_url : !!apiKey;
  return { provider, apiKey, baseUrl, canRun, model: ws.ai_model || null };
}

/**
 * Extrai o primeiro array JSON encontrado na resposta do modelo, removendo
 * possíveis cercas de código markdown (```json ... ```).
 */
function parseLotsJson(raw) {
  if (!raw) return [];
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];

  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeLot).filter(Boolean);
  } catch (err) {
    logger.warn('Falha ao parsear JSON de lotes extraídos', { err: err.message });
    return [];
  }
}

function normalizeLot(item) {
  if (!item || typeof item !== 'object') return null;
  const lotLabel = item.lotLabel ?? item.lot_label ?? item.lote ?? null;
  if (!lotLabel) return null;

  const totalArea = Number(item.totalArea ?? item.total_area ?? item.area);
  const salePrice = Number(item.salePrice ?? item.sale_price ?? item.valor ?? item.preco);
  const status    = VALID_STATUS.has(item.status) ? item.status : 'disponivel';

  return {
    blockLabel: item.blockLabel ?? item.block_label ?? item.quadra ?? null,
    lotLabel:   String(lotLabel),
    totalArea:  Number.isFinite(totalArea) ? totalArea : null,
    salePrice:  Number.isFinite(salePrice) ? salePrice : null,
    status,
  };
}

const EXTRACTION_SYSTEM_PROMPT = `Você extrai dados estruturados de tabelas de loteamentos/condomínios a partir de texto bruto de PDF.
Retorne APENAS um array JSON (sem markdown, sem comentários, sem texto antes ou depois), onde cada item representa um lote/terreno/unidade com os campos:
- "blockLabel": identificação da quadra/bloco (ex: "Quadra A", "Bloco 2"), ou null se não houver
- "lotLabel": identificação do lote/unidade (ex: "Lote 12", "Unidade 305") — obrigatório
- "totalArea": área total em m² (apenas o número, sem unidade), ou null
- "salePrice": valor de venda em reais (apenas o número, sem "R$" ou pontuação de milhar), ou null
- "status": um destes valores: "disponivel", "reservado", "vendido" — baseado em qualquer indicação no texto (padrão "disponivel")

Se não conseguir identificar nenhum lote, retorne [].`;

// ── Extraction ───────────────────────────────────────────────────────────

async function extractLotsFromPdfBuffer(buffer, ws) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  const text = data.text?.replace(/\s+/g, ' ').trim();
  if (!text) {
    throw Object.assign(new Error('Não foi possível extrair texto do PDF.'), { status: 422 });
  }

  const { provider, apiKey, baseUrl, canRun, model } = resolveAiCredentials(ws);
  if (!canRun) {
    throw Object.assign(new Error(
      'Configure uma chave de IA (Anthropic, OpenAI ou customizada) em Configurações para usar a importação de loteamento.'
    ), { status: 400 });
  }

  const truncated = text.slice(0, 50000);
  const raw = await aiSvc.callLLM({
    provider, apiKey, baseUrl, model,
    system:   EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Texto extraído do PDF:\n\n${truncated}` }],
    maxTokens: 8000,
  });

  return parseLotsJson(raw);
}

// ── Jobs CRUD ────────────────────────────────────────────────────────────

async function assertDevelopmentExists(developmentId, workspaceId) {
  const r = await query('SELECT id, city, state FROM developments WHERE id = $1 AND workspace_id = $2', [developmentId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Empreendimento não encontrado'), { status: 404 });
  return r.rows[0];
}

async function createJob(workspaceId, developmentId, { buffer, filename }, userId, ws) {
  await assertDevelopmentExists(developmentId, workspaceId);

  let extractedLots = [];
  let status        = 'review';
  let errorMessage  = null;

  try {
    extractedLots = await extractLotsFromPdfBuffer(buffer, ws);
    if (!extractedLots.length) {
      status       = 'error';
      errorMessage = 'Nenhum lote foi identificado no PDF. Verifique o arquivo ou cadastre manualmente.';
    }
  } catch (err) {
    status       = 'error';
    errorMessage = err.message;
  }

  const r = await query(
    `INSERT INTO development_import_jobs
       (workspace_id, development_id, status, source_filename, extracted_lots, error_message, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [workspaceId, developmentId, status, filename || null, JSON.stringify(extractedLots), errorMessage, userId || null]
  );
  return r.rows[0];
}

async function listJobs(developmentId, workspaceId) {
  const r = await query(
    `SELECT id, status, source_filename, error_message, created_at, updated_at,
            jsonb_array_length(extracted_lots) AS lots_count
     FROM development_import_jobs
     WHERE development_id = $1 AND workspace_id = $2
     ORDER BY created_at DESC`,
    [developmentId, workspaceId]
  );
  return r.rows;
}

async function getJob(jobId, developmentId, workspaceId) {
  const r = await query(
    `SELECT * FROM development_import_jobs
     WHERE id = $1 AND development_id = $2 AND workspace_id = $3`,
    [jobId, developmentId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Importação não encontrada'), { status: 404 });
  return r.rows[0];
}

async function updateExtractedLots(jobId, developmentId, workspaceId, lots) {
  const job = await getJob(jobId, developmentId, workspaceId);
  if (job.status === 'done') {
    throw Object.assign(new Error('Esta importação já foi confirmada'), { status: 400 });
  }
  if (!Array.isArray(lots)) {
    throw Object.assign(new Error('lots deve ser um array'), { status: 400 });
  }

  const normalized = lots.map(normalizeLot).filter(Boolean);
  const r = await query(
    `UPDATE development_import_jobs
     SET extracted_lots = $1, status = 'review', error_message = NULL
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(normalized), jobId]
  );
  return r.rows[0];
}

async function removeJob(jobId, developmentId, workspaceId) {
  const r = await query(
    'DELETE FROM development_import_jobs WHERE id = $1 AND development_id = $2 AND workspace_id = $3 RETURNING id',
    [jobId, developmentId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Importação não encontrada'), { status: 404 });
}

// ── Confirm: cria as unidades (properties) a partir dos lotes extraídos ───

async function confirmJob(jobId, developmentId, workspaceId) {
  const job = await getJob(jobId, developmentId, workspaceId);
  if (job.status === 'done') {
    throw Object.assign(new Error('Esta importação já foi confirmada'), { status: 400 });
  }

  const lots = job.extracted_lots || [];
  if (!lots.length) {
    throw Object.assign(new Error('Nenhum lote para importar'), { status: 400 });
  }

  const dev = await assertDevelopmentExists(developmentId, workspaceId);

  const startRes = await query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 'IM-(\\d+)')::int), 0) AS max
     FROM properties WHERE workspace_id = $1`,
    [workspaceId]
  );
  let next = startRes.rows[0].max + 1;

  const created = [];
  for (const lot of lots) {
    const code  = `IM-${String(next++).padStart(4, '0')}`;
    const title = lot.blockLabel
      ? `Lote ${lot.lotLabel} - ${lot.blockLabel}`
      : `Lote ${lot.lotLabel}`;

    const r = await query(
      `INSERT INTO properties (
         workspace_id, code, title, property_type, purpose, status,
         total_area, sale_price, development_id, block_label, lot_label, city, state
       ) VALUES (
         $1,$2,$3,'terreno_lote','venda',$4,
         $5,$6,$7,$8,$9,$10,$11
       ) RETURNING id, code, title`,
      [
        workspaceId, code, title, lot.status || 'disponivel',
        lot.totalArea, lot.salePrice, developmentId, lot.blockLabel, lot.lotLabel,
        dev.city || null, dev.state || null,
      ]
    );
    created.push(r.rows[0]);
  }

  await query(`UPDATE development_import_jobs SET status = 'done' WHERE id = $1`, [jobId]);

  return { created: created.length, properties: created };
}

module.exports = {
  createJob, listJobs, getJob, updateExtractedLots, removeJob, confirmJob,
};
