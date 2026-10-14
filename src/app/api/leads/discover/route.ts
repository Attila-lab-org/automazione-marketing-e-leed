import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import {
  DiscoveryValidationError,
  runLeadDiscovery,
  validateDiscoveryInput,
} from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';
/** Places + insert batch: evita timeout Vercel su ricerche più ampie. */
export const maxDuration = 60;

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase non configurato (URL / anon / service role).' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const input = validateDiscoveryInput(body);
    const result = await runLeadDiscovery(input, process.env);

    const message = result.exhausted
      ? 'In questa città non ho altre zone da cercare.'
      : result.created === 0
        ? 'Nessun locale nuovo. Quelli trovati erano già salvati.'
        : `Trovati ${result.created} locali nuovi. Sono qui sotto.`;

    return NextResponse.json({
      found: result.found,
      created: result.created,
      duplicates: result.duplicates,
      qualified: result.qualified,
      message,
      query: result.query,
      leads: result.leads,
    });
  } catch (err) {
    if (err instanceof DiscoveryValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message =
      err instanceof Error
        ? err.message.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]')
        : 'Discovery fallita';
    console.error('POST /api/leads/discover', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
