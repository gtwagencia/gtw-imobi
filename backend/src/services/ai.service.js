'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const { query } = require('../config/database');
const logger    = require('../utils/logger');
const propertiesSvc = require('../modules/properties/properties.service');
const developmentsSvc = require('../modules/developments/developments.service');
const messagesSvc   = require('../modules/messages/messages.service');
const visitsSvc     = require('../modules/visits/visits.service');

// ── Provider abstraction ────────────────────────────────────────────────────

// Modelos padrão por provedor
const DEFAULT_MODELS = {
  anthropic: { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-6'    },
  openai:    { fast: 'gpt-4o-mini',               smart: 'gpt-4o'               },
  gemini:    { fast: 'gemini-2.0-flash',          smart: 'gemini-2.5-pro'               },
};

// Helper: converte tipo JSON Schema para SchemaType do Gemini (string uppercase)
function toGeminiType(t) {
  return ({ string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY', object: 'OBJECT' })[String(t).toLowerCase()] || 'STRING';
}

function toGeminiProperties(props = {}) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = { type: toGeminiType(v.type), description: v.description || '' };
    if (v.enum) out[k].enum = v.enum;
  }
  return out;
}

/**
 * Chama o LLM configurado no workspace (Anthropic, OpenAI ou um endpoint
 * customizado compatível com a API da OpenAI, ex: Ollama).
 * @param {object} opts
 * @param {string}  opts.provider  - 'anthropic' | 'openai' | 'custom'
 * @param {string}  opts.apiKey
 * @param {string}  [opts.baseUrl] - base URL para provider 'custom' (ex: http://servidor:11434/v1)
 * @param {string}  [opts.model]   - modelo específico; usa padrão se omitido
 * @param {string}  opts.system
 * @param {{ role: string, content: string }[]} opts.messages
 * @param {number}  [opts.maxTokens]
 * @returns {Promise<string>}
 */
async function callLLM({ provider, apiKey, baseUrl, model, system, messages, maxTokens = 300 }) {
  // ── Gemini (Google) ──
  if (provider === 'gemini') {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI   = new GoogleGenerativeAI(apiKey);
    const resolvedModel = model || (maxTokens > 200 ? DEFAULT_MODELS.gemini.smart : DEFAULT_MODELS.gemini.fast);
    const client  = genAI.getGenerativeModel({ model: resolvedModel, systemInstruction: system });
    const contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));
    const result = await client.generateContent({ contents, generationConfig: { maxOutputTokens: maxTokens } });
    return result.response.text().trim() || '';
  }

  // ── OpenAI / Custom (compatível OpenAI) ──
  if (provider === 'openai' || provider === 'custom') {
    const url = provider === 'custom'
      ? `${(baseUrl || '').replace(/\/$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';
    const resolvedModel = model || (provider === 'custom' ? undefined : (maxTokens > 200 ? DEFAULT_MODELS.openai.smart : DEFAULT_MODELS.openai.fast));
    const msgs = [{ role: 'system', content: system }, ...messages];
    const resp = await axios.post(
      url,
      { model: resolvedModel, messages: msgs, max_tokens: maxTokens },
      { headers: { Authorization: `Bearer ${apiKey || 'ollama'}` }, timeout: 30000 }
    );
    return resp.data.choices[0]?.message?.content?.trim() || '';
  }

  // ── Anthropic (padrão) ──
  const resolvedModel = model || (maxTokens > 200 ? DEFAULT_MODELS.anthropic.smart : DEFAULT_MODELS.anthropic.fast);
  const client        = new Anthropic({ apiKey });
  const response      = await client.messages.create({
    model: resolvedModel, max_tokens: maxTokens, system, messages,
  });
  return response.content[0]?.text?.trim() || '';
}

// ── Lia — persona padrão e ferramentas (nome do agente configurável por workspace) ──

const DEFAULT_AGENT_PERSONA = `Você é Lia, assistente virtual de atendimento da imobiliária. Atenda leads do mercado imobiliário de forma simpática, objetiva e profissional, em português brasileiro.

Você pode usar estas ferramentas quando fizer sentido:
- buscar_imoveis: busca imóveis no catálogo a partir de critérios do cliente (finalidade, tipo, cidade, quartos, valor).
- buscar_empreendimentos: busca empreendimentos/lançamentos a partir de critérios do cliente (cidade, status da obra).
- enviar_ficha_imovel: envia foto de capa + dados de um imóvel específico (pelo código).
- enviar_ficha_empreendimento: envia foto de capa + dados de um empreendimento específico (pelo código).
- propor_visita: registra uma proposta de visita a um imóvel numa data/horário sugeridos.
- transferir_para_setor: transfere a conversa para um setor específico da equipe.

Regras:
- Nunca invente imóveis, empreendimentos, preços, disponibilidade ou confirmações de visita — sempre use as ferramentas.
- Seja breve (2-4 frases por resposta).
- Ao propor uma visita, deixe claro que a equipe ainda vai confirmar o horário.
- Se não conseguir ajudar, diga que um corretor da equipe vai continuar o atendimento.`;

/**
 * @param {object} opts
 * @param {string} [opts.agentName]
 * @param {'imobiliaria'|'construtora'} [opts.businessModel]
 * @param {{ name: string, ai_routing_description?: string|null }[]} [opts.departments]
 * @param {{ name: string, group_type: string, description?: string|null }[]} [opts.routingGroups]
 */
function buildAgentPersona({ agentName, businessModel, departments, routingGroups } = {}) {
  const name = agentName?.trim() || 'Lia';
  const isConstrutora = businessModel === 'construtora';

  // ── IDENTIDADE ────────────────────────────────────────────────────────────
  const intro = `Você é ${name}, consultora virtual de atendimento${isConstrutora ? ' da incorporadora/construtora' : ' da imobiliária'}.
Fale em português brasileiro — tom caloroso, natural e profissional, como uma consultora humana experiente. Nunca se apresente como robô, IA ou assistente automático. Quando perguntarem se você é humana, diga que é a consultora virtual da empresa, pronta para ajudar.
${isConstrutora
  ? 'Esta empresa trabalha exclusivamente com empreendimentos e unidades próprias — não comercializa imóveis de terceiros.'
  : 'Esta imobiliária trabalha com imóveis de terceiros (venda e locação) e com empreendimentos/lançamentos próprios.'}`;

  // ── PROCESSAMENTO MULTIMODAL ───────────────────────────────────────────────
  const mediaBlock = `## O QUE VOCÊ ENTENDE

Você processa TODOS os tipos de mensagem com inteligência:

*Áudio:* O conteúdo já foi transcrito e aparece como texto na conversa. Trate como fala normal do cliente — reconheça expressões informais, hesitações e contexto emocional.

*Imagem:* Analise o que você vê:
- Fachada/foto de imóvel → cliente tem interesse visual, mencione características identificadas
- Planta baixa → cliente avalia layout, comente sobre a distribuição
- Comprovante/documento → entenda o estágio do processo
- Print de portal → cliente viu esse imóvel em outro lugar, busque opções similares no catálogo

*Documento PDF:* Leia e interprete o conteúdo — proposta, contrato, comprovante de renda ou laudo de avaliação.

*Link:* Reconheça que o cliente referencia algo externo. Pergunte o que chamou atenção dele.

*Vídeo:* Cliente mostra um imóvel ou tour. Mencione que assistiu e pergunte o que gostou.

*Figurinhas/emojis sozinhos:* Interprete o humor — adapte seu tom de acordo.`;

  // ── QUALIFICAÇÃO PROGRESSIVA ───────────────────────────────────────────────
  const qualificationBlock = `## QUALIFICAÇÃO NATURAL

Nunca use perguntas de formulário. Conduza uma conversa que descubra naturalmente:
1. *Intenção:* comprar, alugar, vender, avaliar, investir, conhecer lançamento
2. *Para quem:* moradia própria, família, investimento, empresa
3. *Localização:* região, bairro, proximidade de escola/trabalho
4. *Perfil do imóvel:* tipo, quartos, vagas, área, diferenciais
5. *Orçamento:* valor total, entrada, usa FGTS, vai financiar, permuta
6. *Prazo:* imediato, 3 meses, 6 meses, pesquisando

Dicas práticas:
- Deixe o cliente falar primeiro; depois faça UMA pergunta estratégica
- Se ele já deu bastante informação, vá direto para a busca — sem repetir perguntas
- "Quero só dar uma olhada" → pesquisando; pode ser qualificado com boa oferta
- "É pra uma amiga" → possivelmente ele mesmo está interessado
- "Só o preço" → objeção de compromisso; mostre valor antes de dar número`;

  // ── FERRAMENTAS ────────────────────────────────────────────────────────────
  const toolsBlock = isConstrutora
    ? `## FERRAMENTAS

Use as ferramentas de forma natural, *sem anunciar que vai usar*. O resultado chega ao cliente automaticamente.

- *buscar_empreendimentos* → quando quer mostrar opções de empreendimentos/lançamentos
- *enviar_ficha_empreendimento* → para detalhar um empreendimento específico
- *propor_visita* → quando o cliente demonstrou interesse em visitar stand/decorado
- *rotear_para_grupo* → quando identificou o perfil e quer conectar com especialista
- *transferir_para_setor* → para pós-venda, financeiro, jurídico, obras`
    : `## FERRAMENTAS

Use as ferramentas de forma natural, *sem anunciar que vai usar*. O resultado chega ao cliente automaticamente.

- *buscar_imoveis* → quando tem critérios suficientes (finalidade + cidade + pelo menos um filtro)
- *enviar_ficha_imovel* → para apresentar um imóvel específico por código ou opção selecionada
- *buscar_empreendimentos* → quando o cliente tem interesse em lançamento ou imóvel na planta
- *enviar_ficha_empreendimento* → para detalhar um empreendimento específico
- *propor_visita* → quando o cliente confirmou interesse e sugeriu/aceitou data
- *rotear_para_grupo* → quando identificou o perfil e quer conectar com o especialista certo
- *transferir_para_setor* → para administrativo, jurídico, financeiro ou suporte`;

  // ── ROTEAMENTO INTELIGENTE ─────────────────────────────────────────────────
  const deptList    = (departments   || []).filter(d => d?.name);
  const groupList   = (routingGroups || []).filter(g => g?.name);

  const routingBlock = `## ROTEAMENTO

Identifique o perfil e acione o roteamento *após* ter ao menos intenção + localização. Não transfira antes.

*Grupos de atendimento* (ferramenta "rotear_para_grupo") — para novos leads de vendas/locação:
${groupList.length
  ? groupList.map(g => `- *${g.name}*: ${g.description || g.group_type}`).join('\n')
  : `- Compra e Venda: quer comprar imóvel
- Locação: quer alugar
- Empreendimentos: interesse em lançamentos/planta
- Plantão Geral: demandas diversas`}

*Setores da empresa* (ferramenta "transferir_para_setor") — para assuntos pós-negócio ou administrativos:
${deptList.length
  ? deptList.map(d => `- *${d.name}*${d.ai_routing_description ? `: ${d.ai_routing_description}` : ''}`).join('\n')
  : '- Financeiro, Jurídico, Suporte e demais áreas administrativas'}`;

  // ── INTELIGÊNCIA EMOCIONAL ────────────────────────────────────────────────
  const intelligenceBlock = `## INTELIGÊNCIA EMOCIONAL

Adapte seu tom ao estado do cliente:
- Ansioso/urgente → seja direta, vá ao ponto
- Indeciso → ajude com comparações ("O que pesa mais: localização ou tamanho?")
- Frustrado → valide antes de oferecer soluções
- Entusiasmado → combine a energia e guie para ação concreta

Objeções comuns:
- "Tá caro" → "O que pesa mais — a parcela ou o total? Posso verificar opções com FGTS ou entrada menor."
- "Vou pensar" → "Claro! O que ainda está em dúvida? Às vezes uma visita esclarece mais que mil fotos."
- "Já tenho corretor" → "Sem problema! Posso te mandar informações para você avaliar com mais calma."
- "Me manda só o preço" → Pergunte a finalidade antes de dar o número

Nunca diga "no momento não tenho disponível" sem buscar primeiro. Nunca encerre sem encaminhar.`;

  // ── REGRAS ────────────────────────────────────────────────────────────────
  const rules = `## REGRAS

1. *Nunca invente* imóveis, preços, disponibilidade ou confirmações de visita
2. *Seja concisa* — máximo 3-4 frases; use listas curtas se precisar de mais
3. *Visitas* → deixe claro que a equipe confirmará o horário
4. *Transferência* → avise: "Vou te conectar com [grupo/setor], que é especialista nisso 😊"
5. *Sem resolução* → "Vou chamar alguém da nossa equipe para continuar com você"
6. *Formatação WhatsApp* → use *negrito* para destacar; emojis com moderação (máx. 2 por mensagem)
7. *Retomada* → se o cliente demorou a responder, retome o contexto brevemente`;

  return [intro, mediaBlock, qualificationBlock, toolsBlock, routingBlock, intelligenceBlock, rules].join('\n\n');
}

const AGENT_TOOL_DEFS = [
  {
    name: 'buscar_imoveis',
    description: 'Busca imóveis disponíveis no catálogo da imobiliária pelos critérios informados.',
    input_schema: {
      type: 'object',
      properties: {
        purpose:       { type: 'string', enum: ['venda', 'locacao', 'venda_locacao', 'temporada'] },
        property_type: { type: 'string' },
        city:          { type: 'string' },
        bedrooms:      { type: 'integer' },
        min_price:     { type: 'number' },
        max_price:     { type: 'number' },
      },
    },
  },
  {
    name: 'enviar_ficha_imovel',
    description: 'Envia ao cliente, pelo WhatsApp, a foto de capa e os principais dados de um imóvel (pelo código, ex: IM-0001).',
    input_schema: {
      type: 'object',
      properties: { property_code: { type: 'string' } },
      required: ['property_code'],
    },
  },
  {
    name: 'buscar_empreendimentos',
    description: 'Busca empreendimentos/lançamentos disponíveis pelos critérios informados (cidade, status da obra).',
    input_schema: {
      type: 'object',
      properties: {
        city:                { type: 'string' },
        construction_status: { type: 'string', enum: ['lancamento', 'em_obras', 'pronto'] },
      },
    },
  },
  {
    name: 'enviar_ficha_empreendimento',
    description: 'Envia ao cliente, pelo WhatsApp, a foto de capa e os principais dados de um empreendimento (pelo código, ex: EMP-0001), incluindo unidades disponíveis.',
    input_schema: {
      type: 'object',
      properties: { development_code: { type: 'string' } },
      required: ['development_code'],
    },
  },
  {
    name: 'propor_visita',
    description: 'Registra uma proposta de visita a um imóvel numa data/horário sugeridos, para confirmação posterior pela equipe.',
    input_schema: {
      type: 'object',
      properties: {
        property_code: { type: 'string' },
        scheduled_at:  { type: 'string', description: 'Data/hora ISO 8601 sugerida' },
        notes:         { type: 'string' },
      },
      required: ['property_code', 'scheduled_at'],
    },
  },
  {
    name: 'rotear_para_grupo',
    description: 'Roteia o lead para o grupo de atendimento especializado (ex: Compra e Venda, Locação, Empreendimentos). Use quando o cliente já revelou seu perfil e está pronto para falar com um especialista. Retorna o nome do corretor atribuído.',
    input_schema: {
      type: 'object',
      properties: {
        grupo:  { type: 'string', description: 'Nome exato do grupo de atendimento conforme informado no contexto' },
        perfil: { type: 'string', description: 'Resumo do perfil do cliente (intenção, tipo de imóvel, orçamento, localização)' },
      },
      required: ['grupo'],
    },
  },
  {
    name: 'transferir_para_setor',
    description: 'Transfere a conversa para um setor/departamento específico da equipe quando o assunto não é sobre buscar/conhecer imóveis (ex: financeiro, jurídico, suporte pós-venda). Use o nome exato do setor conforme informado no contexto.',
    input_schema: {
      type: 'object',
      properties: {
        setor:  { type: 'string', description: 'Nome exato do setor/departamento' },
        motivo: { type: 'string', description: 'Breve motivo da transferência' },
      },
      required: ['setor'],
    },
  },
];

// Para Anthropic, AGENT_TOOL_DEFS já está no formato esperado por `tools`.
// Para OpenAI/custom (function calling), converte para o formato `tools: [{type:'function', function}]`.
const AGENT_TOOL_DEFS_OPENAI = AGENT_TOOL_DEFS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

const MAX_AGENT_TOOL_ITERATIONS = 3;

async function getConversationMessages(conversationId, includePrivate = false) {
  const r = await query(
    `SELECT m.direction, m.content, m.created_at, m.is_private, m.message_type,
            m.media_url, m.media_mime_type, m.extracted_text,
            u.name AS sender_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
       ${includePrivate ? '' : "AND m.is_private = false"}
       AND (m.content IS NOT NULL AND m.content != '' OR m.message_type != 'text')
     ORDER BY m.created_at DESC
     LIMIT 30`,
    [conversationId]
  );
  return r.rows.reverse();
}

function formatTranscript(messages) {
  return messages.map(m => {
    const role = m.direction === 'outbound'
      ? `Atendente${m.sender_name ? ` (${m.sender_name})` : ''}`
      : 'Cliente';

    if (m.extracted_text) {
      const preview = m.extracted_text.slice(0, 3000);
      return `${role} [PDF enviado]:\n---\n${preview}\n---`;
    }
    if (m.message_type === 'image')    return `${role}: [imagem enviada]`;
    if (m.message_type === 'audio')    return `${role}: [áudio enviado]`;
    if (m.message_type === 'video')    return `${role}: [vídeo enviado]`;
    if (m.message_type === 'document') return `${role}: [documento enviado: ${m.content || ''}]`;
    if (m.message_type === 'sticker')  return `${role}: [figurinha]`;
    return `${role}: ${m.content}`;
  }).join('\n');
}

/**
 * Fetch a media URL and return base64 + mime type.
 * Returns null if fetch fails (non-blocking).
 */
async function fetchMediaAsBase64(url) {
  try {
    const axios = require('axios');
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const base64 = Buffer.from(resp.data).toString('base64');
    const mime = resp.headers['content-type'] || 'image/jpeg';
    return { base64, mime };
  } catch {
    return null;
  }
}

/**
 * Build Anthropic multimodal message content from conversation messages.
 * Includes images and PDFs inline so Claude can analyze them.
 */
async function buildAnthropicContent(messages) {
  const parts = [];

  for (const m of messages) {
    const role = m.direction === 'outbound'
      ? `Atendente${m.sender_name ? ` (${m.sender_name})` : ''}`
      : 'Cliente';

    // Image with media_url → send inline for vision
    if (m.message_type === 'image' && m.media_url) {
      const media = await fetchMediaAsBase64(m.media_url);
      if (media) {
        parts.push({ type: 'text', text: `${role} [imagem]:` });
        parts.push({
          type: 'image',
          source: { type: 'base64', media_type: media.mime, data: media.base64 },
        });
        continue;
      }
    }

    // PDF/document with media_url → send as document for Claude to read
    if (m.message_type === 'document' && m.media_url) {
      const mime = m.media_mime_type || '';
      if (mime.includes('pdf') || m.media_url.toLowerCase().endsWith('.pdf')) {
        const media = await fetchMediaAsBase64(m.media_url);
        if (media) {
          parts.push({ type: 'text', text: `${role} [documento PDF]:` });
          parts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: media.base64 },
          });
          continue;
        }
      }
      // Non-PDF document: extracted text or filename
      if (m.extracted_text) {
        parts.push({ type: 'text', text: `${role} [documento]:\n---\n${m.extracted_text.slice(0, 3000)}\n---` });
        continue;
      }
    }

    // Text or fallback
    const text = formatTranscript([m]);
    if (text) parts.push({ type: 'text', text });
  }

  return parts;
}

async function analyzeConversation(conversationId, apiKey, provider = 'anthropic', model = null, stageContext = null, baseUrl = null) {
  let messages;
  try {
    messages = await getConversationMessages(conversationId);
  } catch (err) {
    logger.warn('getConversationMessages failed', { conversationId, err: err.message });
    throw Object.assign(new Error(`Erro ao buscar mensagens: ${err.message}`), { status: 400 });
  }
  if (!messages.length) {
    throw Object.assign(new Error('Conversa não tem mensagens para analisar'), { status: 400 });
  }

  const transcript   = formatTranscript(messages);
  const contextBlock = stageContext ? `\nCONTEXTO ADICIONAL DO FUNIL/ETAPA:\n${stageContext}\n` : '';
  const systemPrompt = `${contextBlock}Você é um assistente de CRM que analisa conversas de WhatsApp entre atendentes e clientes.
Sua tarefa é classificar o lead, extrair informações comerciais e identificar documentos importantes como orçamentos e comprovantes de pagamento.

REGRA FUNDAMENTAL para classificação — leia com atenção:
- "Novo Lead": NÃO há NENHUMA mensagem de "Atendente" na conversa. O cliente entrou em contato mas nenhum atendente respondeu ainda.
- "Em Atendimento": existe AO MENOS UMA mensagem de "Atendente" na conversa, mesmo que curta ou apenas de saudação. Se o atendente respondeu qualquer coisa, já é "Em Atendimento".
- "Qualificado para Venda": o cliente demonstrou interesse real em comprar, pediu orçamento, enviou especificações ou demonstrou intenção clara de fechar negócio.
- "Comprou": cliente confirmou compra, pagamento realizado ou negócio explicitamente fechado.
- "Negócio Perdido": cliente desistiu, disse que não tem interesse, pediu para parar de ser contatado ou sumiu após proposta.

IMPORTANTE: Se você vir mensagens de "Atendente" na conversa, NUNCA classifique como "Novo Lead".

ANÁLISE DE IMAGENS E DOCUMENTOS:
- Se receber imagens ou PDFs, analise o conteúdo visual/textual.
- Orçamentos/propostas: extraia o valor total do negócio e itens principais.
- Comprovantes de pagamento (PIX, transferência, boleto pago): se identificar um comprovante válido, classifique como "Comprou" e extraia o valor pago.
- Ignore imagens irrelevantes (figurinhas, fotos de produtos sem valor).

LEAD SCORE (0 a 100): avalie a qualidade/probabilidade de fechamento deste lead considerando:
- Engajamento: o cliente responde rápido e com interesse genuíno?
- Intenção de compra/locação: demonstrou urgência, prazo ou motivo claro para fechar negócio?
- Orçamento: o valor que o cliente busca é compatível com o que está sendo oferecido?
- Especificidade: o cliente já definiu requisitos claros (localização, tipo de imóvel, valor)?
- Estágio do funil: leads em "Qualificado para Venda" ou "Comprou" tendem a pontuar mais alto; "Novo Lead" sem interação tende a pontuar baixo.
Use 0-20 para leads frios/sem engajamento, 21-50 para leads em atendimento mas ainda incertos, 51-80 para leads qualificados com bom potencial, 81-100 para leads muito próximos do fechamento.

Responda SOMENTE com um JSON no formato:
{
  "stage": "<nome exato da etapa>",
  "summary": "<resumo de 2-3 frases descrevendo o cliente, o que ele quer e qual é a situação atual do negócio>",
  "confidence": <número de 0 a 1>,
  "deal_value": <valor numérico em reais se encontrado em documentos ou comprovante, ou null>,
  "payment_detected": <true se identificou comprovante de pagamento, false caso contrário>,
  "lead_score": <número inteiro de 0 a 100 representando a qualidade do lead>
}`;

  try {
    let userContent;
    if (provider === 'anthropic') {
      // Use multimodal content: images and PDFs sent inline
      const mediaParts = await buildAnthropicContent(messages);
      userContent = [
        { type: 'text', text: 'Analise esta conversa e classifique o lead:' },
        ...mediaParts,
      ];
    } else {
      userContent = `Analise esta conversa e classifique o lead:\n\n${transcript}`;
    }

    const text = await callLLM({
      provider, apiKey, baseUrl, model, system: systemPrompt, maxTokens: 600,
      messages: [{ role: 'user', content: userContent }],
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn('AI analysis failed', { conversationId, err: err.message });
    throw Object.assign(new Error(`Falha na API de IA: ${err.message}`), { status: 400 });
  }
}

async function generateFollowUp(conversationId, triggerType, apiKey, provider = 'anthropic', model = null, baseUrl = null) {
  const messages = await getConversationMessages(conversationId);

  const convRes = await query(
    `SELECT ct.name AS contact_name FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id WHERE c.id = $1`,
    [conversationId]
  );
  const contactName = convRes.rows[0]?.contact_name || 'você';
  const timeLabels  = { '30min': '30 minutos', '1day': '1 dia', '3day': '3 dias' };
  const timeLabel   = timeLabels[triggerType] || triggerType;
  const transcript  = messages.length ? formatTranscript(messages.slice(-10)) : '(sem mensagens anteriores)';

  try {
    return await callLLM({
      provider, apiKey, baseUrl, model, maxTokens: 200,
      system: `Você é um assistente de vendas especializado em follow-up de leads no WhatsApp.
Você deve criar mensagens de follow-up naturais, amigáveis e não invasivas em português brasileiro.
A mensagem deve ser curta (2-4 frases), direta e despertar interesse sem ser insistente.
NÃO use emojis excessivos. Seja profissional mas caloroso.`,
      messages: [{
        role: 'user',
        content: `Contexto da conversa anterior:\n${transcript}\n\nCrie uma mensagem de follow-up para ${contactName} que não respondeu há ${timeLabel}. O objetivo é retomar o contato de forma natural.`,
      }],
    }) || null;
  } catch (err) {
    logger.warn('Follow-up generation failed', { conversationId, err: err.message });
    return null;
  }
}

/**
 * Generate a chatbot response for the last inbound message.
 */
async function generateChatbotResponse(conversationId, systemPrompt, apiKey, provider = 'anthropic', model = null, baseUrl = null) {
  const messages = await getConversationMessages(conversationId);
  if (!messages.length) return null;

  // Build alternating user/assistant message history
  const history = [];
  for (const m of messages.slice(-15)) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    // Merge consecutive same-role messages
    if (history.length && history[history.length - 1].role === role) {
      history[history.length - 1].content += '\n' + (m.content || '');
    } else {
      history.push({ role, content: m.content || '' });
    }
  }

  // Must end with user message
  if (!history.length || history[history.length - 1].role !== 'user') return null;

  try {
    return await callLLM({
      provider, apiKey, baseUrl, model, maxTokens: 300,
      system: systemPrompt || 'Você é um assistente de atendimento ao cliente. Responda de forma educada, clara e concisa em português brasileiro.',
      messages: history,
    }) || null;
  } catch (err) {
    logger.warn('Chatbot response failed', { conversationId, err: err.message });
    return null;
  }
}

/**
 * Constrói o histórico de mensagens (user/assistant alternado) usado tanto
 * por generateChatbotResponse quanto pelos loops de tool-use do agente de IA.
 */
function buildChatHistory(messages) {
  const history = [];
  for (const m of messages.slice(-15)) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    if (history.length && history[history.length - 1].role === role) {
      history[history.length - 1].content += '\n' + (m.content || '');
    } else {
      history.push({ role, content: m.content || '' });
    }
  }
  return history;
}

async function analyzeDeal(dealId, workspaceId) {
  const r = await query(
    `SELECT d.id, d.conversation_id, d.contact_id, d.pipeline_id, d.ai_analyzed_at,
            ks.ai_prompt AS stage_ai_prompt,
            w.anthropic_api_key, w.openai_api_key, w.custom_ai_api_key, w.ai_base_url,
            w.ai_provider, w.ai_model, w.ai_analysis_enabled,
            c.last_message_at, c.first_response_at
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     LEFT JOIN kanban_stages ks ON ks.id = d.stage_id
     LEFT JOIN conversations c ON c.id = d.conversation_id
     WHERE d.id = $1 AND d.workspace_id = $2`,
    [dealId, workspaceId]
  );
  if (!r.rows.length) {
    logger.warn('analyzeDeal: deal not found', { dealId, workspaceId });
    return null;
  }

  let { conversation_id, contact_id, pipeline_id, stage_ai_prompt, anthropic_api_key, openai_api_key, custom_ai_api_key, ai_base_url, ai_provider, ai_model, ai_analysis_enabled, ai_analyzed_at, last_message_at, first_response_at } = r.rows[0];

  // Se já foi analisado antes, só re-analisa se:
  // - houve mensagem nos últimos 30 minutos, OU
  // - agente ainda não respondeu (first_response_at IS NULL) — mantém análise atualizada enquanto aguarda
  if (ai_analyzed_at && last_message_at) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const hasRecentActivity = new Date(last_message_at) >= thirtyMinAgo;
    const awaitingFirstResponse = !first_response_at;
    if (!hasRecentActivity && !awaitingFirstResponse) {
      logger.debug('analyzeDeal: skipped — no recent activity and already responded', { dealId });
      return null;
    }
  }
  const provider = ai_provider || 'anthropic';
  const apiKey   = provider === 'custom' ? custom_ai_api_key
                 : provider === 'openai' ? openai_api_key
                 : anthropic_api_key;
  const baseUrl  = provider === 'custom' ? ai_base_url : null;
  const canRun   = provider === 'custom' ? !!baseUrl : !!apiKey;

  logger.info('analyzeDeal: config check', {
    dealId, workspaceId, provider,
    ai_analysis_enabled,
    hasApiKey: !!apiKey,
    hasBaseUrl: !!baseUrl,
    conversation_id,
    contact_id,
  });

  if (!ai_analysis_enabled) {
    logger.warn('analyzeDeal: ai_analysis_enabled is false');
    return null;
  }
  if (!canRun) {
    logger.warn('analyzeDeal: no api key/base url configured for provider', { provider });
    return null;
  }

  // Fallback: se deal não tem conversation_id (deals antigos), busca a conversa mais recente do contato
  if (!conversation_id && contact_id) {
    const convRes = await query(
      `SELECT id FROM conversations
       WHERE workspace_id = $1 AND contact_id = $2
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 1`,
      [workspaceId, contact_id]
    );
    if (convRes.rows.length) {
      conversation_id = convRes.rows[0].id;
      logger.info('analyzeDeal: linked conversation via contact fallback', { dealId, conversation_id });
      await query('UPDATE deals SET conversation_id = $1 WHERE id = $2', [conversation_id, dealId]);
    }
  }

  if (!conversation_id) {
    logger.warn('analyzeDeal: no conversation found for deal', { dealId, contact_id });
    return null;
  }

  const result = await analyzeConversation(conversation_id, apiKey, provider, ai_model || null, stage_ai_prompt || null, baseUrl);
  if (!result) throw Object.assign(new Error('IA não retornou classificação (resposta inválida)'), { status: 400 });

  // Dynamic stage name lookup from the deal's pipeline
  let stageId = null;
  if (result.stage && pipeline_id) {
    const stageRes = await query(
      `SELECT id FROM kanban_stages WHERE pipeline_id = $1 AND name = $2`,
      [pipeline_id, result.stage]
    );
    if (stageRes.rows.length && result.confidence >= 0.7) stageId = stageRes.rows[0].id;
  } else if (result.stage) {
    // Legacy: workspace-scoped stages
    const stageRes = await query(
      `SELECT id FROM kanban_stages WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, result.stage]
    );
    if (stageRes.rows.length && result.confidence >= 0.7) stageId = stageRes.rows[0].id;
  }

  const updates = {
    ai_qualification: result.stage,
    ai_summary:       result.summary,
    ai_analyzed_at:   new Date(),
  };
  if (stageId) updates.stage_id = stageId;
  if (typeof result.lead_score === 'number' && Number.isFinite(result.lead_score)) {
    updates.lead_score = Math.max(0, Math.min(100, Math.round(result.lead_score)));
  }

  // ── Detecção de compra ─────────────────────────────────────────────────────
  // 1. IA sinalizou payment_detected
  // 2. OU mensagens da conversa contêm padrão de pedido com valor
  const metaSvc = require('../modules/meta/meta.service');
  let purchaseValue = null;

  if (result.deal_value && typeof result.deal_value === 'number' && result.deal_value > 0) {
    purchaseValue = result.deal_value;
  } else {
    // Varre as últimas mensagens em busca de padrão de pedido
    const msgsRes = await query(
      `SELECT content FROM messages
       WHERE conversation_id = $1 AND content IS NOT NULL
       ORDER BY created_at DESC LIMIT 20`,
      [conversation_id]
    );
    for (const m of msgsRes.rows) {
      const detected = metaSvc.detectPurchaseFromMessage(m.content);
      if (detected) { purchaseValue = detected.value; break; }
    }
  }

  // Atualiza valor do deal se ainda está zerado
  if (purchaseValue && purchaseValue > 0) {
    const dealRes = await query('SELECT value FROM deals WHERE id = $1', [dealId]);
    const currentValue = parseFloat(dealRes.rows[0]?.value || 0);
    if (currentValue === 0) updates.value = purchaseValue;
  }

  // Detecta se deve mover para etapa de compra (is_purchase = true OU payment_detected)
  const isPurchaseDetected = result.payment_detected || purchaseValue !== null;
  let purchaseStageId = null;

  if (isPurchaseDetected && pipeline_id) {
    // Prioridade: etapa marcada como is_purchase
    const purchaseStageRes = await query(
      `SELECT id FROM kanban_stages WHERE pipeline_id = $1 AND is_purchase = true ORDER BY position LIMIT 1`,
      [pipeline_id]
    );
    if (purchaseStageRes.rows.length) {
      purchaseStageId = purchaseStageRes.rows[0].id;
    } else {
      // Fallback: etapa chamada "Comprou"
      const comprouRes = await query(
        `SELECT id FROM kanban_stages WHERE pipeline_id = $1 AND name ILIKE '%comprou%' LIMIT 1`,
        [pipeline_id]
      );
      if (comprouRes.rows.length) purchaseStageId = comprouRes.rows[0].id;
    }
    if (purchaseStageId) updates.stage_id = purchaseStageId;
  }

  const fields = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const vals   = [...Object.values(updates), dealId, workspaceId];

  await query(
    `UPDATE deals SET ${fields.join(', ')}
     WHERE id = $${vals.length - 1} AND workspace_id = $${vals.length}`,
    vals
  );

  // Dispara Purchase event ao Meta CAPI quando deal movido para etapa de compra
  if (purchaseStageId && (purchaseValue || updates.value)) {
    try {
      const wsRes = await query(
        'SELECT id, meta_pixel_id, meta_conversions_token FROM workspaces WHERE id = $1',
        [workspaceId]
      );
      const ws = wsRes.rows[0];
      if (ws?.meta_pixel_id && ws?.meta_conversions_token) {
        const contactRes = await query('SELECT * FROM contacts WHERE id = $1', [contact_id]);
        const contact    = contactRes.rows[0];
        if (contact) {
          const fakeDeal = { id: dealId, value: purchaseValue || updates.value || 0, currency: 'BRL' };
          metaSvc.sendPurchaseEvent(ws, { contact, deal: fakeDeal }).catch(err =>
            logger.warn('Meta Purchase event failed (AI)', { err: err.message, dealId })
          );
          logger.info('Meta Purchase event triggered by AI', { dealId, value: fakeDeal.value });
        }
      }
    } catch (err) {
      logger.warn('Meta Purchase event setup failed', { err: err.message });
    }
  }

  return { ...result, dealId };
}

