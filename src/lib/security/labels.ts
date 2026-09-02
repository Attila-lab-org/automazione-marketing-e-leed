import type { SecurityTargetStatus } from '@/lib/types/database';

export const SECURITY_STATUS_LABELS: Record<SecurityTargetStatus, string> = {
  listed: 'In lista',
  audited: 'Report pronto',
  skipped: 'Saltato',
  email_draft: 'Email pronta',
  email_sent: 'Email inviata',
  failed: 'Pagina non aperta',
  deep_open: 'Controllo approfondito aperto',
  deep_done: 'Controllo approfondito fatto',
};

export function securityScoreClass(score: number | null): string {
  if (score === null) return 'border-stone-200 bg-stone-50 text-stone-500';
  if (score > 75) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (score >= 50) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

export type SecurityTargetListItem = {
  id: string;
  leadId: string;
  name: string;
  url: string;
  domain: string;
  status: SecurityTargetStatus;
  score: number | null;
  publicSlug: string;
  email: string | null;
  city: string | null;
  updatedAt: string;
  latestAuditAt: string | null;
  findingsCount: number;
};
