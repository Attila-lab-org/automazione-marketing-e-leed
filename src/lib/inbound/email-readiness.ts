function extractEmail(value: string | undefined): string | null {
  const match = value?.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? null;
}

export type EmailReplyPathReadiness = {
  ready: boolean;
  replyTo: string | null;
  inboundDomain: string | null;
  missing: string[];
};

/**
 * Un invio commerciale live è sicuro solo se il destinatario può rispondere.
 * Non ricade mai silenziosamente sul From: un mittente valido non implica una
 * mailbox inbound configurata.
 */
export function getEmailReplyPathReadiness(
  env: NodeJS.ProcessEnv = process.env,
): EmailReplyPathReadiness {
  const missing: string[] = [];
  const replyTo = extractEmail(env.RESEND_REPLY_TO);
  const inboundDomain = env.RESEND_INBOUND_DOMAIN?.trim().toLowerCase() || null;
  const inboundEnabled = env.RESEND_INBOUND_ENABLED?.trim().toLowerCase() === 'true';

  if (!replyTo) missing.push('RESEND_REPLY_TO');
  if (!inboundDomain) missing.push('RESEND_INBOUND_DOMAIN');
  if (!inboundEnabled) missing.push('RESEND_INBOUND_ENABLED=true');
  if (replyTo && inboundDomain && !replyTo.endsWith(`@${inboundDomain}`)) {
    missing.push('RESEND_REPLY_TO deve appartenere a RESEND_INBOUND_DOMAIN');
  }

  return {
    ready: missing.length === 0,
    replyTo,
    inboundDomain,
    missing,
  };
}

export function requireEmailReplyPath(env: NodeJS.ProcessEnv = process.env): string {
  const readiness = getEmailReplyPathReadiness(env);
  if (!readiness.ready || !readiness.replyTo) {
    throw new Error(
      `Invio live bloccato: canale di risposta email non pronto (${readiness.missing.join(', ')})`,
    );
  }
  return readiness.replyTo;
}