// ── Avaliação automática de preço (CMA) ─────────────────────────────────────

/**
 * Gera uma análise comparativa de mercado (CMA) para um imóvel, com base em
 * imóveis semelhantes do mesmo workspace (mesmo tipo, finalidade e
 * metragem/localização próximas), usando o LLM configurado.
 */
async function generateCMA(propertyId, workspaceId) {
  const wsRes = await query(
    `SELECT anthropic_api_key, openai_api_key, custom_ai_api_key, ai_base_url, ai_provider, ai_model
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  if (!wsRes.rows.length) throw Object.assign(new Error('Workspace não encontrado'), { status: 404 });

  const ws       = wsRes.rows[0];
  const provider = ws.ai_provider || 'anthropic';
  const apiKey   = provider === 'custom' ? ws.custom_ai_api_key
                 : provider === 'openai' ? ws.openai_api_key
                 : ws.anthropic_api_key;
  const baseUrl  = provider === 'custom' ? ws.ai_base_url : null;
  const canRun   = provider === 'custom' ? !!baseUrl : !!apiKey;
  if (!canRun) {
    throw Object.assign(new Error('Nenhum provedor de IA configurado para este workspace'), { status: 400 });
  }

  const property = await propertiesSvc.getById(propertyId, workspaceId);
  if (!property) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });

  const area = property.built_area || property.total_area;

  // Busca imóveis comparáveis: mesmo tipo/finalidade, área próxima (±40%) e mesma cidade quando disponível
  const compRes = await query(
    `SELECT code, title, neighborhood, city, sale_price, rent_price, total_area, built_area,
            bedrooms, bathrooms, parking_spots, status
     FROM properties
     WHERE workspace_id = $1
       AND id != $2
       AND property_type = $3
       AND purpose = $4
       AND (sale_price IS NOT NULL OR rent_price IS NOT NULL)
       AND ($5::numeric IS NULL OR COALESCE(built_area, total_area) IS NULL
            OR COALESCE(built_area, total_area) BETWEEN $5 * 0.6 AND $5 * 1.4)
     ORDER BY (CASE WHEN city = $6 THEN 0 ELSE 1 END), created_at DESC
     LIMIT 8`,
    [workspaceId, propertyId, property.property_type, property.purpose, area || null, property.city]
  );

  if (!compRes.rows.length) {
    throw Object.assign(new Error('Não há imóveis comparáveis suficientes no catálogo para gerar a avaliação'), { status: 400 });
  }

  const subjectLines = [
    `Imóvel avaliado: ${property.title} (${property.code})`,
    `Tipo: ${property.property_type} · Finalidade: ${property.purpose}`,
    `Localização: ${[property.neighborhood, property.city, property.state].filter(Boolean).join(', ') || 'não informada'}`,
    `Área total: ${property.total_area ?? '—'} m² · Área construída: ${property.built_area ?? '—'} m²`,
    `Quartos: ${property.bedrooms ?? '—'} · Banheiros: ${property.bathrooms ?? '—'} · Suítes: ${property.suites ?? '—'} · Vagas: ${property.parking_spots ?? '—'}`,
    `Condomínio: ${property.condo_fee ?? '—'} · IPTU: ${property.iptu ?? '—'}`,
    `Preço atual de venda: ${property.sale_price ?? 'não informado'} · Preço atual de locação: ${property.rent_price ?? 'não informado'}`,
  ].join('\n');

  const comparablesText = compRes.rows.map((c, i) => [
    `${i + 1}. ${c.title} (${c.code}) — ${[c.neighborhood, c.city].filter(Boolean).join(', ') || '—'}`,
    `   Área: ${c.built_area ?? c.total_area ?? '—'} m² · Quartos: ${c.bedrooms ?? '—'} · Banheiros: ${c.bathrooms ?? '—'} · Vagas: ${c.parking_spots ?? '—'}`,
    `   Venda: ${c.sale_price ?? '—'} · Locação: ${c.rent_price ?? '—'} · Status: ${c.status}`,
  ].join('\n')).join('\n');

  const systemPrompt = `Você é um especialista em avaliação de imóveis (CMA — Comparative Market Analysis) no Brasil.
Com base no imóvel avaliado e nos imóveis comparáveis do mesmo catálogo, sugira uma faixa de preço de ${property.purpose === 'locacao' ? 'locação mensal' : 'venda'} em reais (BRL).

Considere diferenças de área, localização, quartos, vagas e estado dos comparáveis para ajustar a estimativa.

Responda SOMENTE com um JSON no formato:
{
  "price_min": <número, faixa mínima sugerida em reais>,
  "price_max": <número, faixa máxima sugerida em reais>,
  "suggested_price": <número, valor pontual sugerido em reais>,
  "analysis": "<análise de 3-5 frases em português explicando a faixa sugerida, citando os comparáveis usados como referência>"
}`;

  const userContent = `IMÓVEL AVALIADO:\n${subjectLines}\n\nCOMPARÁVEIS NO CATÁLOGO:\n${comparablesText}`;

  const text = await callLLM({
    provider, apiKey, baseUrl, model: ws.ai_model, system: systemPrompt, maxTokens: 600,
    messages: [{ role: 'user', content: userContent }],
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw Object.assign(new Error('Resposta inválida da IA'), { status: 502 });
  const result = JSON.parse(jsonMatch[0]);

  await query(
    `UPDATE properties
     SET cma_price_min = $1, cma_price_max = $2, cma_suggested_price = $3, cma_analysis = $4, cma_generated_at = NOW()
     WHERE id = $5 AND workspace_id = $6`,
    [result.price_min ?? null, result.price_max ?? null, result.suggested_price ?? null, result.analysis ?? null, propertyId, workspaceId]
  );

  return propertiesSvc.getById(propertyId, workspaceId);
}

// ── Agente de IA — execução de ferramentas e loops de tool-use ──────────────

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function buildPropertyCaption(p) {
  const price = [
    p.sale_price ? `Venda: ${formatBRL(p.sale_price)}` : null,
    p.rent_price ? `Aluguel: ${formatBRL(p.rent_price)}/mês` : null,
  ].filter(Boolean).join(' · ');
  const features = [
    p.bedrooms      ? `${p.bedrooms} quarto(s)`    : null,
    p.bathrooms     ? `${p.bathrooms} banheiro(s)` : null,
    p.parking_spots ? `${p.parking_spots} vaga(s)` : null,
    p.total_area    ? `${p.total_area}m²`          : null,
  ].filter(Boolean).join(' · ');
  return [
    `*${p.code} — ${p.title}*`,
    [p.neighborhood, p.city].filter(Boolean).join(', '),
    price, features,
  ].filter(Boolean).join('\n');
}

const CONSTRUCTION_STATUS_LABELS = {
  lancamento: 'Lançamento', em_obras: 'Em obras', pronto: 'Pronto para morar',
};

function buildDevelopmentCaption(d) {
  const availableUnits = (d.units || []).filter(u => u.status === 'disponivel');
  return [
    `*${d.code} — ${d.name}*`,
    [d.neighborhood, d.city].filter(Boolean).join(', '),
    d.builder_name ? `Construtora: ${d.builder_name}` : null,
    `Status: ${CONSTRUCTION_STATUS_LABELS[d.construction_status] || d.construction_status}`,
    availableUnits.length ? `Unidades disponíveis: ${availableUnits.length}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Executa uma ferramenta do agente de IA. ctx = { workspaceId, conversationId, contactId, io }
 */
async function executeAgentTool(name, input, ctx) {
  try {
    switch (name) {
      case 'buscar_imoveis': {
        const { data } = await propertiesSvc.list(ctx.workspaceId, {
          purpose: input.purpose, type: input.property_type, city: input.city,
          bedrooms: input.bedrooms, minPrice: input.min_price, maxPrice: input.max_price,
          status: 'disponivel', limit: 5,
        });
        return {
          count: data.length,
          properties: data.map(p => ({
            code: p.code, title: p.title, type: p.property_type, purpose: p.purpose,
            city: p.city, neighborhood: p.neighborhood, bedrooms: p.bedrooms,
            sale_price: p.sale_price, rent_price: p.rent_price,
          })),
        };
      }
      case 'enviar_ficha_imovel': {
        const property = await propertiesSvc.getByCode(ctx.workspaceId, input.property_code);
        if (!property) return { success: false, error: 'Imóvel não encontrado' };
        const caption = buildPropertyCaption(property);
        await messagesSvc.send(ctx.conversationId, null, property.cover_url
          ? { content: caption, messageType: 'image', mediaUrl: property.cover_url }
          : { content: caption, messageType: 'text' });
        return { success: true };
      }
      case 'propor_visita': {
        const property = await propertiesSvc.getByCode(ctx.workspaceId, input.property_code);
        if (!property) return { success: false, error: 'Imóvel não encontrado' };
        const when = new Date(input.scheduled_at);
        if (isNaN(when.getTime())) return { success: false, error: 'Data/hora inválida' };
        const visit = await visitsSvc.create(ctx.workspaceId, {
          propertyId: property.id, contactId: ctx.contactId, conversationId: ctx.conversationId,
          assigneeId: property.broker_id || null, scheduledAt: when, notes: input.notes || null,
          createdByAi: true,
        });
        ctx.io?.to(`ws:${ctx.workspaceId}`).emit('visit:proposed', visit);
        return { success: true, status: 'proposta' };
      }
      case 'buscar_empreendimentos': {
        const { data } = await developmentsSvc.list(ctx.workspaceId, {
          city: input.city, constructionStatus: input.construction_status, limit: 5,
        });
        return {
          count: data.length,
          developments: data.map(d => ({
            code: d.code, name: d.name, builder: d.builder_name,
            construction_status: d.construction_status,
            city: d.city, neighborhood: d.neighborhood, units_count: d.units_count,
          })),
        };
      }
      case 'enviar_ficha_empreendimento': {
        const development = await developmentsSvc.getByCode(ctx.workspaceId, input.development_code);
        if (!development) return { success: false, error: 'Empreendimento não encontrado' };
        const caption = buildDevelopmentCaption(development);
        await messagesSvc.send(ctx.conversationId, null, development.cover_url
          ? { content: caption, messageType: 'image', mediaUrl: development.cover_url }
          : { content: caption, messageType: 'text' });
        return { success: true };
      }
      case 'rotear_para_grupo': {
        const routingGroupSvc = require('../modules/ai-agent/ai-agent.service');
        const wanted = String(input.grupo || '').toLowerCase().trim();

        const groupsRes = await query(
          `SELECT id, name FROM ai_routing_groups WHERE workspace_id = $1 AND is_active = true`,
          [ctx.workspaceId]
        );
        const target = groupsRes.rows.find(g => g.name.toLowerCase() === wanted)
          || groupsRes.rows.find(g => g.name.toLowerCase().includes(wanted) || wanted.includes(g.name.toLowerCase()));

        if (!target) {
          return { success: false, error: 'Grupo não encontrado', grupos_disponiveis: groupsRes.rows.map(g => g.name) };
        }

        const userId = await routingGroupSvc.pickNextMember(target.id);
        if (!userId) {
          return { success: false, error: 'Nenhum corretor ativo no grupo', grupo: target.name };
        }

        const assigned = await query(
          'UPDATE conversations SET assignee_id = $1, bot_active = false WHERE id = $2 AND assignee_id IS NULL RETURNING id',
          [userId, ctx.conversationId]
        );

        const userRes = await query('SELECT name FROM users WHERE id = $1', [userId]);
        const agentName = userRes.rows[0]?.name || 'da equipe';

        if (assigned.rows.length) {
          const payload = { conversationId: ctx.conversationId, assigneeId: userId };
          ctx.io?.to(`ws:${ctx.workspaceId}`).emit('conversation:updated', payload);
          ctx.io?.to(`conv:${ctx.conversationId}`).emit('conversation:updated', payload);
        }

        if (input.perfil) {
          await query(
            `UPDATE deals SET ai_summary = $1 WHERE conversation_id = $2`,
            [input.perfil, ctx.conversationId]
          ).catch(() => {});
        }

        return { success: true, grupo: target.name, corretor: agentName };
      }
      case 'transferir_para_setor': {
        const departments = ctx.departments || [];
        if (!departments.length) {
          return { success: false, error: 'Nenhum setor configurado para transferência' };
        }
        const wanted = String(input.setor || '').toLowerCase().trim();
        const target = departments.find(d => d.name.toLowerCase() === wanted)
          || departments.find(d => d.name.toLowerCase().includes(wanted) || wanted.includes(d.name.toLowerCase()));
        if (!target) {
          return { success: false, error: 'Setor não encontrado', setores_disponiveis: departments.map(d => d.name) };
        }

        await query('UPDATE conversations SET department_id = $1 WHERE id = $2', [target.id, ctx.conversationId]);

        // Auto-assign: agente do setor com menos conversas abertas
        let agentId = null;
        const agentRes = await query(
          `SELECT wm.user_id, COUNT(c.id)::int AS open_count
           FROM workspace_memberships wm
           LEFT JOIN conversations c ON c.assignee_id = wm.user_id AND c.workspace_id = $1 AND c.status = 'open'
           WHERE wm.workspace_id = $1 AND wm.role IN ('agent','member') AND wm.department_id = $2
           GROUP BY wm.user_id ORDER BY open_count ASC, RANDOM() LIMIT 1`,
          [ctx.workspaceId, target.id]
        );
        if (agentRes.rows.length) {
          agentId = agentRes.rows[0].user_id;
          const assigned = await query(
            'UPDATE conversations SET assignee_id = $1 WHERE id = $2 AND assignee_id IS NULL RETURNING id',
            [agentId, ctx.conversationId]
          );
          if (!assigned.rows.length) agentId = null;
        }

        const payload = { conversationId: ctx.conversationId, departmentId: target.id, assigneeId: agentId };
        ctx.io?.to(`ws:${ctx.workspaceId}`).emit('conversation:updated', payload);
        ctx.io?.to(`conv:${ctx.conversationId}`).emit('conversation:updated', payload);

        return { success: true, setor: target.name };
      }
      default:
        return { success: false, error: 'Ferramenta desconhecida' };
    }
  } catch (err) {
    logger.warn('AI agent tool execution failed', { name, err: err.message });
    return { success: false, error: 'Erro interno ao executar ação' };
  }
}

/**
 * Loop de tool-use usando a Tools API nativa da Anthropic.
 */
async function runAnthropicToolLoop({ apiKey, model, system, history, ctx }) {
  const resolvedModel = model || DEFAULT_MODELS.anthropic.smart;
  const client   = new Anthropic({ apiKey });
  const messages = [...history];

  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: resolvedModel, max_tokens: 400, system, messages, tools: AGENT_TOOL_DEFS,
    });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return text || null;
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeAgentTool(block.name, block.input || {}, ctx);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return null;
}

