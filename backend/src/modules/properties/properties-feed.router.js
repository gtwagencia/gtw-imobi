'use strict';

/**
 * Feed XML público de imóveis — consumido pelo plugin gtw-imoview (WordPress)
 * para sincronizar o catálogo do site com os imóveis cadastrados no gtw-imobi.
 *
 * GET /api/v1/feeds/:workspaceId/properties.xml?token=...
 *
 * Autenticação via token simples (workspaces.site_integration_token), pois o
 * consumidor é um job server-to-server (WP-Cron), não um navegador.
 */

const { Router } = require('express');
const crypto      = require('crypto');
const { query }  = require('../../config/database');
const svc         = require('./properties.service');

function tokensMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const router = Router();

const TYPE_LABELS = {
  apartamento:           'Apartamento',
  casa:                  'Casa',
  casa_condominio:       'Casa em condomínio',
  cobertura:             'Cobertura',
  kitnet_studio:         'Kitnet/Studio',
  sobrado:               'Sobrado',
  terreno_lote:          'Terreno/Lote',
  sala_comercial:        'Sala comercial',
  loja:                  'Loja',
  galpao:                'Galpão',
  predio_comercial:      'Prédio comercial',
  fazenda_sitio_chacara: 'Fazenda/Sítio/Chácara',
  outro:                 'Outro',
};

const PURPOSE_LABELS = {
  venda:         'Venda',
  locacao:       'Locação',
  venda_locacao: 'Venda e Locação',
  temporada:     'Temporada',
};

