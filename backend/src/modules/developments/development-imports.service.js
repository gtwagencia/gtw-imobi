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
  // Remove cercas de markdown (```json ... ``` ou ``` ... ```)
  text = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();

  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    logger.warn('[import-loteamento] Nenhum array JSON encontrado na resposta', { preview: text.slice(0, 200) });
    return [];
  }

  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeLot).filter(Boolean);
  } catch (err) {
    logger.warn('[import-loteamento] Falha ao parsear JSON', { err: err.message, preview: text.slice(0, 200) });
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

const EXTRACTION_PROMPT = `Você é um especialista em leitura de plantas de loteamentos e condomínios fechados.

TAREFA: extraia TODOS os lotes/unidades visíveis neste PDF — seja uma planta colorida, tabela ou lista.

INSTRUÇÕES PARA PLANTAS VISUAIS COLORIDAS:
- Cada polígono colorido no mapa é um lote. Leia o número/rótulo escrito DENTRO de cada polígono.
- Agrupe por quadra: as quadras geralmente são blocos contíguos da mesma cor ou separados por rua.
- Leia atentamente mesmo números pequenos — faça o máximo esforço para identificar cada lote.
- NÃO omita lotes por estarem sobrepostos ou com texto pequeno — estime se necessário.
- Se houver legenda de cores (ex: verde=disponível, laranja=vendido), use para definir o status.

FORMATO DE SAÍDA — responda SOMENTE com um array JSON, exemplo:
[
  {"blockLabel":"Quadra 1","lotLabel":"01","totalArea":200,"salePrice":null,"status":"disponivel"},
  {"blockLabel":"Quadra 1","lotLabel":"02","totalArea":null,"salePrice":null,"status":"vendido"}
]

Campos:
- blockLabel: nome da quadra/bloco ou null
- lotLabel: número do lote (obrigatório — use o número visível no polígono)
- totalArea: área m² como número, ou null
- salePrice: valor R$ como número, ou null
- status: "disponivel", "reservado" ou "vendido"

IMPORTANTE: retorne o array JSON completo com TODOS os lotes, sem texto extra.`;

// ── Extraction via Gemini (PDF nativo — visão multimodal) ─────────────────

async function extractLotsGemini(buffer, apiKey, model) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  // Para PDFs visuais usa gemini-2.5-pro por padrão (melhor visão)
  const resolvedModel = model || 'gemini-2.5-pro';
  const client = genAI.getGenerativeModel({ model: resolvedModel });

  logger.info(`[import-loteamento] Enviando PDF (${(buffer.length / 1024).toFixed(0)}KB) ao Gemini (${resolvedModel})`);

  const result = await client.generateContent({
    contents: [{
      role:  'user',
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        { text: EXTRACTION_PROMPT },
      ],
    }],
    generationConfig: { maxOutputTokens: 16000, temperature: 0.1 },
  });

  const raw = result.response.text().trim();
  logger.info(`[import-loteamento] Resposta Gemini (${raw.length} chars): ${raw.slice(0, 300)}`);

  const lots = parseLotsJson(raw);
  logger.info(`[import-loteamento] Lotes extraídos: ${lots.length}`);
  return lots;
}

// ── Extraction via Anthropic (visão — converte 1ª página em imagem) ────────

async function extractLotsAnthropic(buffer, apiKey, model) {
  // Tenta extração de texto primeiro; se vazio usa base64 da primeira página
  const pdfParse = require('pdf-parse');
  let text = '';
  try { text = (await pdfParse(buffer)).text?.replace(/\s+/g, ' ').trim(); } catch {}

  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic.default({ apiKey });

  if (text && text.length > 200) {
    // PDF com texto — envia o texto
    const resp = await client.messages.create({
      model:      model || 'claude-sonnet-4-6',
      max_tokens: 8000,
      system:     EXTRACTION_PROMPT,
      messages:   [{ role: 'user', content: `Texto extraído do PDF:\n\n${text.slice(0, 50000)}` }],
    });
    return parseLotsJson(resp.content?.[0]?.text || '');
  }

  // PDF visual — envia a primeira página como imagem base64
  const pdfBase64 = buffer.toString('base64');
  const resp = await client.messages.create({
    model:      model || 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{
      role:    'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text',     text: EXTRACTION_PROMPT },
      ],
    }],
  });
  return parseLotsJson(resp.content?.[0]?.text || '');
}

// ── Extraction via OpenAI (texto; visão requer conversão de página) ────────

async function extractLotsOpenAI(buffer, apiKey, baseUrl, model) {
  const pdfParse = require('pdf-parse');
  let text = '';
  try { text = (await pdfParse(buffer)).text?.replace(/\s+/g, ' ').trim(); } catch {}

  if (!text || text.length < 100) {
    throw Object.assign(
      new Error('PDF visual detectado. Para mapas coloridos use Gemini ou Claude como provedor de IA — eles suportam visão nativa de PDF.'),
      { status: 422 }
    );
  }

  const raw = await aiSvc.callLLM({
    provider: 'openai', apiKey, baseUrl, model,
    system:   EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: `Texto extraído do PDF:\n\n${text.slice(0, 50000)}` }],
    maxTokens: 8000,
  });
  return parseLotsJson(raw);
}

// ── Dispatcher principal ──────────────────────────────────────────────────

async function extractLotsFromPdfBuffer(buffer, ws) {
  const { provider, apiKey, baseUrl, canRun, model } = resolveAiCredentials(ws);
  if (!canRun) {
    throw Object.assign(new Error(
      'Configure uma chave de IA em Configurações para usar a importação de loteamento.'
    ), { status: 400 });
  }

  if (provider === 'gemini')    return await extractLotsGemini(buffer, apiKey, model);
  if (provider === 'anthropic') return await extractLotsAnthropic(buffer, apiKey, model);
  return await extractLotsOpenAI(buffer, apiKey, baseUrl, model);
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
