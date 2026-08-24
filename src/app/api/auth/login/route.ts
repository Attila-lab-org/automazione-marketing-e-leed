import { NextResponse } from 'next/server';
import {
  adminSessionCookieOptions,
  createAdminSessionToken,
  validateAdminCredentials,
} from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email e password obbligatorie' }, { status: 400 });
    }
    if (!process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD non configurata sul server' },
        { status: 503 },
      );
    }
    if (!validateAdminCredentials(body.email, body.password)) {
      return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 });
    }

    const token = createAdminSessionToken(body.email.trim().toLowerCase());
    const opts = adminSessionCookieOptions();
    const res = NextResponse.json({ ok: true, email: body.email.trim().toLowerCase() });
    res.cookies.set(opts.name, token, opts);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login fallito';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