/**
 * Loop de tool-use no formato function-calling da OpenAI, usado tanto para
 * provider 'openai' quanto 'custom' (ex: Ollama com endpoint /v1/chat/completions).
 */
async function runOpenAICompatToolLoop({ apiKey, baseUrl, model, system, history, ctx }) {
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';
  const resolvedModel = model || (baseUrl ? undefined : DEFAULT_MODELS.openai.smart);
  const messages = [{ role: 'system', content: system }, ...history];

  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    const resp = await axios.post(
      url,
      { model: resolvedModel, messages, max_tokens: 400, tools: AGENT_TOOL_DEFS_OPENAI },
      { headers: { Authorization: `Bearer ${apiKey || 'ollama'}` }, timeout: 30000 }
    );
    const message = resp.data.choices[0]?.message;
    if (!message) return null;

    if (!message.tool_calls?.length) {
      return message.content?.trim() || null;
    }

    messages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
      const result = await executeAgentTool(tc.function.name, input, ctx);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return null;
}

/**
 * Loop de tool-use usando a Function Calling API nativa do Google Gemini.
 */
async function runGeminiToolLoop({ apiKey, model, system, history, ctx }) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const resolvedModel = model || DEFAULT_MODELS.gemini.smart;

  const geminiTools = [{
    functionDeclarations: AGENT_TOOL_DEFS.map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  {
        type:       'OBJECT',
        properties: toGeminiProperties(t.input_schema?.properties),
        required:   t.input_schema?.required || [],
      },
    })),
  }];

  const client   = genAI.getGenerativeModel({ model: resolvedModel, systemInstruction: system, tools: geminiTools });
  const contents = history.map(m => ({
    role:  m.role === 'user' ? 'user' : 'model',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));

  for (let i = 0; i < MAX_AGENT_TOOL_ITERATIONS; i++) {
    const gen       = await client.generateContent({ contents, generationConfig: { maxOutputTokens: 400 } });
    const calls     = gen.response.functionCalls?.() || [];

    if (!calls.length) return gen.response.text().trim() || null;

    // Adiciona resposta do model com as chamadas de ferramenta
    contents.push({ role: 'model', parts: calls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })) });

    // Executa ferramentas e devolve resultados
    const resultParts = [];
    for (const fc of calls) {
      const toolResult = await executeAgentTool(fc.name, fc.args || {}, ctx);
      resultParts.push({ functionResponse: { name: fc.name, response: toolResult } });
    }
    contents.push({ role: 'user', parts: resultParts });
  }

  return null;
}