// ── Helpers de escape XML ────────────────────────────────────────────────

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cdata(value) {
  if (value == null || value === '') return '';
  return `<![CDATA[${String(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function num(value) {
  return value == null ? '' : String(value);
}

function buildPropertyXml(p) {
  const endereco = p.hide_address
    ? `    <cidade>${esc(p.city)}</cidade>
    <estado>${esc(p.state)}</estado>
    <bairro>${esc(p.neighborhood)}</bairro>
    <enderecoOculto>1</enderecoOculto>`
    : `    <cep>${esc(p.zip_code)}</cep>
    <logradouro>${esc(p.street)}</logradouro>
    <numero>${esc(p.number)}</numero>
    <complemento>${esc(p.complement)}</complemento>
    <bairro>${esc(p.neighborhood)}</bairro>
    <cidade>${esc(p.city)}</cidade>
    <estado>${esc(p.state)}</estado>
    <latitude>${num(p.latitude)}</latitude>
    <longitude>${num(p.longitude)}</longitude>
    <enderecoOculto>0</enderecoOculto>`;

  const fotos = (p.media || [])
    .map(m => `      <foto principal="${m.is_cover ? '1' : '0'}">${esc(m.url)}</foto>`)
    .join('\n');

  const amenities = (p.amenities || [])
    .map(a => `      <comodidade>${esc(a)}</comodidade>`)
    .join('\n');

  return `  <imovel>
    <codigo>${esc(p.code)}</codigo>
    <titulo>${cdata(p.title)}</titulo>
    <descricao>${cdata(p.description)}</descricao>
    <tipo>${esc(p.property_type)}</tipo>
    <tipoLabel>${esc(TYPE_LABELS[p.property_type] || p.property_type)}</tipoLabel>
    <finalidade>${esc(p.purpose)}</finalidade>
    <finalidadeLabel>${esc(PURPOSE_LABELS[p.purpose] || p.purpose)}</finalidadeLabel>
    <status>${esc(p.status)}</status>
    <precoVenda>${num(p.sale_price)}</precoVenda>
    <precoLocacao>${num(p.rent_price)}</precoLocacao>
    <condominio>${num(p.condo_fee)}</condominio>
    <iptu>${num(p.iptu)}</iptu>
    <endereco>
${endereco}
    </endereco>
    <caracteristicas>
      <areaTotal>${num(p.total_area)}</areaTotal>
      <areaConstruida>${num(p.built_area)}</areaConstruida>
      <quartos>${num(p.bedrooms)}</quartos>
      <suites>${num(p.suites)}</suites>
      <banheiros>${num(p.bathrooms)}</banheiros>
      <vagas>${num(p.parking_spots)}</vagas>
      <andar>${num(p.floor_number)}</andar>
      <anoConstrucao>${num(p.year_built)}</anoConstrucao>
    </caracteristicas>
    <comodidades>
${amenities}
    </comodidades>
    <destaque>${p.is_featured ? '1' : '0'}</destaque>
    <fotos>
${fotos}
    </fotos>
    <atualizadoEm>${new Date(p.updated_at).toISOString()}</atualizadoEm>
  </imovel>`;
}

// ── Feed para portais (Zap/OLX/VivaReal) ────────────────────────────────
//
// Formato compatível com o padrão de importação "XML de Imóveis" aceito
// pelos portais do Grupo OLX (OLX, ZAP Imóveis e Viva Real). Os campos
// seguem a nomenclatura usada nos assistentes de importação desses portais
// — caso o portal exija um mapeamento manual, os nomes das tags já indicam
// a que correspondem.

const PORTAL_TYPE_LABELS = {
  apartamento:           'Apartamento',
  casa:                  'Casa',
  casa_condominio:       'Casa de Condomínio',
  cobertura:             'Cobertura',
  kitnet_studio:         'Kitnet/Studio',
  sobrado:               'Sobrado',
  terreno_lote:          'Terreno',
  sala_comercial:        'Sala Comercial',
  loja:                  'Loja/Salão',
  galpao:                'Galpão/Depósito/Armazém',
  predio_comercial:      'Prédio Comercial',
  fazenda_sitio_chacara: 'Fazenda/Sítio/Chácara',
  outro:                 'Outros',
};

const PORTAL_TRANSACTION_LABELS = {
  venda:         'Venda',
  locacao:       'Locacao',
  venda_locacao: 'Venda/Locacao',
  temporada:     'Temporada',
};

function buildPortalPropertyXml(p) {
  const fotos = (p.media || [])
    .filter(m => m.media_type === 'image')
    .map(m => `      <Foto principal="${m.is_cover ? '1' : '0'}">${cdata(m.url)}</Foto>`)
    .join('\n');

  return `  <Imovel>
    <CodigoImovel>${esc(p.code)}</CodigoImovel>
    <TipoImovel>${esc(PORTAL_TYPE_LABELS[p.property_type] || 'Outros')}</TipoImovel>
    <Transacao>${esc(PORTAL_TRANSACTION_LABELS[p.purpose] || 'Venda')}</Transacao>
    <Endereco>
      <Pais>Brasil</Pais>
      <UF>${esc(p.state)}</UF>
      <Cidade>${esc(p.city)}</Cidade>
      <Bairro>${esc(p.neighborhood)}</Bairro>
      <Endereco>${esc(p.hide_address ? '' : p.street)}</Endereco>
      <Numero>${esc(p.hide_address ? '' : p.number)}</Numero>
      <Complemento>${esc(p.hide_address ? '' : p.complement)}</Complemento>
      <CEP>${esc(p.hide_address ? '' : p.zip_code)}</CEP>
      <MostrarEndereco>${p.hide_address ? 'Nao' : 'Sim'}</MostrarEndereco>
      <Latitude>${num(p.latitude)}</Latitude>
      <Longitude>${num(p.longitude)}</Longitude>
    </Endereco>
    <AreaUtil>${num(p.built_area || p.total_area)}</AreaUtil>
    <AreaTotal>${num(p.total_area)}</AreaTotal>
    <QtdQuartos>${num(p.bedrooms)}</QtdQuartos>
    <QtdSuites>${num(p.suites)}</QtdSuites>
    <QtdBanheiros>${num(p.bathrooms)}</QtdBanheiros>
    <QtdVagas>${num(p.parking_spots)}</QtdVagas>
    <AnoConstrucao>${num(p.year_built)}</AnoConstrucao>
    <Precos>
      <PrecoVenda>${num(p.sale_price)}</PrecoVenda>
      <PrecoLocacao>${num(p.rent_price)}</PrecoLocacao>
      <PrecoCondominio>${num(p.condo_fee)}</PrecoCondominio>
      <PrecoIPTU>${num(p.iptu)}</PrecoIPTU>
    </Precos>
    <Titulo>${cdata(p.title)}</Titulo>
    <Descricao>${cdata(p.description)}</Descricao>
    <Fotos>
${fotos}
    </Fotos>
    <DataHora>${new Date(p.updated_at).toISOString()}</DataHora>
  </Imovel>`;
}

router.get('/:workspaceId/portais.xml', async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const { token } = req.query;

    const wsRes = await query(
      'SELECT site_integration_token FROM workspaces WHERE id = $1',
      [workspaceId]
    );
    const expected = wsRes.rows[0]?.site_integration_token;
    if (!tokensMatch(token, expected)) {
      return res.status(403).type('application/xml').send('<erro>Token inválido</erro>');
    }

    const properties = await svc.listForFeed(workspaceId);
    const items = properties.map(buildPortalPropertyXml).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Carga Data="${new Date().toISOString()}">
  <Imoveis>
${items}
  </Imoveis>
</Carga>`;

    res.type('application/xml').send(xml);
  } catch (err) { next(err); }
});

// ── Rota ──────────────────────────────────────────────────────────────────

router.get('/:workspaceId/properties.xml', async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const { token } = req.query;

    const wsRes = await query(
      'SELECT site_integration_token FROM workspaces WHERE id = $1',
      [workspaceId]
    );
    const expected = wsRes.rows[0]?.site_integration_token;
    if (!tokensMatch(token, expected)) {
      return res.status(403).type('application/xml').send('<erro>Token inválido</erro>');
    }

    const properties = await svc.listForFeed(workspaceId);
    const items = properties.map(buildPropertyXml).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<imoveis geradoEm="${new Date().toISOString()}" total="${properties.length}">
${items}
</imoveis>`;

    res.type('application/xml').send(xml);
  } catch (err) { next(err); }
});

module.exports = router;
