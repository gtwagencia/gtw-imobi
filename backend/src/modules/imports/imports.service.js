'use strict';

const axios     = require('axios');
const { query } = require('../../config/database');

// ── Helpers XML ──────────────────────────────────────────────────────────────

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = xml.match(re);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() || null;
}

function getAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseBool(v) {
  return v === '1' || v === 'true' || v === 'Sim';
}

// ── Detectar formato do XML ──────────────────────────────────────────────────

function detectXmlFormat(xml) {
  if (/<Carga\b/i.test(xml) || /<Imoveis>/i.test(xml)) return 'rnxml';   // portais / nossa feed portal
  if (/<imoveis>/i.test(xml))                            return 'gtwimobi'; // nossa feed gtw-imoview
  return 'unknown';
}

// ── Parser RNXML (ZAP/VivaReal/portais) ─────────────────────────────────────

function parseRnxmlBlock(block) {
  const addr = getTag(block, 'Endereco') || block;
  return {
    code:          getTag(block, 'CodigoImovel'),
    title:         getTag(block, 'Titulo'),
    description:   getTag(block, 'Descricao'),
    propertyType:  mapPortalType(getTag(block, 'TipoImovel')),
    purpose:       mapPortalTransaction(getTag(block, 'Transacao')),
    status:        'disponivel',
    zipCode:       getTag(addr, 'CEP'),
    street:        getTag(addr, 'Endereco'),
    number:        getTag(addr, 'Numero'),
    complement:    getTag(addr, 'Complemento'),
    neighborhood:  getTag(addr, 'Bairro'),
    city:          getTag(addr, 'Cidade'),
    state:         getTag(addr, 'UF'),
    latitude:      parseNum(getTag(addr, 'Latitude')),
    longitude:     parseNum(getTag(addr, 'Longitude')),
    hideAddress:   getTag(addr, 'MostrarEndereco') === 'Nao',
    salePrice:     parseNum(getTag(block, 'PrecoVenda')),
    rentPrice:     parseNum(getTag(block, 'PrecoLocacao')),
    condoFee:      parseNum(getTag(block, 'PrecoCondominio')),
    iptu:          parseNum(getTag(block, 'PrecoIPTU')),
    totalArea:     parseNum(getTag(block, 'AreaTotal')),
    builtArea:     parseNum(getTag(block, 'AreaUtil')),
    bedrooms:      parseNum(getTag(block, 'QtdQuartos')),
    suites:        parseNum(getTag(block, 'QtdSuites')),
    bathrooms:     parseNum(getTag(block, 'QtdBanheiros')),
    parkingSpots:  parseNum(getTag(block, 'QtdVagas')),
    yearBuilt:     parseNum(getTag(block, 'AnoConstrucao')),
    isFeatured:    false,
    amenities:     [],
    photos:        getAllBlocks(block, 'Foto').map(f => f.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()).filter(Boolean),
  };
}

// ── Parser GTW-Imobi XML (nossa própria feed gtw-imoview) ───────────────────

