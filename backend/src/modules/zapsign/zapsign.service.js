'use strict';

const axios  = require('axios');
const { query } = require('../../config/database');

const ZAPSIGN_BASE = 'https://api.zapsign.com.br/api/v1';

// ── Criar documento para assinatura ────────────────────────────────────────

async function createDocument({ apiToken, documentName, fileBase64, signers }) {
  const resp = await axios.post(
    `${ZAPSIGN_BASE}/docs/`,
    {
      name: documentName,
      url_pdf: undefined,
      base64_pdf: fileBase64,
      signers: signers.map((s) => ({
        name:  s.name,
        email: s.email || undefined,
        phone_country: 'BR',
        phone_number: s.phone ? s.phone.replace(/\D/g, '') : undefined,
        send_automatic_email: !!s.email,
        send_automatic_whatsapp: !!s.phone,
      })),
    },
    { headers: { Authorization: `Bearer ${apiToken}` }, timeout: 30000 }
  );
  return resp.data;
}

// ── Enviar proposta para assinatura ────────────────────────────────────────

async function sendProposalForSignature(workspaceId, proposalId) {
  const wsRes = await query('SELECT zapsign_api_token FROM workspaces WHERE id = $1', [workspaceId]);
  const ws = wsRes.rows[0];
  if (!ws?.zapsign_api_token) throw Object.assign(new Error('Token ZapSign não configurado'), { status: 400 });

  const propRes = await query(
    `SELECT pp.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
            p.title AS property_title
     FROM property_proposals pp
     JOIN contacts c ON c.id = pp.contact_id
     LEFT JOIN properties p ON p.id = pp.property_id
     WHERE pp.id = $1 AND pp.workspace_id = $2`,
    [proposalId, workspaceId]
  );
  const proposal = propRes.rows[0];
  if (!proposal) throw Object.assign(new Error('Proposta não encontrada'), { status: 404 });
  if (!proposal.file_url) throw Object.assign(new Error('Proposta sem arquivo PDF'), { status: 400 });

  // Download do PDF para base64
  const pdfResp = await axios.get(proposal.file_url, { responseType: 'arraybuffer', timeout: 30000 });
  const base64  = Buffer.from(pdfResp.data).toString('base64');

  const doc = await createDocument({
    apiToken: ws.zapsign_api_token,
    documentName: `Proposta — ${proposal.property_title || ''} — ${proposal.contact_name}`,
    fileBase64: base64,
    signers: [{ name: proposal.contact_name, email: proposal.contact_email, phone: proposal.contact_phone }],
  });

  const signUrl = doc.signers?.[0]?.sign_url || null;

  await query(
    `UPDATE property_proposals
     SET zapsign_doc_token = $1, zapsign_sign_url = $2, signature_status = 'aguardando'
     WHERE id = $3`,
    [doc.token, signUrl, proposalId]
  );

  return { doc_token: doc.token, sign_url: signUrl };
}

// ── Webhook ZapSign (documento assinado) ────────────────────────────────────

async function handleWebhook(payload) {
  const docToken = payload?.document?.token;
  if (!docToken) return;

  const status = payload?.document?.status_name;
  if (status !== 'signed') return;

  await query(
    `UPDATE property_proposals
     SET signature_status = 'assinado', signed_at = NOW()
     WHERE zapsign_doc_token = $1`,
    [docToken]
  );
}

// ── Verificar status ────────────────────────────────────────────────────────

async function checkStatus(apiToken, docToken) {
  const resp = await axios.get(`${ZAPSIGN_BASE}/docs/${docToken}/`, {
    headers: { Authorization: `Bearer ${apiToken}` }, timeout: 15000,
  });
  return resp.data;
}

module.exports = { sendProposalForSignature, handleWebhook, checkStatus };
