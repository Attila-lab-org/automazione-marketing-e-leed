/**
 * Domain types for Sales Automation OS — Phase 1 Foundation.
 *
 * Aligned with:
 * - docs/MASTER_SPEC.md §3.1 (stati separati), §4/§4.1 (policy), §5.1 (score),
 *   §11.2 (Send Guard), §15.1 (job model)
 * - docs/DATABASE_MIGRATION_PLAN.md §3 (enums), §5–§10 (tabelle/colonne)
 *
 * NOTE: le migrazioni SQL sono scritte da un altro workstream; questi tipi TS
 * rispecchiano enum e colonne definite nel piano. Qualunque divergenza va
 * risolta aggiornando ENTRAMBI i documenti, mai hardcodando valori divergenti.
 */

// ---------------------------------------------------------------------------
// Enum runtime values + tipi (allineati agli enum SQL, migration plan §3)
// ---------------------------------------------------------------------------

/** §3.1 — significato commerciale del lead. */
export const BUSINESS_STATUSES = [
  'NEW',
  'QUALIFIED',
  'CAMPAIGN_READY',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'SUPPRESSED',
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/** §3.1 — stato macchina di elaborazione (asse indipendente dal business status). */
export const PROCESSING_STATUSES = [
  'IDLE',
  'ENRICHING',
  'ANALYZING',
  'SCORING',
  'DEMO_GENERATING',
  'SCREENSHOT_GENERATING',
  'MESSAGE_GENERATING',
  'SENDING',
  'FAILED',
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/** §4 — modalità operativa di una campagna/workspace. */
export const POLICY_MODES = ['MANUAL', 'SCORE_BASED', 'FULL_AUTO'] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

/** §4.1 — modalità del singolo gate granulare per azione. */
export const POLICY_GATE_MODES = ['AUTO', 'SCORE_THRESHOLD', 'MANUAL', 'OFF'] as const;
export type PolicyGateMode = (typeof POLICY_GATE_MODES)[number];

/** Azioni governate dalle policy granulari §4.1. */
export const POLICY_ACTIONS = [
  'discovery',
  'enrichment',
  'website_analysis',
  'demo_generation',
  'screenshot',
  'message_generation',
  'send',
  'followup',
] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

/** Migration plan §3.6 / §10.1 — job model §15.1. */
export const JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'RETRYING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = [
  'DISCOVERY_RUN',
  'LEAD_ENRICHMENT',
  'WEBSITE_ANALYSIS',
  'LEAD_SCORING',
  'DEMO_GENERATION',
  'SCREENSHOT_DESKTOP',
  'SCREENSHOT_MOBILE',
  'MESSAGE_GENERATION',
  'SEND_MESSAGE',
  'FOLLOWUP_STEP',
  'WEBHOOK_PROCESSING',
  'CALENDAR_REMINDER',
  'SALES_PROACTIVE_STEP',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Migration plan §8.1. */
export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_LEAD_STATUSES = [
  'PENDING',
  'GENERATING',
  'READY',
  'REVIEW',
  'APPROVED',
  'SENDING',
  'SENT',
  'REPLIED',
  'STOPPED',
  'FAILED',
  'SKIPPED',
] as const;
export type CampaignLeadStatus = (typeof CAMPAIGN_LEAD_STATUSES)[number];

/** Migration plan §9.1. */
export const DRAFT_STATUSES = [
  'DRAFT',
  'READY',
  'APPROVED',
  'SENT',
  'CANCELLED',
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const MESSAGE_EVENT_TYPES = [
  'SENT',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'BOUNCED',
  'COMPLAINED',
  'UNSUBSCRIBED',
  'REPLIED',
] as const;
export type MessageEventType = (typeof MESSAGE_EVENT_TYPES)[number];

export const SUPPRESSION_REASONS = [
  'HARD_BOUNCE',
  'UNSUBSCRIBE',
  'STOP_REQUEST',
  'MANUAL',
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** Migration plan §7.1. */
export const DEMO_STATUSES = ['DRAFT', 'PUBLISHED', 'DISABLED', 'EXPIRED'] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

/** Provider selection (migration plan §12.1 provider_mode). */
export const PROVIDER_MODES = ['MOCK', 'LIVE'] as const;
export type ProviderMode = (typeof PROVIDER_MODES)[number];

// ---------------------------------------------------------------------------
// Lead (colonne core §16.2 / migration plan §5.1)
// ---------------------------------------------------------------------------

export interface Lead {
  id: string;
  workspaceId: string;
  googlePlaceId: string | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  phone: string | null;
  email: string | null;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  businessStatus: BusinessStatus;
  processingStatus: ProcessingStatus;
  currentScore: number | null;
  currentConfidence: number | null;
  rating: number | null;
  reviewCount: number | null;
  googleLastEnrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Website audit (result contract §14.1 / migration plan §6.1)
// ---------------------------------------------------------------------------

export const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export interface AuditIssue {
  type: string;
  severity: IssueSeverity;
  evidence: string;
  confidence: number; // 0-100
}

export interface AuditOpportunity {
  type: string;
  description: string;
  evidence: string;
  confidence: number; // 0-100
}

/** Contratto normalizzato §14.1 restituito dal BrowserWorkerProvider. */
export interface WebsiteAuditResult {
  finalUrl: string;
  redirectChain: string[];
  emailsFound: string[];
  phonesFound: string[];
  socialLinks: string[];
  ctas: string[];
  keyPages: string[];
  mobileSignals: {
    responsive: boolean;
    viewportMeta: boolean;
    [key: string]: unknown;
  };
  issues: AuditIssue[];
  opportunities: AuditOpportunity[];
  evidenceAssets: string[];
  analyzedBy: string;
}

export interface WebsiteAudit extends WebsiteAuditResult {
  id: string;
  workspaceId: string;
  leadId: string;
  auditVersion: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Scoring §5.1 — score spiegabile e versionato
// ---------------------------------------------------------------------------

export const SCORE_DIMENSIONS = [
  'opportunity',
  'contactability',
  'data_confidence',
  'template_match',
  'business_potential',
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export interface ScoreDimensionBreakdown {
  score: number; // 0-100
  weight: number; // peso applicato (0-1)
  signals: string[]; // evidenze sintetiche che spiegano il punteggio
}

/** Breakdown completo persistito in lead_scores.breakdown (jsonb, not null §5.1). */
export type ScoreBreakdown = Record<ScoreDimension, ScoreDimensionBreakdown>;

/** Output dello Score Engine: mai un numero unico senza evidenze (§5.1). */
export interface LeadScore {
  algorithmVersion: string;
  opportunityScore: number;
  contactabilityScore: number;
  dataConfidenceScore: number;
  templateMatchScore: number;
  businessPotentialScore: number;
  totalScore: number; // media pesata 0-100
  confidence: number; // 0-100
  breakdown: ScoreBreakdown;
  reasons: string[]; // motivazioni sintetiche §5.1
}

// ---------------------------------------------------------------------------
// Policy §4/§4.1 — configurazione, risoluzione, snapshot, valutazione
// ---------------------------------------------------------------------------

/**
 * Soglie decisionali §5.2. NON hardcoded nel motore (§23.1): fanno parte della
 * configurazione di policy e vengono congelate nello snapshot.
 */
export interface SendThresholds {
  minOpportunity: number; // default 85 (§5.2)
  minConfidence: number; // default 85 (§5.2)
  minContactability: number; // default 80 (§5.2)
  requireValidEmail: boolean; // default true (§5.2)
  /** Business status considerati "attivi" per l'auto-send (§5.2). */
  activeBusinessStatuses: BusinessStatus[];
  /**
   * Fascia intermedia → Review Queue (§4). Sotto questi minimi il gate è
   * BLOCKED; tra minimi review e soglie auto → REVIEW.
   */
  reviewMinOpportunity: number;
  reviewMinConfidence: number;
  reviewMinContactability: number;
}

export interface RateLimitConfig {
  perHour: number | null;
  perDay: number | null;
}

export interface PolicyConfig {
  mode: PolicyMode;
  /** Gate granulare per azione §4.1. */
  actions: Record<PolicyAction, PolicyGateMode>;
  thresholds: SendThresholds;
  rateLimit: RateLimitConfig;
  sendWindow: { startHour: number | null; endHour: number | null; timezone: string | null };
  dailyLimit: number | null;
}

/** Override parziale a livello campaign/category (§4.1). */
export type PolicyOverride = Partial<Omit<PolicyConfig, 'actions' | 'thresholds'>> & {
  actions?: Partial<Record<PolicyAction, PolicyGateMode>>;
  thresholds?: Partial<SendThresholds>;
};

/**
 * POLICY SNAPSHOT (§4.1): copia completa e immutabile della policy applicata,
 * salvata su campaign_lead/job al momento della materializzazione. Una modifica
 * futura della policy non cambia retroattivamente i job già materializzati.
 */
export interface PolicySnapshot {
  policyVersionId: string | null;
  campaignId: string | null;
  version: number | null;
  capturedAt: string; // ISO timestamp
  config: PolicyConfig;
}

/** Contesto di valutazione del gate per un'azione. */
export interface PolicyEvaluationInput {
  action: PolicyAction;
  score: LeadScore | null;
  validEmail: boolean;
  businessStatus: BusinessStatus;
}

export const POLICY_DECISIONS = ['AUTO', 'REVIEW', 'MANUAL', 'BLOCKED'] as const;
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export interface PolicyEvaluation {
  action: PolicyAction;
  gateMode: PolicyGateMode;
  decision: PolicyDecision;
  /** true se l'azione può procedere senza intervento umano. */
  autoApproved: boolean;
  reasons: string[];
  policyVersionId: string | null;
  policyVersion: number | null;
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Send Guard §11.2
// ---------------------------------------------------------------------------

export const SEND_GUARD_CHECKS = [
  'recipient',
  'lead',
  'campaign',
  'policy',
  'message',
  'demo',
  'idempotency',
] as const;
export type SendGuardCheckName = (typeof SEND_GUARD_CHECKS)[number];

export interface SendGuardCheck {
  name: SendGuardCheckName;
  passed: boolean;
  reasons: string[];
}

/** Esito strutturale del Send Guard: unico gate di emissione §11.2. */
export interface SendGuardResult {
  allowed: boolean;
  checks: SendGuardCheck[];
  /** Motivi di blocco aggregati (vuoto se allowed). */
  blockers: string[];
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Messaging §11 — master versionato, draft personalizzata, override locale
// ---------------------------------------------------------------------------

export interface MessageTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  subject: string;
  body: string;
  variables: string[];
}

/** Snapshot per lead con variabili risolte (§11 "Personalized draft"). */
export interface MessageDraft {
  templateVersionId: string;
  sequenceStep: number;
  subject: string;
  body: string;
  resolvedVariables: Record<string, string>;
  missingVariables: string[];
  status: DraftStatus;
  /** Manual override: modifica locale che NON aggiorna il master (§11). */
  isOverride: boolean;
}

// ---------------------------------------------------------------------------
// Job model §15.1 — tutti i campi obbligatori minimi
// ---------------------------------------------------------------------------

export interface AutomationJob {
  id: string;
  workspaceId: string;
  jobType: JobType;
  entityType: string;
  entityId: string;
  status: JobStatus;
  priority: number; // più basso = priorità più alta
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  /** UNIQUE — convenzione: <job_type>:<entity_type>:<entity_id>:<scope> */
  idempotencyKey: string;
  inputSnapshot: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorDetail: string | null;
  /** Dependency graph §15: il job è claimable solo se la dipendenza è SUCCEEDED. */
  dependsOnJobId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}