function parseGtwBlock(block) {
  const addr = getTag(block, 'endereco') || block;
  return {
    code:          getTag(block, 'codigo'),
    title:         getTag(block, 'titulo'),
    description:   getTag(block, 'descricao'),
    propertyType:  getTag(block, 'tipo'),
    purpose:       getTag(block, 'finalidade'),
    status:        getTag(block, 'status') || 'disponivel',
    zipCode:       getTag(addr, 'cep'),
    street:        getTag(addr, 'logradouro'),
    number:        getTag(addr, 'numero'),
    complement:    getTag(addr, 'complemento'),
    neighborhood:  getTag(addr, 'bairro'),
    city:          getTag(addr, 'cidade'),
    state:         getTag(addr, 'estado'),
    latitude:      parseNum(getTag(addr, 'latitude')),
    longitude:     parseNum(getTag(addr, 'longitude')),
    hideAddress:   parseBool(getTag(addr, 'enderecoOculto')),
    salePrice:     parseNum(getTag(block, 'precoVenda')),
    rentPrice:     parseNum(getTag(block, 'precoLocacao')),
    condoFee:      parseNum(getTag(block, 'condominio')),
    iptu:          parseNum(getTag(block, 'iptu')),
    totalArea:     parseNum(getTag(block, 'areaTotal')),
    builtArea:     parseNum(getTag(block, 'areaConstruida')),
    bedrooms:      parseNum(getTag(block, 'quartos')),
    suites:        parseNum(getTag(block, 'suites')),
    bathrooms:     parseNum(getTag(block, 'banheiros')),
    parkingSpots:  parseNum(getTag(block, 'vagas')),
    floorNumber:   parseNum(getTag(block, 'andar')),
    yearBuilt:     parseNum(getTag(block, 'anoConstrucao')),
    isFeatured:    parseBool(getTag(block, 'destaque')),
    amenities:     getAllBlocks(getTag(block, 'comodidades') || '', 'comodidade').map(c => c.trim()).filter(Boolean),
    photos:        getAllBlocks(getTag(block, 'fotos') || '', 'foto').map(f => f.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()).filter(Boolean),
  };
}

// ── Mapeamentos de tipo/transação ────────────────────────────────────────────

function mapPortalType(v) {
  if (!v) return 'outro';
  const m = {
    'Apartamento': 'apartamento', 'Casa': 'casa', 'Casa de Condomínio': 'casa_condominio',
    'Cobertura': 'cobertura', 'Kitnet/Studio': 'kitnet_studio', 'Sobrado': 'sobrado',
    'Terreno': 'terreno_lote', 'Sala Comercial': 'sala_comercial', 'Loja/Salão': 'loja',
    'Galpão/Depósito/Armazém': 'galpao', 'Prédio Comercial': 'predio_comercial',
    'Fazenda/Sítio/Chácara': 'fazenda_sitio_chacara',
  };
  return m[v] || 'outro';
}

function mapPortalTransaction(v) {
  if (!v) return 'venda';
  if (/venda.*locac/i.test(v)) return 'venda_locacao';
  if (/locac/i.test(v))        return 'locacao';
  if (/temporada/i.test(v))    return 'temporada';
  return 'venda';
}

