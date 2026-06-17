export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_super_admin: boolean;
  two_factor_enabled?: boolean;
  orgs: OrgSummary[];
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  is_active: boolean;
  created_at: string;
  member_count?: number;
}

export interface BusinessHoursDay {
  open: string;
  close: string;
  enabled: boolean;
}

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  monday:    BusinessHoursDay;
  tuesday:   BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday:  BusinessHoursDay;
  friday:    BusinessHoursDay;
  saturday:  BusinessHoursDay;
  sunday:    BusinessHoursDay;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  is_active: boolean;
  meta_pixel_id: string | null;
  meta_ad_account_id: string | null;
  has_meta_conversions_token: boolean;
  has_meta_access_token: boolean;
  business_hours: BusinessHours | null;
  follow_up_enabled: boolean;
  ai_analysis_enabled: boolean;
  ai_analysis_interval_minutes: number;
  ticket_storage_quota_mb: number;
  ai_ignore_groups: boolean;
  ai_provider: string | null;
  role?: string; // workspace_memberships.role do usuário atual (ausente para owners/admins)
  ai_model: string | null;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  ai_base_url: string | null;
  has_custom_ai_key: boolean;
  ai_tools_enabled: boolean;
  business_model: 'imobiliaria' | 'construtora';
  sla_response_minutes: number | null;
  lead_stale_hours: number;
  default_commission_pct: number | null;
  site_integration_token: string | null;
  ai_agent_name: string;
  custom_domain: string | null;
  custom_domain_status: 'none' | 'pending' | 'verified' | 'error';
  custom_domain_verification_token: string | null;
  enabled_modules: string[];
  created_at: string;
  member_count?: number;
  inbox_count?: number;
  // IA para geração de textos (independente do agente de atendimento)
  description_ai_provider: string | null;
  description_ai_model: string | null;
  // NPS pós-visita
  nps_enabled: boolean | null;
  nps_delay_hours: number | null;
  nps_inbox_id: string | null;
  nps_message_template: string | null;
  // ZapSign
  zapsign_api_token: string | null;
}

export type PermissionModuleKey =
  | 'conversations' | 'contacts' | 'properties' | 'kanban' | 'broadcasts'
  | 'inboxes' | 'departments' | 'canned' | 'labels' | 'reports';

export interface PermissionProfile {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  is_system: boolean;
  permissions: Record<PermissionModuleKey, boolean>;
}

export interface Inbox {
  id: string;
  workspace_id: string;
  name: string;
  channel_type: 'whatsapp_evolution' | 'whatsapp_official' | 'instagram' | 'facebook';
  phone_number: string | null;
  evolution_api_url: string | null;
  evolution_instance: string | null;
  connection_status: 'connected' | 'disconnected' | 'connecting';
  qr_code: string | null;
  is_active: boolean;
  auto_assign: boolean;
  chatbot_enabled: boolean;
  chatbot_prompt: string | null;
  webhook_secret: string | null;
  conversation_count?: number;
}

export type ContactType = 'lead' | 'cliente' | 'proprietario' | 'inquilino';
export type DocumentType = 'cpf' | 'cnpj';

export interface Contact {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string | null;
  custom_fields: Record<string, unknown>;
  meta_lead_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
  conversation_count?: number;
  deal_count?: number;
  // Fase 2 — perfil imobiliário
  contact_type: ContactType[];
  document_type: DocumentType | null;
  document_number: string | null;
  assigned_broker_id: string | null;
  assigned_broker_name?: string | null;
  assigned_broker_avatar?: string | null;
  // Portal do cliente
  portal_token: string | null;
}

// ── Imóveis ───────────────────────────────────────────────────────────────────

export type PropertyType = 'apartamento' | 'casa' | 'casa_condominio' | 'cobertura'
  | 'kitnet_studio' | 'sobrado' | 'terreno_lote' | 'sala_comercial' | 'loja'
  | 'galpao' | 'predio_comercial' | 'fazenda_sitio_chacara' | 'outro';
export type PropertyPurpose = 'venda' | 'locacao' | 'venda_locacao' | 'temporada';
export type PropertyStatus = 'disponivel' | 'reservado' | 'vendido' | 'alugado' | 'inativo';

export interface PropertyMedia {
  id: string;
  property_id: string;
  url: string;
  media_type: 'image' | 'video' | 'floorplan' | 'document';
  position: number;
  is_cover: boolean;
  show_on_site: boolean;
}

