'use strict';

const { query } = require('../../config/database');

// ── Contatos fictícios (usados em ambos os modelos) ────────────────────────

const CONTACTS = [
  { name: 'Ana Carvalho',      phone: '11991234501', email: 'ana.carvalho@demo.com.br',      tags: ['interessado'],            notes: 'Procura apartamento de 2 quartos na Zona Sul.' },
  { name: 'Bruno Santos',      phone: '11991234502', email: 'bruno.santos@demo.com.br',      tags: ['qualificado', 'investidor'], notes: 'Investidor, busca imóvel para renda passiva.' },
  { name: 'Carla Mendes',      phone: '19991234503', email: 'carla.mendes@demo.com.br',      tags: ['interessado'],            notes: 'Primeira compra, quer financiamento CEF.' },
  { name: 'Diego Ferreira',    phone: '11991234504', email: 'diego.ferreira@demo.com.br',    tags: ['qualificado'],            notes: 'Já tem 2 imóveis alugados, busca terceiro.' },
  { name: 'Eduarda Lima',      phone: '13991234505', email: 'eduarda.lima@demo.com.br',      tags: ['interessado'],            notes: 'Mudando de cidade, busca casa com quintal.' },
  { name: 'Fábio Rocha',       phone: '11991234506', email: 'fabio.rocha@demo.com.br',       tags: ['qualificado'],            notes: 'Aprovado no banco, FGTS disponível.' },
  { name: 'Giovana Teixeira',  phone: '16991234507', email: 'giovana.teixeira@demo.com.br',  tags: ['interessado'],            notes: 'Quer imóvel perto de escola boa.' },
  { name: 'Henrique Oliveira', phone: '11991234508', email: 'henrique.oliveira@demo.com.br', tags: ['frio'],                   notes: 'Ainda pensando, sem urgência declarada.' },
  { name: 'Isabela Martins',   phone: '19991234509', email: 'isabela.martins@demo.com.br',   tags: ['qualificado'],            notes: 'Casal jovem, orçamento até R$450k.' },
  { name: 'João Pedro Souza',  phone: '11991234510', email: 'joao.pedro.souza@demo.com.br',  tags: ['interessado'],            notes: 'Procura terreno para construção própria.' },
  { name: 'Karen Barbosa',     phone: '15991234511', email: 'karen.barbosa@demo.com.br',     tags: ['interessado'],            notes: 'Interessada em lançamento na planta.' },
  { name: 'Lucas Nunes',       phone: '11991234512', email: 'lucas.nunes@demo.com.br',       tags: ['qualificado'],            notes: 'Quer apartamento no centro, solteiro.' },
  { name: 'Mariana Costa',     phone: '11991234513', email: 'mariana.costa@demo.com.br',     tags: ['frio'],                   notes: 'Visitou stand, ainda decidindo.' },
  { name: 'Nelson Vieira',     phone: '21991234514', email: 'nelson.vieira@demo.com.br',     tags: ['interessado'],            notes: 'Mudando do RJ para SP, urgente.' },
  { name: 'Odete Almeida',     phone: '11991234515', email: 'odete.almeida@demo.com.br',     tags: ['qualificado'],            notes: 'Aposentada, quer imóvel pequeno e seguro.' },
];

// ── Imóveis fictícios (Imobiliária) ───────────────────────────────────────

