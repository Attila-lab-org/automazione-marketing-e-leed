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
  | 'WEBHOOK_PROCESSING';

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

/** 0002 — check constraint su lead_sources.source_type */
export type LeadSourceType =
  | 'GOOGLE_PLACES_DISCOVERY'
  | 'GOOGLE_PLACES_ENRICHMENT'
  | 'WEBSITE_ANALYSIS'
  | 'MANUAL'
  | 'IMPORT';

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
