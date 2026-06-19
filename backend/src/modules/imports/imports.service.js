'use strict';

const axios     = require('axios');
const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

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

function getAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m  = xml.match(re);
  return m ? m[1] : null;
}

// ── Detectar formato do XML ──────────────────────────────────────────────────

function detectXmlFormat(xml, source = 'auto') {
  if (source === 'praedium')  return 'vrsync';  // Praedium usa VRSync (VivaReal Sync)
  if (source === 'kenlo')     return 'rnxml';
  if (source === 'vistasoft') return 'rnxml';
  if (source === 'rnxml')     return 'rnxml';

  // Auto-detect
  if (/<ListingDataFeed/i.test(xml))                      return 'vrsync'; // Praedium / VRSync
  if (/<Carga\b/i.test(xml))                              return 'rnxml';
  if (/<Imoveis\b/i.test(xml) && /<Imovel\b/i.test(xml)) return 'rnxml';
  if (/<imoveis>/i.test(xml)  && /<imovel>/i.test(xml))  return 'gtwimobi';
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

// ── Parser VRSync (Praedium / VivaReal Sync) ────────────────────────────────
// Formato: <ListingDataFeed><Listings><Listing>
// Praedium "central de conexões" usa este padrão (output vrsync.xml)

function mapVRSyncType(v) {
  if (!v) return 'outro';
  const l = v.toLowerCase();
  if (l.includes('apartment'))              return 'apartamento';
  if (l.includes('penthouse'))              return 'cobertura';
  if (l.includes('condominium'))            return 'casa_condominio';
  if (l.includes('home') || l.includes('house') || l.includes('single family')) return 'casa';
  if (l.includes('land') || l.includes('lot') || l.includes('terrain'))         return 'terreno_lote';
  if (l.includes('office'))                 return 'sala_comercial';
  if (l.includes('shop') || l.includes('store') || l.includes('retail'))        return 'loja';
  if (l.includes('warehouse') || l.includes('storage') || l.includes('depot'))  return 'galpao';
  if (l.includes('farm') || l.includes('rural') || l.includes('ranch'))         return 'fazenda_sitio_chacara';
  if (l.includes('commercial'))             return 'sala_comercial';
  if (l.includes('studio') || l.includes('kitnet'))                              return 'kitnet_studio';
  return 'outro';
}

function parseVRSyncBlock(block) {
  const details  = getTag(block, 'Details')  || '';
  const location = getTag(block, 'Location') || '';
  const media    = getTag(block, 'Media')    || '';

  // TransactionType: "For Sale" / "For Rent" / "For Sale and Rent" / "Vacation Rental"
  const tx = (getTag(block, 'TransactionType') || '').toLowerCase();
  let purpose = 'venda';
  if (/sale.*rent|rent.*sale/i.test(tx)) purpose = 'venda_locacao';
  else if (/vacation/i.test(tx))         purpose = 'temporada';
  else if (/rent/i.test(tx))             purpose = 'locacao';

  // Location: displayAddress attr → hideAddress
  const displayAddr = getAttr(block, 'Location', 'displayAddress') || 'All';
  const hideAddress = displayAddr === 'None' || displayAddr === 'Street';

  // State: prefer abbreviation attribute (e.g. <State abbreviation="SP">São Paulo</State>)
  const stateAbbr = getAttr(location, 'State', 'abbreviation');
  const state     = stateAbbr || getTag(location, 'State');

  // Photos: <Item medium="image" primary="true">URL</Item>
  const photoRe  = /<Item[^>]*medium="image"[^>]*>([^<\s][^<]*)<\/Item>/gi;
  const coverStr = (() => {
    const cm = media.match(/<Item[^>]*medium="image"[^>]*primary="true"[^>]*>([^<\s][^<]*)<\/Item>/i);
    return cm ? cm[1].trim() : null;
  })();
  const photos = [];
  let pm;
  while ((pm = photoRe.exec(media)) !== null) {
    const url = pm[1].trim();
    if (url) photos.push({ url, isCover: url === coverStr });
  }
  // Ensure first photo is cover if none marked
  if (photos.length > 0 && !photos.some(p => p.isCover)) photos[0].isCover = true;

  return {
    code:         getTag(block, 'ListingID'),
    title:        getTag(block, 'Title'),
    description:  getTag(details, 'Description'),
    propertyType: mapVRSyncType(getTag(details, 'PropertyType')),
    purpose,
    status:       'disponivel',
    zipCode:      getTag(location, 'PostalCode'),
    street:       getTag(location, 'Address'),
    number:       getTag(location, 'StreetNumber'),
    complement:   getTag(location, 'Complement'),
    neighborhood: getTag(location, 'Neighborhood'),
    city:         getTag(location, 'City'),
    state,
    latitude:     parseNum(getTag(location, 'Latitude')),
    longitude:    parseNum(getTag(location, 'Longitude')),
    hideAddress,
    salePrice:    parseNum(getTag(details, 'ListPrice') || getTag(details, 'ListPromotionalPrice')),
    rentPrice:    parseNum(getTag(details, 'RentalPrice') || getTag(details, 'MonthlyAmount')),
    condoFee:     parseNum(getTag(details, 'PropertyAdministrationFee')),
    iptu:         parseNum(getTag(details, 'Iptu')),
    totalArea:    parseNum(getTag(details, 'LotArea')),
    builtArea:    parseNum(getTag(details, 'LivingArea')),
    bedrooms:     parseNum(getTag(details, 'Bedrooms')),
    suites:       parseNum(getTag(details, 'Suites')),
    bathrooms:    parseNum(getTag(details, 'Bathrooms')),
    parkingSpots: parseNum(getTag(details, 'Garage')),
    yearBuilt:    null,
    isFeatured:   false,
    amenities:    [],
    photos,       // [{ url, isCover }]
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
      let propId = null;
      if (row.code) {
        await query(
          `UPDATE properties SET code = $1 WHERE workspace_id = $2 AND code != $1 AND title = $3
           AND created_at >= NOW() - INTERVAL '10 seconds'`,
          [row.code, workspaceId, row.title || `Imóvel ${row.code}`]
        );
        const pr = await query(
          'SELECT id FROM properties WHERE workspace_id = $1 AND code = $2',
          [workspaceId, row.code]
        );
        propId = pr.rows[0]?.id;
      }

      // Salva fotos na property_media (só na criação, URLs do Praedium CDN)
      if (propId && row.photos && row.photos.length > 0) {
        await savePhotos(propId, row.photos);
      }

      created++;
    } catch (e) {
      logger.warn(`[import] Erro ao processar imóvel "${row.code || row.title}": ${e.message}`);
      errors++;
    }
  }

  return { created, updated, errors, total: rows.length };
}