/**
 * Gera a resposta do chatbot com acesso às ferramentas do agente de IA (busca
 * de imóveis, envio de ficha, proposta de visita). ws = row de `workspaces`
 * (anthropic_api_key, openai_api_key, gemini_api_key, custom_ai_api_key,
 * ai_base_url, ai_provider, ai_model). ctx = { workspaceId, conversationId, contactId, io }.
 */
async function generateChatbotResponseWithTools(conversationId, systemPrompt, ws, ctx) {
  const messages = await getConversationMessages(conversationId);
  if (!messages.length) return null;

  const history = buildChatHistory(messages);
  if (!history.length || history[history.length - 1].role !== 'user') return null;

  const provider = ws.ai_provider || 'anthropic';
  try {
    if (provider === 'anthropic') {
      return await runAnthropicToolLoop({ apiKey: ws.anthropic_api_key, model: ws.ai_model, system: systemPrompt, history, ctx });
    }
    if (provider === 'gemini') {
      return await runGeminiToolLoop({ apiKey: ws.gemini_api_key, model: ws.ai_model, system: systemPrompt, history, ctx });
    }
    const apiKey  = provider === 'custom' ? ws.custom_ai_api_key : ws.openai_api_key;
    const baseUrl = provider === 'custom' ? ws.ai_base_url : 'https://api.openai.com/v1';
    return await runOpenAICompatToolLoop({ apiKey, baseUrl, model: ws.ai_model, system: systemPrompt, history, ctx });
  } catch (err) {
    logger.warn('AI agent tool loop failed', { conversationId, err: err.message });
    return null;
  }
}

