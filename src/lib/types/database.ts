/**
 * Sales Automation OS — tipi TypeScript del database (Phase 1 Foundation).
 *
 * Tipi MANUALI, allineati colonna-per-colonna alle migrazioni
 * `supabase/migrations/0001..0010`. Da rigenerare/allineare a ogni nuova
 * migration. Per l'uso con supabase-js nei Domain Services.
 *
 * Convenzioni:
 * - `Json` = jsonb Postgres;
 * - le unioni stringa riflettono gli enum SQL (vedi DATABASE_MIGRATION_PLAN §3);
 * - i tipi `*Row` rappresentano la riga letta (SELECT); `*Insert` omettono i
 *   campi con default DB (id, created_at, ...) rendendoli opzionali.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Enum SQL (unioni stringa 1:1 con i CREATE TYPE delle migration)
// ---------------------------------------------------------------------------

/** §16.4 — ruoli workspace (0001) */
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

/** §4 — modalità operativa; default sicuro 'MANUAL' (0001) */
export type PolicyMode = 'MANUAL' | 'SCORE_BASED' | 'FULL_AUTO';

/** §4.1 — gate granulare per singola azione (0001) */
export type PolicyGateMode = 'AUTO' | 'SCORE_THRESHOLD' | 'MANUAL' | 'OFF';

/** §3.1 — business status, separato da ProcessingStatus (0001) */
export type BusinessStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'CAMPAIGN_READY'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'WON'
  | 'LOST'
  | 'NOT_INTERESTED'
  | 'SUPPRESSED';

/** §3.1 — processing status, separato da BusinessStatus (0001) */
export type ProcessingStatus =
  | 'IDLE'
  | 'ENRICHING'
  | 'ANALYZING'
  | 'SCORING'
  | 'DEMO_GENERATING'
  | 'SCREENSHOT_GENERATING'
  | 'MESSAGE_GENERATING'
  | 'SENDING'
  | 'FAILED';

/** 0004 */
export type DemoStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED' | 'EXPIRED';

/** 0004 */
export type AssetKind =
  | 'LOGO'
  | 'HERO'
  | 'GALLERY'
  | 'SCREENSHOT_DESKTOP'
  | 'SCREENSHOT_MOBILE'
  | 'OTHER';

/** 0005 */
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

/** 0005 */
export type CampaignLeadStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'REVIEW'
  | 'APPROVED'
  | 'SENDING'
  | 'SENT'
  | 'REPLIED'
  | 'STOPPED'
  | 'FAILED'
  | 'SKIPPED';

/** 0006 */
export type DraftStatus = 'DRAFT' | 'READY' | 'APPROVED' | 'SENT' | 'CANCELLED';

/** 0006 */
export type MessageDirection = 'OUTBOUND' | 'INBOUND';

/** 0006 */
export type MessageEventType =
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'UNSUBSCRIBED'
  | 'REPLIED';

/** 0006 */
export type SuppressionReason = 'HARD_BOUNCE' | 'UNSUBSCRIBE' | 'STOP_REQUEST' | 'MANUAL';

/** 0006 */
export type ThreadStatus = 'OPEN' | 'NEEDS_REPLY' | 'ARCHIVED';

/** 0007 */
export type JobStatus = 'QUEUED' | 'RUNNING' | 'RETRYING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/** 0007 */
export type JobType =
  | 'DISCOVERY_RUN'
  | 'LEAD_ENRICHMENT'
  | 'WEBSITE_ANALYSIS'
  | 'LEAD_SCORING'
  | 'DEMO_GENERATION'
  | 'SCREENSHOT_DESKTOP'
  | 'SCREENSHOT_MOBILE'
  | 'MESSAGE_GENERATION'
  | 'SEND_MESSAGE'
  | 'FOLLOWUP_STEP'
  | 'WEBHOOK_PROCESSING'
  | 'CALENDAR_REMINDER'
  | 'SALES_PROACTIVE_STEP'
  | 'COMMERCIAL_GOAL_TICK';

/** 0007 — check constraint su automation_job_events.event_type */
export type AutomationJobEventType =
  | 'ENQUEUED'
  | 'LEASED'
  | 'HEARTBEAT'
  | 'RETRY_SCHEDULED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RECOVERED';

/** 0008 */
export type ActorType = 'USER' | 'SYSTEM' | 'WORKER';

/** 0008 */
export type ActivityCategory = 'BUSINESS' | 'TECHNICAL' | 'DECISION';

/** 0009 */
export type ProviderType = 'GOOGLE_PLACES' | 'RESEND' | 'BROWSER_WORKER' | 'AI';

/** 0009 */
export type ProviderMode = 'MOCK' | 'LIVE';

/** 0009 */
export type ConnectionStatus = 'NOT_CONFIGURED' | 'CONNECTED' | 'DEGRADED' | 'DISABLED';

/** 0002 — check constraint su lead_contacts.type */
export type LeadContactType = 'EMAIL' | 'PHONE' | 'PERSON' | 'OTHER';

/** 0002 / 0012 / 0021 — check constraint su lead_sources.source_type */
export type LeadSourceType =
  | 'GOOGLE_PLACES_DISCOVERY'
  | 'GOOGLE_PLACES_ENRICHMENT'
  | 'WEBSITE_ANALYSIS'
  | 'MANUAL'
  | 'IMPORT'
  /** Riservato: Social Lead Scout futuro. Non implementato in Phase C. */
  | 'FACEBOOK'
  /** Inbound multi-canale (0021) */
  | 'TELEGRAM_INBOUND'
  | 'DISCORD_INBOUND'
  | 'MASTODON_INBOUND'
  | 'BLUESKY_INBOUND';