async function savePhotos(propertyId, photos) {
  // Não sobrescreve fotos manuais — só insere se não houver nenhuma
  const existing = await query(
    'SELECT COUNT(*)::int AS cnt FROM property_media WHERE property_id = $1',
    [propertyId]
  );
  if (existing.rows[0].cnt > 0) return;

  for (let i = 0; i < photos.length; i++) {
    const p      = photos[i];
    const url    = typeof p === 'string' ? p : p.url;
    const isCover = typeof p === 'object' ? (p.isCover || i === 0) : i === 0;
    if (!url) continue;
    try {
      await query(
        `INSERT INTO property_media (property_id, url, media_type, position, is_cover)
         VALUES ($1, $2, 'image', $3, $4)`,
        [propertyId, url, i, isCover]
      );
    } catch { /* ignora duplicata */ }
  }
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

    logger.info(`[import] Recebido ${text.length} bytes de ${url} — Content-Type: ${resp.headers['content-type'] || '?'}`);
    logger.info(`[import] Preview XML: ${text.slice(0, 500)}`);

    let rows = [];
    const contentType = resp.headers['content-type'] || '';

    if (contentType.includes('csv') || url.endsWith('.csv') || source === 'csv_url') {
      rows = parseCSV(text);
      logger.info(`[import] CSV: ${rows.length} linhas detectadas`);
    } else {
      const fmt = detectXmlFormat(text, source);
      logger.info(`[import] Formato detectado: ${fmt} (source=${source})`);

      if (fmt === 'vrsync') {
        // Praedium VRSync: <ListingDataFeed><Listings><Listing>
        const blocks = getAllBlocks(text, 'Listing');
        logger.info(`[import] VRSync: ${blocks.length} blocos <Listing> encontrados`);
        rows = blocks.map(parseVRSyncBlock);
      } else if (fmt === 'rnxml') {
        const blocksUp  = getAllBlocks(text, 'Imovel');
        const blocksLow = getAllBlocks(text, 'imovel');
        const blocks    = blocksUp.length >= blocksLow.length ? blocksUp : blocksLow;
        logger.info(`[import] RNXML: ${blocks.length} blocos encontrados`);
        rows = blocks.map(parseRnxmlBlock);
      } else {
        // gtwimobi ou unknown — tenta ambos os formatos
        const blocksLow = getAllBlocks(text, 'imovel');
        const blocksUp  = getAllBlocks(text, 'Imovel');
        if (blocksUp.length > blocksLow.length) {
          logger.info(`[import] Unknown → fallback RNXML: ${blocksUp.length} blocos`);
          rows = blocksUp.map(parseRnxmlBlock);
        } else {
          logger.info(`[import] GTW/Unknown: ${blocksLow.length} blocos`);
          rows = blocksLow.map(parseGtwBlock);
        }
      }
    }

    logger.info(`[import] ${rows.length} imóveis para processar`);
    if (rows.length === 0) {
      logger.warn(`[import] Nenhum imóvel encontrado. Verifique o formato do XML.`);
    }

    const result = await upsertRows(workspaceId, rows);
    logger.info(`[import] Resultado: ${result.created} criados, ${result.updated} atualizados, ${result.errors} erros`);

    await query(
      `UPDATE property_import_jobs
       SET status = 'done', total = $1, created_count = $2, updated_count = $3, error_count = $4, finished_at = NOW()
       WHERE id = $5`,
      [result.total, result.created, result.updated, result.errors, jobId]
    );

    return {
      jobId,
      created_count: result.created,
      updated_count: result.updated,
      error_count:   result.errors,
      total:         result.total,
    };
  } catch (err) {
    logger.error(`[import] Erro: ${err.message}`);
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

    return {
      jobId,
      created_count: result.created,
      updated_count: result.updated,
      error_count:   result.errors,
      total:         result.total,
    };
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
