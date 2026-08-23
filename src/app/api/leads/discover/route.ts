import { NextResponse } from 'next/server';
import {
  DiscoveryValidationError,
  runLeadDiscovery,
  validateDiscoveryInput,
} from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Supabase non configurato (URL / anon / service role).' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const input = validateDiscoveryInput(body);
    const result = await runLeadDiscovery(input, process.env);

    return NextResponse.json({
      found: result.found,
      created: result.created,
      duplicates: result.duplicates,
      qualified: result.qualified,
      message: `${result.found} lead trovati · ${result.created} nuovi · ${result.duplicates} duplicati · ${result.qualified} qualificati`,
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
}