// ── Geração de descrição de imóvel ─────────────────────────────────────────

/**
 * Gera uma descrição profissional de imóvel usando o provedor de IA
 * configurado especificamente para geração de textos no workspace.
 * Independente das configurações do agente de atendimento.
 */
async function generatePropertyDescription(workspace, property) {
  const provider = workspace.description_ai_provider || workspace.ai_provider || 'anthropic';
  const model    = workspace.description_ai_model || '';
  const apiKey   = provider === 'openai'  ? workspace.openai_api_key
                 : provider === 'gemini'  ? workspace.gemini_api_key
                 : provider === 'custom'  ? workspace.custom_ai_api_key
                 :                         workspace.anthropic_api_key;

  const purposeLabel = { venda: 'Venda', locacao: 'Locação', venda_locacao: 'Venda e Locação', temporada: 'Temporada' }[property.purpose] || property.purpose;

  const priceStr = property.sale_price
    ? `R$ ${Number(property.sale_price).toLocaleString('pt-BR')}`
    : property.rent_price
    ? `R$ ${Number(property.rent_price).toLocaleString('pt-BR')}/mês`
    : 'consulte';

  const amenities = Array.isArray(property.amenities) && property.amenities.length
    ? property.amenities.join(', ')
    : 'não informadas';

  const system = `Você é especialista em marketing imobiliário brasileiro. Escreva descrições atrativas, profissionais e persuasivas. Use linguagem clara, destaque benefícios e estilo de vida. Sempre em português brasileiro. Máximo 220 palavras.`;

  const prompt = `Escreva uma descrição de marketing para este imóvel:

Tipo: ${property.property_type || 'Imóvel'}
Finalidade: ${purposeLabel}
Localização: ${[property.neighborhood, property.city, property.state].filter(Boolean).join(', ')}
Quartos: ${property.bedrooms ?? '—'} | Banheiros: ${property.bathrooms ?? '—'} | Vagas: ${property.parking_spots ?? '—'}
Área total: ${property.total_area ? property.total_area + 'm²' : '—'} | Área construída: ${property.built_area ? property.built_area + 'm²' : '—'}
Preço: ${priceStr}
Comodidades: ${amenities}
${property.floor_number ? `Andar: ${property.floor_number}` : ''}
${property.year_built ? `Ano: ${property.year_built}` : ''}

Crie uma descrição envolvente que conte uma história sobre o estilo de vida que este imóvel proporciona. Não liste apenas características — seja persuasivo e emocional.`;

  return callLLM({
    provider,
    apiKey,
    baseUrl: workspace.ai_base_url,
    model,
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
  });
}