/** 0011 — qualification status Phase B */
export type QualificationStatus =
  | 'NEW'
  | 'PREQUALIFIED'
  | 'NEEDS_ANALYSIS'
  | 'LOW_PRIORITY'
  | 'REJECTED';

/** Status testuale ACTIVE/ARCHIVED (templates e followup_sequences) */
export type CatalogStatus = 'ACTIVE' | 'ARCHIVED';

// ---------------------------------------------------------------------------
// 0001 — workspace & auth
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  default_policy_mode: PolicyMode;
  default_policy: Json;
  settings: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInsert {
  id?: string;
  name: string;
  slug: string;
  default_policy_mode?: PolicyMode;
  default_policy?: Json;
  settings?: Json;
  created_by?: string | null;
}

export interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  created_at: string;
}

export interface WorkspaceMemberInsert {
  workspace_id: string;
  user_id: string;
  role?: WorkspaceRole;
  invited_by?: string | null;
}

// ---------------------------------------------------------------------------
// 0002 — leads, contacts, sources
// ---------------------------------------------------------------------------

export interface LeadRow {
  id: string;
  workspace_id: string;
  google_place_id: string | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  normalized_domain: string | null;
  phone: string | null;
  email: string | null;
  normalized_phone: string | null;
  normalized_email: string | null;
  business_status: BusinessStatus;
  processing_status: ProcessingStatus;
  current_score: number | null;
  current_confidence: number | null;
  rating: number | null;
  review_count: number | null;
  google_last_enriched_at: string | null;
  discovery_score: number | null;
  discovery_confidence: number | null;
  qualification_status: QualificationStatus;
  offer_candidate: string | null;
  primary_thread_id: string | null;
  qualification_reasons: Json;
  qualification_algorithm_version: string | null;
  qualified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadInsert {
  id?: string;
  workspace_id: string;
  google_place_id?: string | null;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  website_url?: string | null;
  normalized_domain?: string | null;
  phone?: string | null;
  email?: string | null;
  normalized_phone?: string | null;
  normalized_email?: string | null;
  business_status?: BusinessStatus;
  processing_status?: ProcessingStatus;
  current_score?: number | null;
  current_confidence?: number | null;
  rating?: number | null;
  review_count?: number | null;
  google_last_enriched_at?: string | null;
  discovery_score?: number | null;
  discovery_confidence?: number | null;
  qualification_status?: QualificationStatus;
  offer_candidate?: string | null;
  primary_thread_id?: string | null;
  qualification_reasons?: Json;
  qualification_algorithm_version?: string | null;
  qualified_at?: string | null;
}

export interface LeadContactRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  type: LeadContactType;
  value: string;
  normalized_value: string | null;
  label: string | null;
  is_primary: boolean;
  source: string | null;
  created_at: string;
}

export interface LeadContactInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  type: LeadContactType;
  value: string;
  normalized_value?: string | null;
  label?: string | null;
  is_primary?: boolean;
  source?: string | null;
}

export interface LeadSourceRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  source_type: LeadSourceType;
  external_id: string | null;
  query_snapshot: Json;
  created_at: string;
}

export interface LeadSourceInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  source_type: LeadSourceType;
  external_id?: string | null;
  query_snapshot?: Json;
}

// ---------------------------------------------------------------------------
// 0003 — audits, scores, tags, segments
// ---------------------------------------------------------------------------

export interface WebsiteAuditRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  audit_version: number;
  final_url: string | null;
  redirect_chain: Json;
  emails_found: Json;
  phones_found: Json;
  social_links: Json;
  ctas: Json;
  key_pages: Json;
  mobile_signals: Json;
  issues: Json;
  opportunities: Json;
  evidence_assets: Json;
  raw_result: Json | null;
  analyzed_by: string | null;
  created_at: string;
}

export interface WebsiteAuditInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  audit_version: number;
  final_url?: string | null;
  redirect_chain?: Json;
  emails_found?: Json;
  phones_found?: Json;
  social_links?: Json;
  ctas?: Json;
  key_pages?: Json;
  mobile_signals?: Json;
  issues?: Json;
  opportunities?: Json;
  evidence_assets?: Json;
  raw_result?: Json | null;
  analyzed_by?: string | null;
}

export interface LeadScoreRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  algorithm_version: string;
  opportunity_score: number | null;
  contactability_score: number | null;
  data_confidence_score: number | null;
  template_match_score: number | null;
  business_potential_score: number | null;
  total_score: number | null;
  confidence: number | null;
  breakdown: Json;
  reasons: Json;
  is_current: boolean;
  created_at: string;
}

export interface LeadScoreInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  algorithm_version: string;
  opportunity_score?: number | null;
  contactability_score?: number | null;
  data_confidence_score?: number | null;
  template_match_score?: number | null;
  business_potential_score?: number | null;
  total_score?: number | null;
  confidence?: number | null;
  breakdown?: Json;
  reasons?: Json;
  is_current?: boolean;
}

export interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TagInsert {
  id?: string;
  workspace_id: string;
  name: string;
  color?: string | null;
}

export interface LeadTagRow {
  workspace_id: string;
  lead_id: string;
  tag_id: string;
  created_at: string;
}

