import { NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth/authenticate';
import { adminSessionCookieOptions } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email e password obbligatorie' }, { status: 400 });
    }

    const result = await authenticateAdmin(body.email, body.password);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const opts = adminSessionCookieOptions();
    const res = NextResponse.json({ ok: true, email: result.email });
    res.cookies.set(opts.name, result.token, opts);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login fallito';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