// ── Sugestão de score de lead ───────────────────────────────────────────────

/**
 * Calcula/atualiza o lead score de um deal com base em comportamento e qualificação.
 * Retorna score de 0-100.
 */
async function recalcLeadScore(workspace, deal) {
  let score = 0;

  // Engajamento (mensagens)
  if (deal.message_count > 10) score += 20;
  else if (deal.message_count > 5) score += 10;
  else if (deal.message_count > 2) score += 5;

  // Tempo de resposta rápido (lead engajado)
  if (deal.response_time_seconds != null && deal.response_time_seconds < 300) score += 15;

  // Qualificação IA
  const qualScore = { 'Alta': 30, 'Média': 20, 'Baixa': 5, 'Inválido': 0 };
  score += qualScore[deal.ai_qualification] ?? 0;

  // Imóvel vinculado = interesse específico
  if (deal.property_id) score += 15;

  // Visita agendada ou realizada
  if (deal.has_visit) score += 20;

  // Cap 100
  return Math.min(score, 100);
}

module.exports = {
  callLLM,
  analyzeConversation, generateFollowUp, generateChatbotResponse, analyzeDeal,
  generateChatbotResponseWithTools, DEFAULT_AGENT_PERSONA, buildAgentPersona,
  generateCMA, generatePropertyDescription, recalcLeadScore,
};