const IMOBI_PROPERTIES = [
  { title: 'Apartamento moderno na Vila Mariana',        property_type: 'apartamento',   purpose: 'venda',   status: 'disponivel', city: 'São Paulo',            state: 'SP', neighborhood: 'Vila Mariana',    street: 'Rua Domingos de Morais',          number: '1200', zip_code: '04010-100', sale_price: 680000,  total_area: 72,  built_area: 68,  bedrooms: 2, bathrooms: 2, parking_spots: 1, is_featured: true  },
  { title: 'Casa com piscina no Morumbi',                property_type: 'casa',          purpose: 'venda',   status: 'disponivel', city: 'São Paulo',            state: 'SP', neighborhood: 'Morumbi',         street: 'Rua Prof. Frederico Hermann Jr',   number: '85',   zip_code: '05686-120', sale_price: 1850000, total_area: 320, built_area: 280, bedrooms: 4, bathrooms: 4, suites: 2, parking_spots: 3, is_featured: true  },
  { title: 'Studio em Pinheiros — ideal para investimento', property_type: 'apartamento', purpose: 'venda',  status: 'disponivel', city: 'São Paulo',            state: 'SP', neighborhood: 'Pinheiros',       street: 'Rua Teodoro Sampaio',             number: '476',  zip_code: '05406-000', sale_price: 320000,  total_area: 32,  built_area: 30,  bedrooms: 1, bathrooms: 1, parking_spots: 0, is_featured: false },
  { title: 'Casa térrea em condomínio — Campinas',       property_type: 'casa',          purpose: 'venda',   status: 'reservado',  city: 'Campinas',             state: 'SP', neighborhood: 'Parque Prado',    street: 'Rua das Palmeiras',               number: '12',   zip_code: '13060-080', sale_price: 890000,  total_area: 210, built_area: 185, bedrooms: 3, bathrooms: 3, parking_spots: 2, is_featured: false },
  { title: 'Apartamento 3 quartos — Jardim Paulista',    property_type: 'apartamento',   purpose: 'venda',   status: 'disponivel', city: 'São Paulo',            state: 'SP', neighborhood: 'Jardim Paulista', street: 'Al. Joaquim Eugênio de Lima',     number: '900',  zip_code: '01403-002', sale_price: 1200000, total_area: 120, built_area: 108, bedrooms: 3, bathrooms: 2, suites: 1, parking_spots: 2, is_featured: true  },
  { title: 'Sala comercial no Centro — Santos',          property_type: 'sala_comercial', purpose: 'locacao', status: 'disponivel', city: 'Santos',              state: 'SP', neighborhood: 'Centro',          street: 'Rua XV de Novembro',              number: '300',  zip_code: '11010-150', rent_price: 3800,    total_area: 45,                   is_featured: false },
  { title: 'Terreno 500m² — Ribeirão Preto',             property_type: 'terreno',       purpose: 'venda',   status: 'disponivel', city: 'Ribeirão Preto',       state: 'SP', neighborhood: 'Alto da Boa Vista', street: 'Rua Sete de Setembro',           number: '777',  zip_code: '14020-550', sale_price: 280000,  total_area: 500,                  is_featured: false },
  { title: 'Cobertura duplex com vista para o mar',      property_type: 'cobertura',     purpose: 'venda',   status: 'disponivel', city: 'Guarujá',              state: 'SP', neighborhood: 'Pitangueiras',    street: 'Av. Marechal Deodoro',            number: '500',  zip_code: '11410-000', sale_price: 2200000, total_area: 250, built_area: 220, bedrooms: 4, bathrooms: 4, suites: 2, parking_spots: 3, is_featured: true  },
  { title: 'Casa 2 quartos — São Bernardo do Campo',     property_type: 'casa',          purpose: 'venda',   status: 'vendido',    city: 'São Bernardo do Campo', state: 'SP', neighborhood: 'Nova Petrópolis', street: 'Rua Inácio Dias',                number: '233',  zip_code: '09750-490', sale_price: 450000,  total_area: 120, built_area: 98,  bedrooms: 2, bathrooms: 2, parking_spots: 1, is_featured: false },
  { title: 'Apartamento 1 quarto para alugar — Moema',  property_type: 'apartamento',   purpose: 'locacao', status: 'disponivel', city: 'São Paulo',            state: 'SP', neighborhood: 'Moema',           street: 'Av. Moaci',                       number: '122',  zip_code: '04083-003', rent_price: 2800,    total_area: 48,  built_area: 45,  bedrooms: 1, bathrooms: 1, parking_spots: 1, is_featured: false },
  { title: 'Galpão industrial 800m² — Santo André',     property_type: 'galpao',        purpose: 'locacao', status: 'disponivel', city: 'Santo André',          state: 'SP', neighborhood: 'Capuava',         street: 'Estrada dos Alvarengas',          number: '1500', zip_code: '09370-010', rent_price: 18000,   total_area: 800, built_area: 750,  is_featured: false },
  { title: 'Sobrado 4 quartos — Campinas Taquaral',     property_type: 'casa',          purpose: 'venda',   status: 'vendido',    city: 'Campinas',             state: 'SP', neighborhood: 'Taquaral',        street: 'Rua Cecília Meireles',            number: '89',   zip_code: '13087-450', sale_price: 760000,  total_area: 180, built_area: 160, bedrooms: 4, bathrooms: 3, suites: 1, parking_spots: 2, is_featured: false },
];

