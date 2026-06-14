export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_super_admin: boolean;
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
  sla_response_minutes: number | null;
  created_at: string;
  member_count?: number;
  inbox_count?: number;
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
  owner_name?: string | null;
  broker_name?: string | null;
  scout_name?: string | null;
  is_featured: boolean;
  views_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  media: PropertyMedia[];
  cover_url?: string | null;
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

export interface TicketResolutionReport {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  total_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number | null;
  total_hours_logged: number;
}
