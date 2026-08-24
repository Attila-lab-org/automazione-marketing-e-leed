import { NextResponse } from 'next/server';
import { AuthError, guardAdminApi } from '@/lib/auth/guard';

type Handler = (request: Request, ctx?: unknown) => Promise<Response>;

export function withAdmin(handler: Handler): Handler {
  return async (request, ctx) => {
    const denied = await guardAdminApi(request);
    if (denied) return denied;
    try {
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const message = err instanceof Error ? err.message : 'Errore interno';
      console.error(message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