// ── Empreendimentos + unidades (Incorporadora) ────────────────────────────

const INCORPORADORA_DEVS = [
  {
    dev: {
      name: 'Residencial Parque das Flores', builder_name: 'Demo Incorporações',
      development_type: 'loteamento', construction_status: 'em_obras',
      city: 'Campinas', state: 'SP', neighborhood: 'Nova Campinas',
      street: 'Estrada Municipal Juca Sanches', number: 'km 3', zip_code: '13087-000',
      total_units: 60, is_featured: true, delivery_date: '2026-12-01',
    },
    units: [
      { title: 'Lote 01', status: 'vendido',    sale_price: 185000, total_area: 250 },
      { title: 'Lote 02', status: 'vendido',    sale_price: 185000, total_area: 252 },
      { title: 'Lote 03', status: 'reservado',  sale_price: 192000, total_area: 280 },
      { title: 'Lote 04', status: 'reservado',  sale_price: 192000, total_area: 280 },
      { title: 'Lote 05', status: 'disponivel', sale_price: 198000, total_area: 300 },
      { title: 'Lote 06', status: 'disponivel', sale_price: 198000, total_area: 300 },
      { title: 'Lote 07', status: 'disponivel', sale_price: 205000, total_area: 320 },
      { title: 'Lote 08', status: 'disponivel', sale_price: 205000, total_area: 320 },
      { title: 'Lote 09', status: 'disponivel', sale_price: 210000, total_area: 350 },
      { title: 'Lote 10', status: 'disponivel', sale_price: 210000, total_area: 350 },
    ],
    unitType: 'terreno',
  },
  {
    dev: {
      name: 'Edifício Horizonte Premium', builder_name: 'Demo Incorporações',
      development_type: 'predio', construction_status: 'na_planta',
      city: 'São Paulo', state: 'SP', neighborhood: 'Bela Vista',
      street: 'Rua Treze de Maio', number: '440', zip_code: '01327-000',
      total_units: 24, is_featured: true, delivery_date: '2027-06-01',
    },
    units: [
      { title: 'Apto 101', status: 'disponivel', sale_price: 580000, total_area: 65, built_area: 60, bedrooms: 2, bathrooms: 1, parking_spots: 1, floor_number: 1 },
      { title: 'Apto 102', status: 'disponivel', sale_price: 580000, total_area: 65, built_area: 60, bedrooms: 2, bathrooms: 1, parking_spots: 1, floor_number: 1 },
      { title: 'Apto 201', status: 'reservado',  sale_price: 620000, total_area: 72, built_area: 68, bedrooms: 2, bathrooms: 2, parking_spots: 1, floor_number: 2 },
      { title: 'Apto 202', status: 'disponivel', sale_price: 620000, total_area: 72, built_area: 68, bedrooms: 2, bathrooms: 2, parking_spots: 1, floor_number: 2 },
      { title: 'Apto 301', status: 'disponivel', sale_price: 660000, total_area: 78, built_area: 74, bedrooms: 3, bathrooms: 2, parking_spots: 1, floor_number: 3 },
      { title: 'Apto 302', status: 'reservado',  sale_price: 660000, total_area: 78, built_area: 74, bedrooms: 3, bathrooms: 2, parking_spots: 1, floor_number: 3 },
      { title: 'Apto 401', status: 'vendido',    sale_price: 700000, total_area: 85, built_area: 80, bedrooms: 3, bathrooms: 2, suites: 1, parking_spots: 2, floor_number: 4 },
      { title: 'Cobertura 501', status: 'disponivel', sale_price: 980000, total_area: 140, built_area: 130, bedrooms: 3, bathrooms: 3, suites: 1, parking_spots: 2, floor_number: 5 },
    ],
    unitType: 'apartamento',
  },
  {
    dev: {
      name: 'Condomínio Vila Verde', builder_name: 'Demo Incorporações',
      development_type: 'condominio_fechado', construction_status: 'pronto',
      city: 'Ribeirão Preto', state: 'SP', neighborhood: 'Jardim Botânico',
      street: 'Av. José Zuza de Mello Filho', number: '2200', zip_code: '14024-620',
      total_units: 30, is_featured: false, delivery_date: null,
    },
    units: [
      { title: 'Casa 01', status: 'vendido',    sale_price: 680000, total_area: 180, built_area: 155, bedrooms: 3, bathrooms: 3, parking_spots: 2 },
      { title: 'Casa 02', status: 'vendido',    sale_price: 680000, total_area: 180, built_area: 155, bedrooms: 3, bathrooms: 3, parking_spots: 2 },
      { title: 'Casa 03', status: 'reservado',  sale_price: 720000, total_area: 200, built_area: 175, bedrooms: 4, bathrooms: 3, suites: 1, parking_spots: 2 },
      { title: 'Casa 04', status: 'disponivel', sale_price: 720000, total_area: 200, built_area: 175, bedrooms: 4, bathrooms: 3, suites: 1, parking_spots: 2 },
      { title: 'Casa 05', status: 'disponivel', sale_price: 750000, total_area: 220, built_area: 190, bedrooms: 4, bathrooms: 4, suites: 2, parking_spots: 3 },
      { title: 'Casa 06', status: 'disponivel', sale_price: 750000, total_area: 220, built_area: 190, bedrooms: 4, bathrooms: 4, suites: 2, parking_spots: 3 },
    ],
    unitType: 'casa',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function getStagesAndPipeline(workspaceId) {
  const [stagesRes, pipelineRes] = await Promise.all([
    query('SELECT id, name FROM kanban_stages WHERE workspace_id = $1 ORDER BY position', [workspaceId]),
    query('SELECT id FROM pipelines WHERE workspace_id = $1 ORDER BY position LIMIT 1', [workspaceId]),
  ]);
  return {
    stages: stagesRes.rows,
    pipelineId: pipelineRes.rows[0]?.id || null,
  };
}

async function insertContacts(workspaceId) {
  const ids = [];
  for (const c of CONTACTS) {
    const r = await query(
      `INSERT INTO contacts (workspace_id, name, phone, email, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [workspaceId, c.name, c.phone, c.email, c.tags, c.notes]
    );
    if (r.rows.length) {
      ids.push(r.rows[0].id);
    } else {
      const ex = await query('SELECT id FROM contacts WHERE workspace_id=$1 AND phone=$2', [workspaceId, c.phone]);
      ids.push(ex.rows[0]?.id);
    }
  }
  return ids;
}

async function insertDeal(workspaceId, pipelineId, stageId, contactId, title, value, priority, extras = {}) {
  await query(
    `INSERT INTO deals
       (workspace_id, pipeline_id, contact_id, stage_id, title, value, currency, priority, lead_source,
        property_id, development_id, lost_reason, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,'BRL',$7,'demo',$8,$9,$10,$11)`,
    [
      workspaceId, pipelineId, contactId, stageId, title, value, priority,
      extras.propertyId || null,
      extras.developmentId || null,
      extras.lostReason || null,
      extras.closedAt || null,
    ]
  );
}

// ── Seeder Imobiliária ────────────────────────────────────────────────────

async function seedImobiliaria(workspaceId) {
  const { stages, pipelineId } = await getStagesAndPipeline(workspaceId);
  if (!stages.length) return;

  const stageId = (i) => stages[Math.min(i, stages.length - 1)].id;
  const isLostStage = (i) => i >= stages.length - 1 && stages[stages.length - 1]?.name?.toLowerCase().includes('perdido');

  const contactIds = await insertContacts(workspaceId);

  // Propriedades
  const propIds = [];
  for (let i = 0; i < IMOBI_PROPERTIES.length; i++) {
    const p = IMOBI_PROPERTIES[i];
    const code = `DEMO-IMO-${String(i + 1).padStart(3, '0')}`;
    const r = await query(
      `INSERT INTO properties
         (workspace_id, code, title, property_type, purpose, status,
          zip_code, street, number, neighborhood, city, state,
          sale_price, rent_price, total_area, built_area,
          bedrooms, bathrooms, suites, parking_spots, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        workspaceId, code, p.title, p.property_type, p.purpose, p.status,
        p.zip_code, p.street, p.number, p.neighborhood, p.city, p.state,
        p.sale_price || null, p.rent_price || null, p.total_area || null, p.built_area || null,
        p.bedrooms || null, p.bathrooms || null, p.suites || null, p.parking_spots || null,
        p.is_featured || false,
      ]
    );
    propIds.push(r.rows[0].id);
  }

  // Deals
  const dealDefs = [
    { ci: 0,  si: 0, title: 'Ana — Apartamento 2/4 Zona Sul',     value: 650000,  priority: 'medium', pi: 0 },
    { ci: 1,  si: 2, title: 'Bruno — Imóvel para renda',           value: 800000,  priority: 'high',   pi: 1 },
    { ci: 2,  si: 1, title: 'Carla — Apto com financiamento CEF',  value: 380000,  priority: 'medium', pi: 2 },
    { ci: 3,  si: 3, title: 'Diego — Imóvel para investimento',    value: 1200000, priority: 'high',   pi: 3 },
    { ci: 4,  si: 0, title: 'Eduarda — Casa com quintal',          value: 520000,  priority: 'low',    pi: 4 },
    { ci: 5,  si: 2, title: 'Fábio — Fechar com FGTS',             value: 430000,  priority: 'high',   pi: 5 },
    { ci: 6,  si: 1, title: 'Giovana — Perto de escola',           value: 490000,  priority: 'medium', pi: 6 },
    { ci: 8,  si: 1, title: 'Isabela — Primeiro imóvel do casal',  value: 440000,  priority: 'medium', pi: 7 },
    { ci: 11, si: 2, title: 'Lucas — Apartamento no centro',       value: 550000,  priority: 'high',   pi: 8 },
    { ci: 13, si: 4, title: 'Nelson — Prospect inativo',           value: 700000,  priority: 'low',    pi: 9, lostReason: 'Não retornou contato' },
  ];

  for (const d of dealDefs) {
    const si = Math.min(d.si, stages.length - 1);
    const closedAt = isLostStage(si) ? new Date().toISOString() : null;
    await insertDeal(workspaceId, pipelineId, stageId(si), contactIds[d.ci], d.title, d.value, d.priority, {
      propertyId: propIds[d.pi % propIds.length],
      lostReason: d.lostReason || null,
      closedAt,
    });
  }
}

// ── Seeder Incorporadora ──────────────────────────────────────────────────

async function seedIncorporadora(workspaceId) {
  const { stages, pipelineId } = await getStagesAndPipeline(workspaceId);
  if (!stages.length) return;

  const stageId = (i) => stages[Math.min(i, stages.length - 1)].id;
  const isLostStage = (i) => i >= stages.length - 1 && stages[stages.length - 1]?.name?.toLowerCase().includes('perdido');

  const contactIds = await insertContacts(workspaceId);

  // Empreendimentos + unidades
  const devIds = [];
  let propSeq = 1;

  for (let di = 0; di < INCORPORADORA_DEVS.length; di++) {
    const { dev, units, unitType } = INCORPORADORA_DEVS[di];
    const devCode = `DEMO-EMP-${String(di + 1).padStart(3, '0')}`;

    const devRes = await query(
      `INSERT INTO developments
         (workspace_id, code, name, builder_name, development_type, construction_status,
          zip_code, street, number, neighborhood, city, state,
          total_units, is_featured, delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        workspaceId, devCode, dev.name, dev.builder_name, dev.development_type, dev.construction_status,
        dev.zip_code, dev.street, dev.number, dev.neighborhood, dev.city, dev.state,
        dev.total_units, dev.is_featured, dev.delivery_date,
      ]
    );
    const developmentId = devRes.rows[0].id;
    devIds.push(developmentId);

    for (const u of units) {
      const uCode = `DEMO-UNI-${String(propSeq++).padStart(3, '0')}`;
      const fullTitle = `${u.title} — ${dev.name}`;
      await query(
        `INSERT INTO properties
           (workspace_id, code, title, property_type, purpose, status,
            zip_code, street, number, neighborhood, city, state,
            sale_price, total_area, built_area,
            bedrooms, bathrooms, suites, parking_spots, floor_number,
            development_id, is_featured)
         VALUES ($1,$2,$3,$4,'venda',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          workspaceId, uCode, fullTitle, unitType, u.status,
          dev.zip_code, dev.street, dev.number, dev.neighborhood, dev.city, dev.state,
          u.sale_price || null, u.total_area || null, u.built_area || null,
          u.bedrooms || null, u.bathrooms || null, u.suites || null,
          u.parking_spots || null, u.floor_number || null,
          developmentId, false,
        ]
      );
    }
  }

  // Deals
  const dealDefs = [
    { ci: 0,  si: 0, title: 'Ana — Lote no Parque das Flores',           value: 198000,  priority: 'medium', di: 0 },
    { ci: 1,  si: 2, title: 'Bruno — Ap. no Horizonte Premium',          value: 620000,  priority: 'high',   di: 1 },
    { ci: 2,  si: 1, title: 'Carla — Lote na planta + financiamento',    value: 192000,  priority: 'medium', di: 0 },
    { ci: 4,  si: 0, title: 'Eduarda — Casa no Vila Verde',               value: 720000,  priority: 'low',    di: 2 },
    { ci: 5,  si: 3, title: 'Fábio — Ap. Horizonte já financiado',       value: 660000,  priority: 'high',   di: 1 },
    { ci: 7,  si: 1, title: 'Henrique — Lote para construção futura',    value: 205000,  priority: 'low',    di: 0 },
    { ci: 9,  si: 2, title: 'João — Terreno no loteamento',              value: 210000,  priority: 'medium', di: 0 },
    { ci: 10, si: 0, title: 'Karen — Ap. 3/4 na planta',                 value: 660000,  priority: 'medium', di: 1 },
    { ci: 11, si: 1, title: 'Lucas — Studio para investimento',           value: 580000,  priority: 'high',   di: 1 },
    { ci: 12, si: 4, title: 'Mariana — Prospect perdido',                 value: 750000,  priority: 'low',    di: 2, lostReason: 'Lead escolheu outro empreendimento' },
  ];

  for (const d of dealDefs) {
    const si = Math.min(d.si, stages.length - 1);
    const closedAt = isLostStage(si) ? new Date().toISOString() : null;
    await insertDeal(workspaceId, pipelineId, stageId(si), contactIds[d.ci], d.title, d.value, d.priority, {
      developmentId: devIds[d.di] || null,
      lostReason: d.lostReason || null,
      closedAt,
    });
  }
}

// ── Exportado ─────────────────────────────────────────────────────────────

async function seedDemo(workspaceId, businessModel) {
  try {
    if (businessModel === 'construtora') {
      await seedIncorporadora(workspaceId);
    } else {
      await seedImobiliaria(workspaceId);
    }
    console.log(`[workspace-seeder] Dados demo criados para workspace ${workspaceId} (${businessModel})`);
  } catch (err) {
    console.error(`[workspace-seeder] Erro ao criar dados demo: ${err.message}`);
  }
}

module.exports = { seedDemo };
