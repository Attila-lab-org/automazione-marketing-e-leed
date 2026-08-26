/**
 * Supabase Database contract — aligned to migrations 0001..0028.
 * Used as createClient<Database>() so invalid column selects fail at compile time.
 *
 * Note: mapped `AsRecord` converts interfaces → closed object types so they
 * satisfy supabase-js GenericTable (`Record<string, unknown>`).
 */

import type {
  ActivityLogInsert,
  ActivityLogRow,
  AiRunInsert,
  AiRunRow,
  AiActionAuditInsert,
  AiActionAuditRow,
  AiAutonomyPolicyInsert,
  AiAutonomyPolicyRow,
  AiOperatorMessageInsert,
  AiOperatorMessageRow,
  AiOperatorSessionInsert,
  AiOperatorSessionRow,
  AutomationJobEventInsert,
  AutomationJobEventRow,
  AutomationJobInsert,
  AutomationJobRow,
  BookCalendarSlotArgs,
  CalendarAvailabilitySlotInsert,
  CalendarAvailabilitySlotRow,
  CalendarEventInsert,
  CalendarEventRow,
  CancelCalendarAppointmentArgs,
  CampaignInsert,
  CampaignLeadInsert,
  CampaignLeadRow,
  CampaignPolicyVersionInsert,
  CampaignPolicyVersionRow,
  CampaignRow,
  ClaimJobArgs,
  CommercialPlaybookInsert,
  CommercialPlaybookRow,
  CommercialGoalInsert,
  CommercialGoalRow,
  CommercialGoalPlanInsert,
  CommercialGoalPlanRow,
  CommercialGoalEventInsert,
  CommercialGoalEventRow,
  CommercialGoalLinkInsert,
  CommercialGoalLinkRow,
  CostEventInsert,
  CostEventRow,
  DemoAssetInsert,
  DemoAssetRow,
  DemoSiteInsert,
  DemoSiteRow,
  DemoVersionInsert,
  DemoVersionRow,
  FollowupSequenceInsert,
  FollowupSequenceRow,
  FollowupSequenceVersionInsert,
  FollowupSequenceVersionRow,
  LeadContactInsert,
  LeadContactRow,
  LeadInsert,
  LeadRow,
  LeadScoreInsert,
  LeadScoreRow,
  LeadSourceInsert,
  LeadSourceRow,
  LeadTagInsert,
  LeadTagRow,
  MessageDraftInsert,
  MessageDraftRow,
  MessageEventInsert,
  MessageEventRow,
  MessageInsert,
  MessageRow,
  MessageTemplateInsert,
  MessageTemplateRow,
  MessageTemplateVersionInsert,
  MessageTemplateVersionRow,
  MessageThreadInsert,
  MessageThreadRow,
  PendingAiActionInsert,
  PendingAiActionRow,
  ProviderConnectionInsert,
  ProviderConnectionRow,
  RecoverStuckJobsArgs,
  SalesThreadEventInsert,
  SalesThreadEventRow,
  SalesThreadMemoryInsert,
  SalesThreadMemoryRow,
  SegmentInsert,
  SegmentRow,
  SuppressionListInsert,
  SuppressionListRow,
  TagInsert,
  TagRow,
  WebsiteAnalysisInsert,
  WebsiteAnalysisRow,
  WebsiteAuditInsert,
  WebsiteAuditRow,
  WebsiteTemplateInsert,
  WebsiteTemplateRow,
  WebsiteTemplateVersionInsert,
  WebsiteTemplateVersionRow,
  WorkspaceFeatureFlagInsert,
  WorkspaceFeatureFlagRow,
  WorkspaceInsert,
  WorkspaceMemberInsert,
  WorkspaceMemberRow,
  WorkspaceRow,
} from './database';

/** Closed object type (interfaces alone are not assignable to Record<string, unknown>). */
type AsRecord<T> = { [K in keyof T]: T[K] };

