import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { updateDemoContent } from '@/lib/demos/update';
import { listDemos, loadDemoById } from '@/lib/demos/load';
import type { DemoPersonalization } from '@/lib/ai/commercial/schemas';
import type { WriteResult } from './writes';
import { recordAiAudit } from './writes';

export async function personalizeDemoForOperator(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  leadId: string | null;
  demoId: string | null;
  instruction?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult[]> {
  const env = args.env ?? process.env;
  let demoId = args.demoId;
  if (!demoId && args.leadId) {
    const demos = await listDemos(args.admin, args.workspaceId);
    demoId = demos.find((d) => d.leadName)?.id ?? demos[0]?.id ?? null;
    if (args.leadId) {
      const match = await Promise.all(
        demos.map(async (d) => {
          const full = await loadDemoById(args.admin, args.workspaceId, d.id);
          return full?.lead.id === args.leadId ? d.id : null;
        }),
      );
      demoId = match.find(Boolean) ?? demoId;
    }
  }
  if (!demoId) {
    return [{ tool: 'personalize_demo', ok: false, summary: 'Nessuna demo nel contesto da personalizzare.', data: {} }];
  }
  const demo = await loadDemoById(args.admin, args.workspaceId, demoId);
  if (!demo) {
    return [{ tool: 'personalize_demo', ok: false, summary: 'Demo non trovata.', data: {} }];
  }
  const provider = getAICommercialProvider(env);
  const route = resolveModel('personalize_demo', env);
  const result = await provider.personalizeDemo(
    {
      name: demo.lead.name,
      city: demo.lead.city,
      category: demo.lead.category,
      websiteUrl: demo.lead.website_url,
    },
    { model: route.model },
  );
  const copy = applyInstructionTone(result.output, args.instruction);
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'personalize_demo',
    action: 'propose',
    entityType: 'demo',
    entityId: demoId,
    result: copy as unknown as Record<string, unknown>,
  });
  return [
    {
      tool: 'personalize_demo',
      ok: true,
      summary: `Proposta testi per «${demo.lead.name}»: «${copy.headline}». Nessun invio. Dimmi se la applico.`,
      data: { demoId, leadId: demo.lead.id, proposal: copy, publicPath: demo.publicPath },
    },
  ];
}

export async function applyDemoPersonalization(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  demoId: string;
  proposal: DemoPersonalization;
}): Promise<WriteResult[]> {
  const content: Record<string, unknown> = {
    headline: args.proposal.headline,
    description: args.proposal.description,
    cta: args.proposal.ctaLabel,
  };
  if (args.proposal.subheadline) content.subheadline = args.proposal.subheadline;
  await updateDemoContent(args.admin, args.workspaceId, args.demoId, { content });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'apply_demo_personalization',
    action: 'apply',
    entityType: 'demo',
    entityId: args.demoId,
  });
  return [
    {
      tool: 'apply_demo_personalization',
      ok: true,
      summary: 'Testi demo aggiornati (headline, descrizione, CTA). Nessun messaggio inviato.',
      data: { demoId: args.demoId },
    },
  ];
}

function applyInstructionTone(copy: DemoPersonalization, instruction?: string): DemoPersonalization {
  const q = (instruction ?? '').toLowerCase();
  if (/trattoria|rustic|calore|meno elegante|troppo elegante/.test(q)) {
    return {
      ...copy,
      tone: 'warm_trattoria',
      headline: copy.headline.replace(/esperienza raffinat|elegan/i, 'tavola autentica') || copy.headline,
      subheadline: 'Una trattoria da raccontare così come è, senza eccessi.',
    };
  }
  return copy;
}
