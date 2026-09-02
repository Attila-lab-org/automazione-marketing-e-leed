import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveAppUrl } from '@/lib/app-url';

type UnsubscribePayload = {
  v: 1;
  workspaceId: string;
  leadId: string;
};

function secret(env: NodeJS.ProcessEnv): string {
  const value = env.UNSUBSCRIBE_SECRET?.trim() || env.ADMIN_SESSION_SECRET?.trim();
  if (!value) throw new Error('UNSUBSCRIBE_SECRET non configurato');
  return value;
}

function signature(payload: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', secret(env)).update(payload).digest('base64url');
}

export function createUnsubscribeToken(
  workspaceId: string,
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, workspaceId, leadId } satisfies UnsubscribePayload),
    'utf8',
  ).toString('base64url');
  return `${payload}.${signature(payload, env)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): UnsubscribePayload | null {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;
  const expected = Buffer.from(signature(payload, env));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<UnsubscribePayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.workspaceId !== 'string' ||
      typeof parsed.leadId !== 'string'
    ) {
      return null;
    }
    return parsed as UnsubscribePayload;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrls(
  workspaceId: string,
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): { pageUrl: string; oneClickUrl: string } {
  const appUrl = resolveAppUrl(env);
  const token = encodeURIComponent(createUnsubscribeToken(workspaceId, leadId, env));
  return {
    pageUrl: `${appUrl}/unsubscribe?token=${token}`,
    oneClickUrl: `${appUrl}/api/unsubscribe?token=${token}`,
  };
}