type Tbl<Row, Insert> = {
  Row: AsRecord<Row>;
  Insert: AsRecord<Insert>;
  /** Partial Row so updated_at / server columns are writable. */
  Update: AsRecord<Partial<Row>>;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      workspaces: Tbl<WorkspaceRow, WorkspaceInsert>;
      workspace_members: Tbl<WorkspaceMemberRow, WorkspaceMemberInsert>;
      leads: Tbl<LeadRow, LeadInsert>;
      lead_contacts: Tbl<LeadContactRow, LeadContactInsert>;
      lead_sources: Tbl<LeadSourceRow, LeadSourceInsert>;
      website_audits: Tbl<WebsiteAuditRow, WebsiteAuditInsert>;
      lead_scores: Tbl<LeadScoreRow, LeadScoreInsert>;
      tags: Tbl<TagRow, TagInsert>;
      lead_tags: Tbl<LeadTagRow, LeadTagInsert>;
      segments: Tbl<SegmentRow, SegmentInsert>;
      website_templates: Tbl<WebsiteTemplateRow, WebsiteTemplateInsert>;
      website_template_versions: Tbl<WebsiteTemplateVersionRow, WebsiteTemplateVersionInsert>;
      demo_sites: Tbl<DemoSiteRow, DemoSiteInsert>;
      demo_versions: Tbl<DemoVersionRow, DemoVersionInsert>;
      demo_assets: Tbl<DemoAssetRow, DemoAssetInsert>;
      followup_sequences: Tbl<FollowupSequenceRow, FollowupSequenceInsert>;
      followup_sequence_versions: Tbl<
        FollowupSequenceVersionRow,
        FollowupSequenceVersionInsert
      >;
      campaigns: Tbl<CampaignRow, CampaignInsert>;
      campaign_policy_versions: Tbl<CampaignPolicyVersionRow, CampaignPolicyVersionInsert>;
      campaign_leads: Tbl<CampaignLeadRow, CampaignLeadInsert>;
      message_templates: Tbl<MessageTemplateRow, MessageTemplateInsert>;
      message_template_versions: Tbl<
        MessageTemplateVersionRow,
        MessageTemplateVersionInsert
      >;
      message_drafts: Tbl<MessageDraftRow, MessageDraftInsert>;
      message_threads: Tbl<MessageThreadRow, MessageThreadInsert>;
      messages: Tbl<MessageRow, MessageInsert>;
      message_events: Tbl<MessageEventRow, MessageEventInsert>;
      suppression_list: Tbl<SuppressionListRow, SuppressionListInsert>;
      automation_jobs: Tbl<AutomationJobRow, AutomationJobInsert>;
      automation_job_events: Tbl<AutomationJobEventRow, AutomationJobEventInsert>;
      activity_log: Tbl<ActivityLogRow, ActivityLogInsert>;
      provider_connections: Tbl<ProviderConnectionRow, ProviderConnectionInsert>;
      workspace_feature_flags: Tbl<WorkspaceFeatureFlagRow, WorkspaceFeatureFlagInsert>;
      cost_events: Tbl<CostEventRow, CostEventInsert>;
      ai_runs: Tbl<AiRunRow, AiRunInsert>;
      ai_operator_sessions: Tbl<AiOperatorSessionRow, AiOperatorSessionInsert>;
      ai_operator_messages: Tbl<AiOperatorMessageRow, AiOperatorMessageInsert>;
      website_analyses: Tbl<WebsiteAnalysisRow, WebsiteAnalysisInsert>;
      commercial_playbooks: Tbl<CommercialPlaybookRow, CommercialPlaybookInsert>;
      sales_thread_memory: Tbl<SalesThreadMemoryRow, SalesThreadMemoryInsert>;
      sales_thread_events: Tbl<SalesThreadEventRow, SalesThreadEventInsert>;
      pending_ai_actions: Tbl<PendingAiActionRow, PendingAiActionInsert>;
      commercial_goals: Tbl<CommercialGoalRow, CommercialGoalInsert>;
      commercial_goal_plans: Tbl<CommercialGoalPlanRow, CommercialGoalPlanInsert>;
      commercial_goal_events: Tbl<CommercialGoalEventRow, CommercialGoalEventInsert>;
      commercial_goal_links: Tbl<CommercialGoalLinkRow, CommercialGoalLinkInsert>;
      ai_action_audit: Tbl<AiActionAuditRow, AiActionAuditInsert>;
      ai_autonomy_policies: Tbl<AiAutonomyPolicyRow, AiAutonomyPolicyInsert>;
      calendar_availability_slots: Tbl<
        CalendarAvailabilitySlotRow,
        CalendarAvailabilitySlotInsert
      >;
      calendar_events: Tbl<CalendarEventRow, CalendarEventInsert>;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_job: {
        Args: AsRecord<ClaimJobArgs>;
        Returns: AsRecord<AutomationJobRow> | null;
      };
      recover_stuck_jobs: {
        Args: AsRecord<RecoverStuckJobsArgs>;
        Returns: number;
      };
      book_calendar_slot: {
        Args: AsRecord<BookCalendarSlotArgs>;
        Returns: string;
      };
      cancel_calendar_appointment: {
        Args: AsRecord<CancelCalendarAppointmentArgs>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/** Typed admin/browser client alias. */
export type AppSupabaseClient = import('@supabase/supabase-js').SupabaseClient<Database>;