export interface Property {
  id: string;
  workspace_id: string;
  code: string;
  title: string;
  description: string | null;
  property_type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  hide_address: boolean;
  sale_price: number | null;
  rent_price: number | null;
  condo_fee: number | null;
  iptu: number | null;
  total_area: number | null;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  suites: number | null;
  parking_spots: number | null;
  floor_number: number | null;
  year_built: number | null;
  amenities: string[];
  owner_id: string | null;
  broker_id: string | null;
  scout_id: string | null;
  development_id: string | null;
  owner_name?: string | null;
  broker_name?: string | null;
  scout_name?: string | null;
  is_featured: boolean;
  views_count: number;
  published_at: string | null;
  block_label: string | null;
  lot_label: string | null;
  map_shape: { x: number; y: number } | null;
  reserved_until: string | null;
  reserved_by: string | null;
  cma_price_min: number | null;
  cma_price_max: number | null;
  cma_suggested_price: number | null;
  cma_analysis: string | null;
  cma_generated_at: string | null;
  created_at: string;
  updated_at: string;
  media: PropertyMedia[];
  cover_url?: string | null;
}

// ── Cofre de documentos ──────────────────────────────────────────────────────

export type PropertyDocumentCategory =
  | 'matricula' | 'escritura' | 'iptu' | 'habite_se' | 'contrato'
  | 'certidao_negativa' | 'laudo_avaliacao' | 'planta' | 'outro';

export interface PropertyDocument {
  id: string;
  property_id: string;
  workspace_id: string;
  name: string;
  category: PropertyDocumentCategory;
  file_url: string;
  file_type: string | null;
  expires_at: string | null;
  expiry_notified_at: string | null;
  is_client_visible: boolean;
  created_by: string | null;
  created_at: string;
}

// ── Condições de venda/pagamento (incorporadora) ─────────────────────────────

export type CommissionStatus = 'pendente' | 'pago';

export interface PropertySale {
  id: string;
  workspace_id: string;
  property_id: string;
  buyer_id: string | null;
  buyer_name?: string | null;
  sale_price: number;
  down_payment: number | null;
  installments_count: number | null;
  installment_value: number | null;
  financing_value: number | null;
  sale_date: string;
  notes: string | null;
  commission_pct: number | null;
  commission_value: number | null;
  partner_broker_id: string | null;
  partner_broker_name?: string | null;
  partner_commission_pct: number | null;
  broker_commission_value: number | null;
  partner_commission_value: number | null;
  commission_status: CommissionStatus;
  created_at: string;
  updated_at: string;
}

// ── Permutas (imóveis recebidos como parte do pagamento) ─────────────────────

export type PropertyExchangeStatus = 'pendente' | 'aceita' | 'recebida' | 'revendida';