export interface LeadTagInsert {
  workspace_id: string;
  lead_id: string;
  tag_id: string;
}

export interface SegmentRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  filters: Json;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentInsert {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  filters: Json;
  is_archived?: boolean;
  created_by?: string | null;
}

// ---------------------------------------------------------------------------
// 0004 — templates & demos
// ---------------------------------------------------------------------------

export interface WebsiteTemplateRow {
  id: string;
  workspace_id: string;
  key: string;
  name: string | null;
  description: string | null;
  category: string | null;
  vertical: string | null;
  status: CatalogStatus;
  created_at: string;
  updated_at: string;
}

export interface WebsiteTemplateInsert {
  id?: string;
  workspace_id: string;
  key: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  vertical?: string | null;
  status?: CatalogStatus;
}

export interface WebsiteTemplateVersionRow {
  id: string;
  workspace_id: string;
  template_id: string;
  version: number;
  layout_key: string;
  component_version: string;
  schema: Json;
  default_content: Json;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface WebsiteTemplateVersionInsert {
  id?: string;
  workspace_id: string;
  template_id: string;
  version: number;
  layout_key: string;
  component_version: string;
  schema: Json;
  default_content?: Json;
  is_published?: boolean;
  published_at?: string | null;
}

export interface DemoSiteRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  template_id: string;
  template_version_id: string;
  slug: string;
  short_id: string;
  public_url: string | null;
  status: DemoStatus;
  current_version_id: string | null;
  noindex: boolean;
  published_at: string | null;
  disabled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoSiteInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  template_id: string;
  template_version_id: string;
  slug: string;
  short_id: string;
  public_url?: string | null;
  status?: DemoStatus;
  current_version_id?: string | null;
  noindex?: boolean;
  published_at?: string | null;
  disabled_at?: string | null;
  expires_at?: string | null;
}

export interface DemoVersionRow {
  id: string;
  workspace_id: string;
  demo_site_id: string;
  version: number;
  data: Json;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DemoVersionInsert {
  id?: string;
  workspace_id: string;
  demo_site_id: string;
  version: number;
  data: Json;
  is_published?: boolean;
  created_by?: string | null;
}

export interface DemoAssetRow {
  id: string;
  workspace_id: string;
  demo_site_id: string;
  lead_id: string | null;
  kind: AssetKind;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  provenance: Json;
  created_at: string;
}

export interface DemoAssetInsert {
  id?: string;
  workspace_id: string;
  demo_site_id: string;
  lead_id?: string | null;
  kind: AssetKind;
  storage_bucket: string;
  storage_path: string;
  public_url?: string | null;
  provenance?: Json;
}

// ---------------------------------------------------------------------------
// 0005 — campaigns, policies, follow-up
// ---------------------------------------------------------------------------

export interface FollowupSequenceRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CatalogStatus;
  created_at: string;
  updated_at: string;
}

export interface FollowupSequenceInsert {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  status?: CatalogStatus;
}

/** Step di followup_sequence_versions.steps (§12.2) */
export interface FollowupStep {
  step: number;
  delay_days: number;
  message_template_version_id: string;
  conditions?: Json;
}

export interface FollowupSequenceVersionRow {
  id: string;
  workspace_id: string;
  sequence_id: string;
  version: number;
  steps: Json; // FollowupStep[]
  created_at: string;
}

export interface FollowupSequenceVersionInsert {
  id?: string;
  workspace_id: string;
  sequence_id: string;
  version: number;
  steps?: Json;
}

export interface CampaignRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  segment_id: string | null;
  landing_template_id: string | null;
  landing_template_version_id: string | null;
  message_template_id: string | null;
  message_template_version_id: string | null;
  followup_sequence_id: string | null;
  followup_sequence_version_id: string | null;
  mode: PolicyMode;
  delivery_mode: 'PRODUCTION' | 'TEST';
  test_recipient: string | null;
  active_policy_version_id: string | null;
  status: CampaignStatus;
  rate_limit_per_hour: number | null;
  daily_send_limit: number | null;
  send_window: Json;
  activated_at: string | null;
  paused_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignInsert {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  segment_id?: string | null;
  landing_template_id?: string | null;
  landing_template_version_id?: string | null;
  message_template_id?: string | null;
  message_template_version_id?: string | null;
  followup_sequence_id?: string | null;
  followup_sequence_version_id?: string | null;
  mode?: PolicyMode;
  delivery_mode?: 'PRODUCTION' | 'TEST';
  test_recipient?: string | null;
  active_policy_version_id?: string | null;
  status?: CampaignStatus;
  rate_limit_per_hour?: number | null;
  daily_send_limit?: number | null;
  send_window?: Json;
  activated_at?: string | null;
  paused_at?: string | null;
  created_by?: string | null;
}

/** Gate granulari §4.1 in campaign_policy_versions.actions */
export interface PolicyActions {
  discovery: PolicyGateMode;
  enrichment: PolicyGateMode;
  website_analysis: PolicyGateMode;
  demo_generation: PolicyGateMode;
  screenshot: PolicyGateMode;
  message_generation: PolicyGateMode;
  send: PolicyGateMode;
  followup: PolicyGateMode;
}