// ── Parser CSV ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const sep     = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

  function cell(row, key) {
    const idx = headers.indexOf(key);
    if (idx < 0) return null;
    return row[idx]?.replace(/^["']|["']$/g, '').trim() || null;
  }

  return lines.slice(1).map(line => {
    const row = line.split(sep);
    return {
      code:         cell(row, 'codigo') || cell(row, 'code'),
      title:        cell(row, 'titulo') || cell(row, 'title'),
      description:  cell(row, 'descricao') || cell(row, 'description'),
      propertyType: cell(row, 'tipo') || cell(row, 'type') || 'outro',
      purpose:      cell(row, 'finalidade') || cell(row, 'purpose') || 'venda',
      status:       cell(row, 'status') || 'disponivel',
      zipCode:      cell(row, 'cep') || cell(row, 'zipcode'),
      street:       cell(row, 'logradouro') || cell(row, 'street'),
      number:       cell(row, 'numero') || cell(row, 'number'),
      complement:   cell(row, 'complemento') || cell(row, 'complement'),
      neighborhood: cell(row, 'bairro') || cell(row, 'neighborhood'),
      city:         cell(row, 'cidade') || cell(row, 'city'),
      state:        cell(row, 'estado') || cell(row, 'state'),
      salePrice:    parseNum(cell(row, 'preco_venda') || cell(row, 'sale_price') || cell(row, 'preco')),
      rentPrice:    parseNum(cell(row, 'preco_locacao') || cell(row, 'rent_price')),
      condoFee:     parseNum(cell(row, 'condominio') || cell(row, 'condo_fee')),
      iptu:         parseNum(cell(row, 'iptu')),
      totalArea:    parseNum(cell(row, 'area_total') || cell(row, 'total_area')),
      builtArea:    parseNum(cell(row, 'area_construida') || cell(row, 'built_area')),
      bedrooms:     parseNum(cell(row, 'quartos') || cell(row, 'bedrooms')),
      suites:       parseNum(cell(row, 'suites')),
      bathrooms:    parseNum(cell(row, 'banheiros') || cell(row, 'bathrooms')),
      parkingSpots: parseNum(cell(row, 'vagas') || cell(row, 'parking_spots')),
      yearBuilt:    parseNum(cell(row, 'ano_construcao') || cell(row, 'year_built')),
      isFeatured:   cell(row, 'destaque') === '1' || cell(row, 'is_featured') === '1',
      amenities:    [],
      photos:       [],
    };
  }).filter(r => r.title || r.code);
}

// ── CSV template ─────────────────────────────────────────────────────────────

const CSV_TEMPLATE_HEADER = [
  'codigo', 'titulo', 'descricao', 'tipo', 'finalidade', 'status',
  'preco_venda', 'preco_locacao', 'condominio', 'iptu',
  'area_total', 'area_construida', 'quartos', 'suites', 'banheiros', 'vagas', 'ano_construcao',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'destaque',
].join(';');

const CSV_TEMPLATE_EXAMPLE = [
  'AP001', 'Apartamento 3 quartos no Centro', 'Lindo apartamento reformado...', 'apartamento', 'venda', 'disponivel',
  '450000', '', '800', '200',
  '120', '100', '3', '1', '2', '2', '2015',
  '01310-100', 'Av. Paulista', '1234', 'Apto 56', 'Bela Vista', 'São Paulo', 'SP',
  '0',
].join(';');

function getCSVTemplate() {
  return `${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}\n`;
}

// ── Upsert de imóveis ─────────────────────────────────────────────────────────

async function upsertRows(workspaceId, rows) {
  let created = 0, updated = 0, errors = 0;

  for (const row of rows) {
    try {
      if (!row.title && !row.code) { errors++; continue; }

      // Verifica se já existe pelo código
      if (row.code) {
        const existing = await query(
          'SELECT id FROM properties WHERE workspace_id = $1 AND code = $2',
          [workspaceId, row.code]
        );

        if (existing.rows.length) {
          // UPDATE
          const id = existing.rows[0].id;
          const fields = [];
          const vals   = [];
          let   idx    = 1;

          const map = {
            title: 'title', description: 'description', status: 'status',
            zipCode: 'zip_code', street: 'street', number: 'number',
            complement: 'complement', neighborhood: 'neighborhood',
            city: 'city', state: 'state',
            latitude: 'latitude', longitude: 'longitude',
            salePrice: 'sale_price', rentPrice: 'rent_price',
            condoFee: 'condo_fee', iptu: 'iptu',
            totalArea: 'total_area', builtArea: 'built_area',
            bedrooms: 'bedrooms', suites: 'suites',
            bathrooms: 'bathrooms', parkingSpots: 'parking_spots',
            floorNumber: 'floor_number', yearBuilt: 'year_built',
            isFeatured: 'is_featured',
          };

          for (const [key, col] of Object.entries(map)) {
            if (row[key] !== undefined && row[key] !== null) {
              fields.push(`${col} = $${idx++}`);
              vals.push(row[key]);
            }
          }

          if (fields.length) {
            vals.push(id);
            await query(
              `UPDATE properties SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
              vals
            );
          }
          updated++;
          continue;
        }
      }

      // INSERT — usa o service para gerar código automático se não tiver
      const propSvc = require('../properties/properties.service');
      await propSvc.create(workspaceId, {
        title:        row.title        || `Imóvel ${row.code || ''}`,
        description:  row.description  || null,
        propertyType: row.propertyType || 'outro',
        purpose:      row.purpose      || 'venda',
        status:       row.status       || 'disponivel',
        zipCode:      row.zipCode      || null,
        street:       row.street       || null,
        number:       row.number       || null,
        complement:   row.complement   || null,
        neighborhood: row.neighborhood || null,
        city:         row.city         || null,
        state:        row.state        || null,
        latitude:     row.latitude     || null,
        longitude:    row.longitude    || null,
        hideAddress:  row.hideAddress  || false,
        salePrice:    row.salePrice    || null,
        rentPrice:    row.rentPrice    || null,
        condoFee:     row.condoFee     || null,
        iptu:         row.iptu         || null,
        totalArea:    row.totalArea    || null,
        builtArea:    row.builtArea    || null,
        bedrooms:     row.bedrooms     || null,
        suites:       row.suites       || null,
        bathrooms:    row.bathrooms    || null,
        parkingSpots: row.parkingSpots || null,
        floorNumber:  row.floorNumber  || null,
        yearBuilt:    row.yearBuilt    || null,
        isFeatured:   row.isFeatured   || false,
        amenities:    row.amenities    || [],
      });

      // Se veio com código customizado, atualiza o gerado para o importado
      if (row.code) {
        await query(
          `UPDATE properties SET code = $1 WHERE workspace_id = $2 AND code != $1 AND title = $3
           AND created_at >= NOW() - INTERVAL '10 seconds'`,
          [row.code, workspaceId, row.title || `Imóvel ${row.code}`]
        );
      }

      created++;
    } catch {
      errors++;
    }
  }

  return { created, updated, errors, total: rows.length };
}

// ── Import via URL ────────────────────────────────────────────────────────────

async function importFromUrl(workspaceId, url, source = 'auto') {
  const jobRes = await query(
    `INSERT INTO property_import_jobs (workspace_id, source, source_url, status)
     VALUES ($1, $2, $3, 'processing') RETURNING id`,
    [workspaceId, source, url]
  );
  const jobId = jobRes.rows[0].id;

  try {
    const resp = await axios.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'GTW-Imobi-Importer/1.0' },
      responseType: 'text',
    });
    const text = resp.data;

    let rows = [];
    const contentType = resp.headers['content-type'] || '';

    if (contentType.includes('csv') || url.endsWith('.csv') || source === 'csv_url') {
      rows = parseCSV(text);
    } else {
      const fmt = detectXmlFormat(text);
      if (fmt === 'rnxml') {
        rows = getAllBlocks(text, 'Imovel').map(parseRnxmlBlock);
      } else {
        rows = getAllBlocks(text, 'imovel').map(parseGtwBlock);
      }
    }

    const result = await upsertRows(workspaceId, rows);

    await query(
      `UPDATE property_import_jobs
       SET status = 'done', total = $1, created_count = $2, updated_count = $3, error_count = $4, finished_at = NOW()
       WHERE id = $5`,
      [result.total, result.created, result.updated, result.errors, jobId]
    );

    return { jobId, ...result };
  } catch (err) {
    await query(
      `UPDATE property_import_jobs SET status = 'error', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [err.message, jobId]
    );
    throw err;
  }
}

// ── Import via CSV text ────────────────────────────────────────────────────────

async function importFromCSV(workspaceId, csvText) {
  const jobRes = await query(
    `INSERT INTO property_import_jobs (workspace_id, source, status) VALUES ($1, 'csv', 'processing') RETURNING id`,
    [workspaceId]
  );
  const jobId = jobRes.rows[0].id;

  try {
    const rows   = parseCSV(csvText);
    const result = await upsertRows(workspaceId, rows);

    await query(
      `UPDATE property_import_jobs
       SET status = 'done', total = $1, created_count = $2, updated_count = $3, error_count = $4, finished_at = NOW()
       WHERE id = $5`,
      [result.total, result.created, result.updated, result.errors, jobId]
    );

    return { jobId, ...result };
  } catch (err) {
    await query(
      `UPDATE property_import_jobs SET status = 'error', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [err.message, jobId]
    );
    throw err;
  }
}

// ── Listar jobs ───────────────────────────────────────────────────────────────

async function listJobs(workspaceId, limit = 20) {
  const r = await query(
    `SELECT * FROM property_import_jobs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return r.rows;
}

module.exports = { importFromUrl, importFromCSV, listJobs, getCSVTemplate };