export interface PropertyExchange {
  id: string;
  workspace_id: string;
  sale_id: string;
  description: string;
  property_type: string | null;
  address: string | null;
  appraised_value: number;
  status: PropertyExchangeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Corretores parceiros ─────────────────────────────────────────────────────

export interface PartnerBroker {
  id: string;
  workspace_id: string;
  name: string;
  agency_name: string | null;
  creci: string | null;
  phone: string | null;
  email: string | null;
  pix_key: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Propostas/contratos (PDF + assinatura eletrônica) ────────────────────────

export type ProposalStatus = 'rascunho' | 'enviada' | 'assinada' | 'cancelada';

export interface ProposalContent {
  property: {
    code: string;
    title: string;
    property_type: PropertyType;
    purpose: PropertyPurpose;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    total_area: number | null;
    built_area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    suites: number | null;
    parking_spots: number | null;
    sale_price: number | null;
    rent_price: number | null;
    cover_url: string | null;
  };
  sale: {
    sale_price: number;
    down_payment: number | null;
    installments_count: number | null;
    installment_value: number | null;
    financing_value: number | null;
  } | null;
  workspace: { name: string; logo_url: string | null } | null;
}

export interface PropertyProposal {
  id: string;
  workspace_id: string;
  property_id: string;
  token: string;
  title: string | null;
  buyer_name: string;
  buyer_document: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  proposed_price: number;
  payment_conditions: string | null;
  validity_date: string | null;
  content: ProposalContent;
  status: ProposalStatus;
  signature_name: string | null;
  signature_document: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  zapsign_doc_token: string | null;
  zapsign_sign_url: string | null;
  signature_status: 'aguardando' | 'assinado' | null;
  created_at: string;
  updated_at: string;
}

// ── Portal do cliente (área logada do comprador) ─────────────────────────────

export interface ClientPortalDocument {
  id: string;
  name: string;
  category: PropertyDocumentCategory;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

export interface ClientPortalProperty {
  property: {
    id: string;
    code: string;
    title: string;
    property_type: PropertyType;
    purpose: PropertyPurpose;
    status: PropertyStatus;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    cover_url: string | null;
  };
  sale: {
    sale_price: number;
    down_payment: number | null;
    installments_count: number | null;
    installment_value: number | null;
    financing_value: number | null;
    sale_date: string;
  };
  exchanges: PropertyExchange[];
  documents: ClientPortalDocument[];
  construction_stages: ConstructionStage[];
}

export interface ClientPortalData {
  contact: { name: string; email: string | null; phone: string | null };
  workspace: { name: string; logo_url: string | null } | null;
  properties: ClientPortalProperty[];
}

// ── Comparador de imóveis ───────────────────────────────────────────────────

export interface PropertyComparison {
  id: string;
  workspace_id: string;
  token: string;
  title: string | null;
  property_ids: string[];
  created_at: string;
  workspace?: { name: string; logo_url: string | null } | null;
  properties: Property[];
}

// ── Empreendimentos ───────────────────────────────────────────────────────────

export type DevelopmentConstructionStatus = 'lancamento' | 'em_obras' | 'pronto';

export interface DevelopmentMedia {
  id: string;
  development_id: string;
  url: string;
  media_type: 'image' | 'video' | 'floorplan' | 'document';
  position: number;
  is_cover: boolean;
  show_on_site: boolean;
}

export interface DevelopmentUnit {
  id: string;
  code: string;
  title: string;
  property_type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  sale_price: number | null;
  rent_price: number | null;
  bedrooms: number | null;
  total_area: number | null;
  block_label: string | null;
  lot_label: string | null;
  map_shape: { x: number; y: number } | null;
  reserved_until: string | null;
  reserved_by: string | null;
  cover_url: string | null;
}

export interface Development {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  description: string | null;
  builder_name: string | null;
  construction_status: DevelopmentConstructionStatus;
  delivery_date: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  is_featured: boolean;
  published_at: string | null;
  map_image_url: string | null;
  map_config: { width?: number; height?: number };
  commission_pct: number | null;
  development_type: string | null;
  total_units: number | null;
  created_at: string;
  updated_at: string;
  media: DevelopmentMedia[];
  units: DevelopmentUnit[];
  cover_url?: string | null;
  units_count?: number;
}

// ── Cronograma de obra ──────────────────────────────────────────────────────

export type ConstructionStageStatus = 'pendente' | 'em_andamento' | 'concluida';

export interface ConstructionStagePhoto {
  id: string;
  stage_id: string;
  url: string;
  caption: string | null;
  position: number;
  created_at: string;
}

export interface ConstructionStage {
  id: string;
  workspace_id: string;
  development_id: string;
  name: string;
  description: string | null;
  status: ConstructionStageStatus;
  planned_date: string | null;
  completed_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  photos: ConstructionStagePhoto[];
}

// ── Importação de loteamento (PDF) ────────────────────────────────────────

export interface DevelopmentImportLot {
  blockLabel: string | null;
  lotLabel:   string;
  totalArea:  number | null;
  salePrice:  number | null;
  status:     'disponivel' | 'reservado' | 'vendido';
}

export interface DevelopmentImportJob {
  id:               string;
  development_id:   string;
  workspace_id:      string;
  status:           'processing' | 'review' | 'done' | 'error';
  source_filename:  string | null;
  extracted_lots:   DevelopmentImportLot[];
  error_message:    string | null;
  created_at:       string;
  updated_at:       string;
}

export interface PropertyVisit {
  id: string;
  workspace_id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  property_cover_url: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  conversation_id: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  scheduled_at: string;
  status: 'proposta' | 'confirmada' | 'realizada' | 'cancelada';
  notes: string | null;
  created_by_ai: boolean;
  google_synced: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  inbox_id: string;
  contact_id: string;
  deal_id: string | null;
  assignee_id: string | null;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  remote_jid: string;
  last_message_at: string | null;
  last_message_text: string | null;
  unread_count: number;
  sla_breached: boolean;
  bot_active: boolean;
  csat_rating: number | null;
  csat_comment: string | null;
  created_at: string;
  // Joined
  contact_name: string;
  contact_phone: string | null;
  contact_avatar: string | null;
  inbox_name: string;
  inbox_channel: string;
  assignee_name: string | null;
  assignee_avatar: string | null;
  department_name: string | null;
  department_color: string | null;
  labels: Label[];
  is_group: boolean;
  group_jid: string | null;
  meta_ref: string | null;
  meta_ctwa_clid: string | null;
  meta_source: 'paid' | 'organic' | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  meta_adset_name: string | null;
  meta_campaign_name: string | null;
  meta_source_url: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_mime_type?: string | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  is_private: boolean;
  evolution_msg_id: string | null;
  created_at: string;
  // Campos extras incluídos nos eventos socket (não vêm da REST API)
  contact_name?: string;
  is_group?: boolean;
}

export interface CannedResponse {
  id: string;
  workspace_id: string;
  shortcut: string;
  content: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface KanbanStage {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  ai_prompt: string | null;
  deal_count: number;
  total_value: number;
  deals: Deal[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  is_purchase: boolean;
  ai_prompt: string | null;
  deal_count: number;
  total_value: number;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  created_at: string;
  stages: PipelineStage[];
  inbox_ids: string[];
  department_ids: string[];
}

export interface Deal {
  id: string;
  workspace_id: string;
  contact_id: string;
  stage_id: string;
  pipeline_id: string | null;
  assignee_id: string | null;
  conversation_id: string | null;
  title: string;
  value: number;
  currency: string;
  priority: 'low' | 'medium' | 'high';
  lost_reason: string | null;
  closed_at: string | null;
  created_at: string;
  // AI fields
  ai_qualification: string | null;
  ai_summary: string | null;
  ai_analyzed_at: string | null;
  lead_score: number | null;
  // Joined
  contact_name: string;
  contact_phone: string | null;
  contact_avatar: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  stage_name: string;
  stage_color: string;
  stage_position: number;
  stage_is_default: boolean;
  // Imóvel vinculado
  property_id: string | null;
  property_code: string | null;
  property_title: string | null;
  property_cover_url: string | null;
  // From conversation join
  conv_status: string | null;
  conv_inbox_id: string | null;
  response_time_seconds: number | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  // Meta attribution
  meta_source: 'paid' | 'organic' | null;
  meta_ctwa_clid: string | null;
  meta_ad_name: string | null;
  meta_campaign_name: string | null;
}

export interface DepartmentOverview {
  id: string;
  name: string;
  color: string;
  agent_count: number;
  open_conversations: number;
  avg_response_seconds: number | null;
  active_deals: number;
  pipeline_value: number;
  deals_by_stage: { stage_name: string; stage_color: string; count: number }[];
  primary_pipeline_id: string | null;
}

export interface AgentReport {
  id: string;
  name: string;
  avatar_url: string | null;
  total_conversations: number;
  resolved: number;
  avg_response_time_seconds: number | null;
  avg_csat: number | null;
  messages_sent: number;
}

export interface VolumeByDay {
  date: string;
  total: number;
  resolved: number;
}

export interface BrokerDealReport {
  id: string;
  name: string;
  avatar_url: string | null;
  total_deals: number;
  won_deals: number;
  lost_deals: number;
  won_value: string | number;
  avg_days_to_close: string | number | null;
}

export interface LeadSourceReport {
  source_label: string;
  total_deals: number;
  won_deals: number;
  lost_deals: number;
  won_value: string | number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketBoardRole = 'viewer' | 'member' | 'manager';
export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';

export interface TicketLabel {
  id: string;
  name: string;
  color: string;
}

export interface Ticket {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  created_by: string | null;
  created_by_name: string | null;
  priority: TicketPriority;
  due_date: string | null;
  position: number;
  estimated_hours: number | null;
  conversation_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  is_recurring: boolean;
  recurrence_type: RecurrenceType | null;
  recurrence_interval: number | null;
  recurrence_end: string | null;
  parent_ticket_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  labels: TicketLabel[];
  total_time_seconds: number;
  // Extended (board/my-tasks view)
  board_name?: string;
  board_color?: string;
  column_name?: string;
  column_color?: string;
  column_is_done?: boolean;
}

export interface TicketColumn {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
  tickets: Ticket[];
}

export interface TicketBoard {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  is_archived: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  columns: TicketColumn[];
  column_count?: number;
  ticket_count?: number;
  user_role?: TicketBoardRole;
}

export interface TicketBoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: TicketBoardRole;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface TicketTimeLog {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
}

export interface TicketReminder {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  remind_at: string;
  message: string | null;
  sent: boolean;
}

export interface TicketAlert {
  id: string;
  user_id: string;
  ticket_id: string;
  board_id: string;
  type: 'assigned' | 'mention' | 'due_today';
  message: string | null;
  is_read: boolean;
  created_at: string;
  ticket_title?: string;
  board_name?: string;
}

export interface CrmNotification {
  id: string;
  workspace_id: string;
  user_id: string;
  conversation_id: string | null;
  type: 'sla_breached' | 'lead_stale';
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TicketResolutionReport {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  total_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number | null;
  total_hours_logged: number;
}