export interface CampaignPolicyVersionRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  version: number;
  mode: PolicyMode;
  actions: Json; // PolicyActions
  thresholds: Json;
  rate_limit: Json;
  send_window: Json;
  daily_limit: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CampaignPolicyVersionInsert {
  id?: string;
  workspace_id: string;
  campaign_id: string;
  version: number;
  mode: PolicyMode;
  actions: Json;
  thresholds?: Json;
  rate_limit?: Json;
  send_window?: Json;
  daily_limit?: number | null;
  is_active?: boolean;
  created_by?: string | null;
}

export interface CampaignLeadRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignLeadStatus;
  policy_version_id: string;
  policy_snapshot: Json;
  /** 0013 — enrichment/demo/send metadata (jsonb). */
  preparation: Json;
  sequence_step: number;
  next_action_at: string | null;
  demo_site_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignLeadInsert {
  id?: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status?: CampaignLeadStatus;
  policy_version_id: string;
  policy_snapshot: Json;
  preparation?: Json;
  sequence_step?: number;
  next_action_at?: string | null;
  demo_site_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

// ---------------------------------------------------------------------------
// 0006 — messaging
// ---------------------------------------------------------------------------

export interface MessageTemplateRow {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  category: string | null;
  status: CatalogStatus;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplateInsert {
  id?: string;
  workspace_id: string;
  key: string;
  name: string;
  category?: string | null;
  status?: CatalogStatus;
}

export interface MessageTemplateVersionRow {
  id: string;
  workspace_id: string;
  template_id: string;
  version: number;
  subject: string;
  body: string;
  variables: Json; // string[]
  created_at: string;
}

export interface MessageTemplateVersionInsert {
  id?: string;
  workspace_id: string;
  template_id: string;
  version: number;
  subject: string;
  body: string;
  variables?: Json;
}

export interface MessageDraftRow {
  id: string;
  workspace_id: string;
  campaign_lead_id: string;
  lead_id: string;
  template_version_id: string;
  sequence_step: number;
  subject: string;
  body: string;
  resolved_variables: Json;
  status: DraftStatus;
  is_override: boolean;
  edited_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageDraftInsert {
  id?: string;
  workspace_id: string;
  campaign_lead_id: string;
  lead_id: string;
  template_version_id: string;
  sequence_step?: number;
  subject: string;
  body: string;
  resolved_variables?: Json;
  status?: DraftStatus;
  is_override?: boolean;
  edited_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface MessageThreadRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id: string | null;
  subject: string | null;
  status: ThreadStatus;
  unread_count: number;
  last_message_at: string | null;
  channel: 'EMAIL' | 'TELEGRAM';
  commercial_state: string;
  assigned_mode: 'AI' | 'HUMAN';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'HOT';
  sentiment: string | null;
  next_step: string | null;
  next_step_at: string | null;
  human_required_reason: string | null;
  playbook_version: number | null;
  closed_at: string | null;
  close_reason_code: string | null;
  close_notes: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageThreadInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  campaign_id?: string | null;
  subject?: string | null;
  status?: ThreadStatus;
  unread_count?: number;
  last_message_at?: string | null;
  channel?: 'EMAIL' | 'TELEGRAM';
  commercial_state?: string;
  assigned_mode?: 'AI' | 'HUMAN';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'HOT';
  sentiment?: string | null;
  next_step?: string | null;
  next_step_at?: string | null;
  human_required_reason?: string | null;
  playbook_version?: number | null;
  closed_at?: string | null;
  close_reason_code?: string | null;
  close_notes?: string | null;
  closed_by?: string | null;
}

/** messages è IMMUTABILE (trigger forbid_mutation): esiste solo Insert. */
export interface MessageRow {
  id: string;
  workspace_id: string;
  thread_id: string;
  lead_id: string;
  campaign_lead_id: string | null;
  draft_id: string | null;
  direction: MessageDirection;
  provider: string;
  provider_message_id: string | null;
  from_address: string;
  to_address: string;
  intended_recipient: string | null;
  actual_delivery_recipient: string | null;
  subject: string | null;
  body_snapshot: string;
  sequence_step: number;
  sent_at: string | null;
  created_at: string;
}

export interface MessageInsert {
  id?: string;
  workspace_id: string;
  thread_id: string;
  lead_id: string;
  campaign_lead_id?: string | null;
  draft_id?: string | null;
  direction: MessageDirection;
  provider?: string;
  provider_message_id?: string | null;
  from_address: string;
  to_address: string;
  intended_recipient?: string | null;
  actual_delivery_recipient?: string | null;
  subject?: string | null;
  body_snapshot: string;
  sequence_step?: number;
  sent_at?: string | null;
}

/** message_events è append-only: esiste solo Insert. */
export interface MessageEventRow {
  id: string;
  workspace_id: string;
  message_id: string;
  event_type: MessageEventType;
  provider_event_id: string | null;
  payload: Json;
  occurred_at: string;
  created_at: string;
}

export interface MessageEventInsert {
  id?: string;
  workspace_id: string;
  message_id: string;
  event_type: MessageEventType;
  provider_event_id?: string | null;
  payload?: Json;
  occurred_at: string;
}

export interface SuppressionListRow {
  id: string;
  workspace_id: string;
  email: string;
  normalized_email: string;
  reason: SuppressionReason;
  source_message_id: string | null;
  note: string | null;
  created_at: string;
}

export interface SuppressionListInsert {
  id?: string;
  workspace_id: string;
  email: string;
  normalized_email: string;
  reason: SuppressionReason;
  source_message_id?: string | null;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// 0007 — automation jobs
// ---------------------------------------------------------------------------

/**
 * Tutti i campi §15.1 + workspace_id (tenant scoping), depends_on_job_id
 * (dependency graph §15) e cancelled_at (cancellation §15).
 */
export interface AutomationJobRow {
  id: string;
  workspace_id: string;
  job_type: JobType;
  entity_type: string;
  entity_id: string;
  status: JobStatus;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  idempotency_key: string;
  input_snapshot: Json;
  result: Json | null;
  error_code: string | null;
  error_detail: string | null;
  depends_on_job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface AutomationJobInsert {
  id?: string;
  workspace_id: string;
  job_type: JobType;
  entity_type: string;
  entity_id: string;
  status?: JobStatus;
  priority?: number;
  attempt_count?: number;
  max_attempts?: number;
  next_retry_at?: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  idempotency_key: string;
  input_snapshot?: Json;
  result?: Json | null;
  error_code?: string | null;
  error_detail?: string | null;
  depends_on_job_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

/** automation_job_events è append-only: esiste solo Insert. */
export interface AutomationJobEventRow {
  id: string;
  workspace_id: string;
  job_id: string;
  event_type: AutomationJobEventType;
  actor: string | null;
  payload: Json;
  created_at: string;
}

export interface AutomationJobEventInsert {
  id?: string;
  workspace_id: string;
  job_id: string;
  event_type: AutomationJobEventType;
  actor?: string | null;
  payload?: Json;
}

// ---------------------------------------------------------------------------
// 0008 — activity log (append-only, Decision Trace §19.1)
// ---------------------------------------------------------------------------

/** activity_log è append-only (RLS + trigger): esiste solo Insert. */
export interface ActivityLogRow {
  id: string;
  workspace_id: string;
  actor_type: ActorType;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  lead_id: string | null;
  category: ActivityCategory;
  event_type: string;
  message: string | null;
  data: Json;
  occurred_at: string;
}

export interface ActivityLogInsert {
  id?: string;
  workspace_id: string;
  actor_type: ActorType;
  actor_user_id?: string | null;
  entity_type: string;
  entity_id: string;
  lead_id?: string | null;
  category: ActivityCategory;
  event_type: string;
  message?: string | null;
  data?: Json;
  occurred_at?: string;
}

// ---------------------------------------------------------------------------
// 0009 — provider connections & feature flags (kill switch §19.2)
// ---------------------------------------------------------------------------

/** display_config contiene SOLO metadata non sensibili: mai API key (§18). */
export interface ProviderConnectionRow {
  id: string;
  workspace_id: string;
  provider: ProviderType;
  mode: ProviderMode;
  status: ConnectionStatus;
  display_config: Json;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderConnectionInsert {
  id?: string;
  workspace_id: string;
  provider: ProviderType;
  mode?: ProviderMode;
  status?: ConnectionStatus;
  display_config?: Json;
  last_verified_at?: string | null;
  last_error?: string | null;
}

/** Chiavi kill switch riservate §19.2 */
export type KillSwitchFlagKey =
  | 'OUTREACH_PAUSED_ALL'
  | 'DISCOVERY_PAUSED'
  | 'BROWSER_WORKERS_PAUSED';

export interface FeatureFlagValue {
  enabled: boolean;
  reason?: string;
  set_by?: string;
}

export interface WorkspaceFeatureFlagRow {
  id: string;
  workspace_id: string;
  key: string;
  value: Json; // FeatureFlagValue
  updated_by: string | null;
  updated_at: string;
}

export interface WorkspaceFeatureFlagInsert {
  id?: string;
  workspace_id: string;
  key: string;
  value: Json;
  updated_by?: string | null;
}

// ---------------------------------------------------------------------------
// 0011 — cost tracking (minimal)
// ---------------------------------------------------------------------------

export interface CostEventRow {
  id: string;
  workspace_id: string;
  provider: string;
  operation: string;
  entity_type: string | null;
  entity_id: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  quantity: number;
  estimated_cost_usd: number;
  currency: string;
  meta: Json;
  occurred_at: string;
  created_at: string;
}

export interface CostEventInsert {
  id?: string;
  workspace_id: string;
  provider: string;
  operation: string;
  entity_type?: string | null;
  entity_id?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null;
  quantity?: number;
  estimated_cost_usd?: number;
  currency?: string;
  meta?: Json;
  occurred_at?: string;
}

// ---------------------------------------------------------------------------
// 0022 — AI commercial runs (model/token/cost observability)
// ---------------------------------------------------------------------------

export type AiRunStatus = 'ok' | 'error' | 'timeout' | 'invalid_output';

export interface AiRunRow {
  id: string;
  workspace_id: string;
  provider: string;
  model: string;
  task_type: string;
  lead_id: string | null;
  campaign_id: string | null;
  thread_id: string | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: AiRunStatus;
  error_message: string | null;
  request_id: string | null;
  meta: Json;
  prompt_version: string | null;
  created_at: string;
}

export interface AiRunInsert {
  id?: string;
  workspace_id: string;
  provider: string;
  model: string;
  task_type: string;
  lead_id?: string | null;
  campaign_id?: string | null;
  thread_id?: string | null;
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
  latency_ms?: number;
  status: AiRunStatus;
  error_message?: string | null;
  request_id?: string | null;
  meta?: Json;
  prompt_version?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// 0023 — operator copilot sessions (never mixed with prospect threads)
// ---------------------------------------------------------------------------

export interface AiOperatorSessionRow {
  id: string;
  workspace_id: string;
  title: string;
  context: Json;
  created_at: string;
  updated_at: string;
}

export interface AiOperatorSessionInsert {
  id?: string;
  workspace_id: string;
  title?: string;
  context?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface AiOperatorMessageRow {
  id: string;
  workspace_id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: Json;
  tool_trace: Json;
  ai_run_id: string | null;
  created_at: string;
}

export interface AiOperatorMessageInsert {
  id?: string;
  workspace_id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: Json;
  tool_trace?: Json;
  ai_run_id?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// 0024 — AI commercial agent
// ---------------------------------------------------------------------------

export interface WebsiteAnalysisRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  website_audit_id: string | null;
  website_url: string | null;
  retrieved_text_hash: string | null;
  opportunity_score: number | null;
  confidence: number | null;
  visual_quality: string;
  mobile_clarity: string;
  cta_clarity: string;
  booking_clarity: string;
  trust_presentation: string;
  strengths: Json;
  issues: Json;
  evidence: Json;
  recommended_offer: string | null;
  recommended_approach: string | null;
  human_review_required: boolean;
  analysis: Json;
  provider: string | null;
  model: string | null;
  prompt_version: string;
  schema_version: string;
  created_at: string;
}

export interface WebsiteAnalysisInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  website_audit_id?: string | null;
  website_url?: string | null;
  retrieved_text_hash?: string | null;
  opportunity_score?: number | null;
  confidence?: number | null;
  visual_quality?: string;
  mobile_clarity?: string;
  cta_clarity?: string;
  booking_clarity?: string;
  trust_presentation?: string;
  strengths?: Json;
  issues?: Json;
  evidence?: Json;
  recommended_offer?: string | null;
  recommended_approach?: string | null;
  human_review_required?: boolean;
  analysis?: Json;
  provider?: string | null;
  model?: string | null;
  prompt_version?: string;
  schema_version?: string;
  created_at?: string;
}

export interface CommercialPlaybookRow {
  id: string;
  workspace_id: string;
  version: number;
  is_current: boolean;
  brand: Json;
  offer: Json;
  pricing: Json;
  discount: Json;
  qualification: Json;
  call_policy: Json;
  promise_policy: Json;
  human_escalation: Json;
  autonomy: Json;
  created_at: string;
  updated_at: string;
}

export interface CommercialPlaybookInsert {
  id?: string;
  workspace_id: string;
  version?: number;
  is_current?: boolean;
  brand?: Json;
  offer?: Json;
  pricing?: Json;
  discount?: Json;
  qualification?: Json;
  call_policy?: Json;
  promise_policy?: Json;
  human_escalation?: Json;
  autonomy?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface SalesThreadMemoryRow {
  thread_id: string;
  workspace_id: string;
  business_summary: string | null;
  main_need: string | null;
  services_requested: Json;
  budget_signal: string | null;
  pricing_discussed: boolean;
  objections: Json;
  decision_maker_status: string | null;
  timing: string | null;
  preferred_channel: string | null;
  sentiment: string | null;
  last_commitment: string | null;
  next_step: string | null;
  next_step_at: string | null;
  risk_flags: Json;
  human_notes: string | null;
  prompt_version: string;
  updated_at: string;
}

export interface SalesThreadMemoryInsert {
  thread_id: string;
  workspace_id: string;
  business_summary?: string | null;
  main_need?: string | null;
  services_requested?: Json;
  budget_signal?: string | null;
  pricing_discussed?: boolean;
  objections?: Json;
  decision_maker_status?: string | null;
  timing?: string | null;
  preferred_channel?: string | null;
  sentiment?: string | null;
  last_commitment?: string | null;
  next_step?: string | null;
  next_step_at?: string | null;
  risk_flags?: Json;
  human_notes?: string | null;
  prompt_version?: string;
  updated_at?: string;
}

export interface SalesThreadEventRow {
  id: string;
  workspace_id: string;
  thread_id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  event_type: string;
  payload: Json;
  ai_run_id: string | null;
  created_at: string;
}

export interface SalesThreadEventInsert {
  id?: string;
  workspace_id: string;
  thread_id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  event_type: string;
  payload?: Json;
  ai_run_id?: string | null;
  created_at?: string;
}

export interface PendingAiActionRow {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  tool: string;
  params: Json;
  payload_hash: string;
  target_summary: Json;
  policy_state: Json;
  status: string;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  result: Json | null;
  ai_run_id: string | null;
  created_at: string;
}

export interface PendingAiActionInsert {
  id?: string;
  workspace_id: string;
  idempotency_key: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  tool: string;
  params: Json;
  payload_hash: string;
  target_summary?: Json;
  policy_state?: Json;
  status?: string;
  expires_at: string;
  confirmed_at?: string | null;
  executed_at?: string | null;
  result?: Json | null;
  ai_run_id?: string | null;
  created_at?: string;
}

export type CommercialGoalMode = 'ASK' | 'DO' | 'AUTOPILOT';
export type CommercialGoalStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';
export type CommercialGoalMetric =
  | 'DEALS_WON'
  | 'APPOINTMENTS_BOOKED'
  | 'POSITIVE_REPLIES'
  | 'QUALIFIED_LEADS';

export interface CommercialGoalRow {
  id: string;
  workspace_id: string;
  title: string;
  outcome_type: 'ACQUIRE_CUSTOMERS' | 'BOOK_APPOINTMENTS' | 'GENERATE_REPLIES' | 'BUILD_PIPELINE';
  offer_key: string;
  target_metric: CommercialGoalMetric;
  target_value: number;
  current_value: number;
  starts_at: string;
  deadline: string;
  market: Json;
  mode: CommercialGoalMode;
  status: CommercialGoalStatus;
  strategy: Json;
  constraints: Json;
  progress_snapshot: Json;
  last_observed_at: string | null;
  next_tick_at: string | null;
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export interface CommercialGoalInsert {
  id?: string;
  workspace_id: string;
  title: string;
  outcome_type?: CommercialGoalRow['outcome_type'];
  offer_key: string;
  target_metric: CommercialGoalMetric;
  target_value: number;
  current_value?: number;
  starts_at?: string;
  deadline: string;
  market?: Json;
  mode?: CommercialGoalMode;
  status?: CommercialGoalStatus;
  strategy?: Json;
  constraints?: Json;
  progress_snapshot?: Json;
  last_observed_at?: string | null;
  next_tick_at?: string | null;
  lock_version?: number;
}

export interface CommercialGoalPlanRow {
  id: string;
  workspace_id: string;
  goal_id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'FAILED';
  rationale: string;
  hypotheses: Json;
  actions: Json;
  success_criteria: Json;
  observation_hash: string;
  replan_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CommercialGoalPlanInsert {
  id?: string;
  workspace_id: string;
  goal_id: string;
  version: number;
  status?: CommercialGoalPlanRow['status'];
  rationale: string;
  hypotheses?: Json;
  actions?: Json;
  success_criteria?: Json;
  observation_hash: string;
  replan_reason?: string | null;
  completed_at?: string | null;
}

export interface CommercialGoalEventRow {
  id: string;
  workspace_id: string;
  goal_id: string;
  plan_id: string | null;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  event_type: string;
  payload: Json;
  ai_run_id: string | null;
  created_at: string;
}

export interface CommercialGoalEventInsert {
  id?: string;
  workspace_id: string;
  goal_id: string;
  plan_id?: string | null;
  actor: CommercialGoalEventRow['actor'];
  event_type: string;
  payload?: Json;
  ai_run_id?: string | null;
}

export interface CommercialGoalLinkRow {
  id: string;
  workspace_id: string;
  goal_id: string;
  entity_type: 'campaign' | 'lead' | 'demo' | 'thread' | 'calendar_event' | 'automation_job';
  entity_id: string;
  role: string;
  created_at: string;
}

export interface CommercialGoalLinkInsert {
  id?: string;
  workspace_id: string;
  goal_id: string;
  entity_type: CommercialGoalLinkRow['entity_type'];
  entity_id: string;
  role?: string;
}

export interface AiActionAuditRow {
  id: string;
  workspace_id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  tool: string;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  ai_run_id: string | null;
  policy: Json;
  confirmation_id: string | null;
  result: Json;
  created_at: string;
}

export interface AiActionAuditInsert {
  id?: string;
  workspace_id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  tool: string;
  entity_type?: string | null;
  entity_id?: string | null;
  action: string;
  ai_run_id?: string | null;
  policy?: Json;
  confirmation_id?: string | null;
  result?: Json;
  created_at?: string;
}

export interface AiAutonomyPolicyRow {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  proposal: Json;
  rules: Json;
  playbook_version: number | null;
  created_at: string;
  activated_at: string | null;
}

export interface AiAutonomyPolicyInsert {
  id?: string;
  workspace_id: string;
  name?: string;
  status?: string;
  proposal?: Json;
  rules?: Json;
  playbook_version?: number | null;
  created_at?: string;
  activated_at?: string | null;
}

// ---------------------------------------------------------------------------
// 0025 — commercial calendar
// ---------------------------------------------------------------------------

export type CalendarSlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
export type CalendarEventType = 'APPOINTMENT' | 'WORK_DEADLINE' | 'REMINDER';
export type CalendarEventStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type CalendarEventSource = 'AI' | 'HUMAN' | 'SYSTEM';

export interface CalendarAvailabilitySlotRow {
  id: string;
  workspace_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: CalendarSlotStatus;
  booked_event_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarAvailabilitySlotInsert {
  id?: string;
  workspace_id: string;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  status?: CalendarSlotStatus;
  booked_event_id?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarEventRow {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  thread_id: string | null;
  slot_id: string | null;
  event_type: CalendarEventType;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  timezone: string;
  status: CalendarEventStatus;
  source: CalendarEventSource;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventInsert {
  id?: string;
  workspace_id: string;
  lead_id?: string | null;
  thread_id?: string | null;
  slot_id?: string | null;
  event_type: CalendarEventType;
  title: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  due_at?: string | null;
  timezone?: string;
  status?: CalendarEventStatus;
  source?: CalendarEventSource;
  reminder_at?: string | null;
  reminder_sent_at?: string | null;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// 0032 — check-up visibile da fuori (pagina pubblica)
// ---------------------------------------------------------------------------

export type SecurityTargetStatus =
  | 'listed'
  | 'audited'
  | 'skipped'
  | 'email_draft'
  | 'email_sent'
  | 'failed';

export type SecurityOutreachStatus = 'draft' | 'sent' | 'mock_sent' | 'failed';

export interface SecurityTargetRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  url: string;
  domain: string;
  name: string;
  status: SecurityTargetStatus;
  score: number | null;
  latest_audit_id: string | null;
  public_slug: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityTargetInsert {
  id?: string;
  workspace_id: string;
  lead_id: string;
  url: string;
  domain: string;
  name: string;
  status?: SecurityTargetStatus;
  score?: number | null;
  latest_audit_id?: string | null;
  public_slug: string;
  created_at?: string;
  updated_at?: string;
}

export interface SecurityAuditRow {
  id: string;
  workspace_id: string;
  target_id: string;
  lead_id: string;
  requested_url: string;
  final_url: string | null;
  http_status: number | null;
  score: number;
  headers: Json;
  technologies: Json;
  findings: Json;
  emails_found: Json;
  api_mentions: Json;
  ga_ids: Json;
  error: string | null;
  created_at: string;
}

export interface SecurityAuditInsert {
  id?: string;
  workspace_id: string;
  target_id: string;
  lead_id: string;
  requested_url: string;
  final_url?: string | null;
  http_status?: number | null;
  score: number;
  headers?: Json;
  technologies?: Json;
  findings?: Json;
  emails_found?: Json;
  api_mentions?: Json;
  ga_ids?: Json;
  error?: string | null;
  created_at?: string;
}

export interface SecurityOutreachRow {
  id: string;
  workspace_id: string;
  target_id: string;
  audit_id: string | null;
  to_email: string | null;
  subject: string;
  body_html: string;
  status: SecurityOutreachStatus;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface SecurityOutreachInsert {
  id?: string;
  workspace_id: string;
  target_id: string;
  audit_id?: string | null;
  to_email?: string | null;
  subject: string;
  body_html: string;
  status?: SecurityOutreachStatus;
  provider_message_id?: string | null;
  error?: string | null;
  created_at?: string;
  sent_at?: string | null;
}

// ---------------------------------------------------------------------------
// Mappa tabelle → Row (helper per i Domain Services / repository)
// ---------------------------------------------------------------------------


export interface Tables {
  workspaces: WorkspaceRow;
  workspace_members: WorkspaceMemberRow;
  leads: LeadRow;
  lead_contacts: LeadContactRow;
  lead_sources: LeadSourceRow;
  website_audits: WebsiteAuditRow;
  lead_scores: LeadScoreRow;
  tags: TagRow;
  lead_tags: LeadTagRow;
  segments: SegmentRow;
  website_templates: WebsiteTemplateRow;
  website_template_versions: WebsiteTemplateVersionRow;
  demo_sites: DemoSiteRow;
  demo_versions: DemoVersionRow;
  demo_assets: DemoAssetRow;
  followup_sequences: FollowupSequenceRow;
  followup_sequence_versions: FollowupSequenceVersionRow;
  campaigns: CampaignRow;
  campaign_policy_versions: CampaignPolicyVersionRow;
  campaign_leads: CampaignLeadRow;
  message_templates: MessageTemplateRow;
  message_template_versions: MessageTemplateVersionRow;
  message_drafts: MessageDraftRow;
  message_threads: MessageThreadRow;
  messages: MessageRow;
  message_events: MessageEventRow;
  suppression_list: SuppressionListRow;
  automation_jobs: AutomationJobRow;
  automation_job_events: AutomationJobEventRow;
  activity_log: ActivityLogRow;
  provider_connections: ProviderConnectionRow;
  workspace_feature_flags: WorkspaceFeatureFlagRow;
  cost_events: CostEventRow;
  ai_runs: AiRunRow;
  ai_operator_sessions: AiOperatorSessionRow;
  ai_operator_messages: AiOperatorMessageRow;
  website_analyses: WebsiteAnalysisRow;
  commercial_playbooks: CommercialPlaybookRow;
  sales_thread_memory: SalesThreadMemoryRow;
  sales_thread_events: SalesThreadEventRow;
  pending_ai_actions: PendingAiActionRow;
  commercial_goals: CommercialGoalRow;
  commercial_goal_plans: CommercialGoalPlanRow;
  commercial_goal_events: CommercialGoalEventRow;
  commercial_goal_links: CommercialGoalLinkRow;
  ai_action_audit: AiActionAuditRow;
  ai_autonomy_policies: AiAutonomyPolicyRow;
  calendar_availability_slots: CalendarAvailabilitySlotRow;
  calendar_events: CalendarEventRow;
  security_targets: SecurityTargetRow;
  security_audits: SecurityAuditRow;
  security_outreach: SecurityOutreachRow;
}

export type TableName = keyof Tables;

/** Firma della funzione SQL claim_job (0007): chiamabile solo da service_role. */
export interface ClaimJobArgs {
  p_worker_id: string;
  p_job_types?: JobType[] | null;
  p_lease_seconds?: number;
  p_workspace_id?: string | null;
}

/** Firma della funzione SQL recover_stuck_jobs (0007): ritorna il numero di job recuperati. */
export interface RecoverStuckJobsArgs {
  p_backoff_base_seconds?: number;
}

/** Firma della funzione SQL book_calendar_slot (0025). */
export interface BookCalendarSlotArgs {
  p_workspace_id: string;
  p_slot_id: string;
  p_lead_id: string;
  p_thread_id: string | null;
  p_title: string;
  p_description?: string | null;
  p_source?: CalendarEventSource;
}

/** Firma della funzione SQL cancel_calendar_appointment (0025). */
export interface CancelCalendarAppointmentArgs {
  p_workspace_id: string;
  p_event_id: string;
}
