import type { PropertyType, PropertyPurpose, PropertyStatus, DevelopmentConstructionStatus, PropertyDocumentCategory, ConstructionStageStatus, CommissionStatus, PropertyExchangeStatus, ProposalStatus } from '@/types';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
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

export const PURPOSE_LABELS: Record<PropertyPurpose, string> = {
  venda:         'Venda',
  locacao:       'Locação',
  venda_locacao: 'Venda e Locação',
  temporada:     'Temporada',
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  disponivel: 'Disponível',
  reservado:  'Reservado',
  vendido:    'Vendido',
  alugado:    'Alugado',
  inativo:    'Inativo',
};

export const STATUS_COLORS: Record<PropertyStatus, string> = {
  disponivel: 'bg-green-100 text-green-700',
  reservado:  'bg-yellow-100 text-yellow-700',
  vendido:    'bg-blue-100 text-blue-700',
  alugado:    'bg-indigo-100 text-indigo-700',
  inativo:    'bg-gray-100 text-gray-500',
};

export const DOCUMENT_CATEGORY_LABELS: Record<PropertyDocumentCategory, string> = {
  matricula:          'Matrícula',
  escritura:          'Escritura',
  iptu:               'IPTU',
  habite_se:          'Habite-se',
  contrato:           'Contrato',
  certidao_negativa:  'Certidão negativa',
  laudo_avaliacao:    'Laudo de avaliação',
  planta:             'Planta',
  outro:              'Outro',
};

export const CONSTRUCTION_STATUS_LABELS: Record<DevelopmentConstructionStatus, string> = {
  lancamento: 'Lançamento',
  em_obras:   'Em obras',
  pronto:     'Pronto para morar',
};

export const CONSTRUCTION_STATUS_COLORS: Record<DevelopmentConstructionStatus, string> = {
  lancamento: 'bg-purple-100 text-purple-700',
  em_obras:   'bg-yellow-100 text-yellow-700',
  pronto:     'bg-green-100 text-green-700',
};

export const CONSTRUCTION_STAGE_STATUS_LABELS: Record<ConstructionStageStatus, string> = {
  pendente:     'Pendente',
  em_andamento: 'Em andamento',
  concluida:    'Concluída',
};

export const CONSTRUCTION_STAGE_STATUS_COLORS: Record<ConstructionStageStatus, string> = {
  pendente:     'bg-gray-100 text-gray-500',
  em_andamento: 'bg-yellow-100 text-yellow-700',
  concluida:    'bg-green-100 text-green-700',
};

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pendente: 'Pendente',
  pago:     'Pago',
};

export const COMMISSION_STATUS_COLORS: Record<CommissionStatus, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  pago:     'bg-green-100 text-green-700',
};

export const EXCHANGE_STATUS_LABELS: Record<PropertyExchangeStatus, string> = {
  pendente:  'Pendente',
  aceita:    'Aceita',
  recebida:  'Recebida',
  revendida: 'Revendida',
};

export const EXCHANGE_STATUS_COLORS: Record<PropertyExchangeStatus, string> = {
  pendente:  'bg-gray-100 text-gray-500',
  aceita:    'bg-blue-100 text-blue-700',
  recebida:  'bg-yellow-100 text-yellow-700',
  revendida: 'bg-green-100 text-green-700',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  rascunho:  'Rascunho',
  enviada:   'Enviada',
  assinada:  'Assinada',
  cancelada: 'Cancelada',
};

export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  rascunho:  'bg-gray-100 text-gray-500',
  enviada:   'bg-blue-100 text-blue-700',
  assinada:  'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
};

export const AMENITIES_LIST = [
  // Lazer e área comum
  'Piscina', 'Piscina aquecida', 'Academia', 'Churrasqueira', 'Área gourmet',
  'Varanda gourmet', 'Salão de festas', 'Playground', 'Quadra esportiva',
  'Sauna', 'Espaço pet', 'Coworking', 'Brinquedoteca', 'Espaço cinema/jogos',

  // Segurança e portaria
  'Portaria 24h', 'Portão eletrônico', 'Câmeras de segurança', 'Interfone', 'Gerador',

  // Estrutura do imóvel
  'Elevador', 'Sacada/Varanda', 'Closet', 'Lareira', 'Hidromassagem/Banheira',
  'Armários planejados', 'Área de serviço', 'Depósito/Despensa', 'Lavanderia',
  'Quintal', 'Jardim',

  // Mobília
  'Mobiliado', 'Semi-mobiliado', 'Não mobiliado',

  // Conforto e sustentabilidade
  'Ar condicionado', 'Energia solar', 'Aquecimento solar', 'Aceita pet',

  // Vista e localização
  'Vista para o mar', 'Vista para montanha', 'Vista panorâmica',
  'Próximo a transporte público', 'Bicicletário',
];

export const BRAZIL_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatArea(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n} m²`;
}

export function propertyPriceLabel(p: { purpose: PropertyPurpose; sale_price: number | null; rent_price: number | null }): string {
  if (p.purpose === 'venda') return formatCurrency(p.sale_price);
  if (p.purpose === 'locacao' || p.purpose === 'temporada') return `${formatCurrency(p.rent_price)}/mês`;
  // venda_locacao
  const parts: string[] = [];
  if (p.sale_price != null) parts.push(formatCurrency(p.sale_price));
  if (p.rent_price != null) parts.push(`${formatCurrency(p.rent_price)}/mês`);
  return parts.length ? parts.join(' · ') : '—';
}
