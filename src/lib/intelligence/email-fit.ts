export type EmailFit =
  | 'commercially_appropriate'
  | 'role_review'
  | 'not_commercial'
  | 'unknown';

const COMMERCIAL = ['info', 'hello', 'ciao', 'contatti', 'direzione', 'commerciale', 'ristorante', 'studio'];
const REVIEW = ['booking', 'prenotazioni', 'reservations', 'webmaster'];
const NOT_COMMERCIAL = ['privacy', 'dpo', 'legal', 'noreply', 'no-reply', 'bounce', 'abuse'];

export function classifyEmailFit(email: string | null | undefined): {
  fit: EmailFit;
  localPart: string | null;
  mailboxVerified: false;
  note: string;
} {
  if (!email || !email.includes('@')) {
    return {
      fit: 'unknown',
      localPart: null,
      mailboxVerified: false,
      note: 'Nessuna email trovata. GPT non può dichiarare una mailbox verificata.',
    };
  }
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (NOT_COMMERCIAL.some((p) => local.includes(p))) {
    return {
      fit: 'not_commercial',
      localPart: local,
      mailboxVerified: false,
      note: 'Indirizzo di ruolo privacy/tecnico: da non usare per outreach commerciale.',
    };
  }
  if (REVIEW.some((p) => local.includes(p))) {
    return {
      fit: 'role_review',
      localPart: local,
      mailboxVerified: false,
      note: 'Indirizzo di ruolo operativo: valutare se è adatto al contatto commerciale.',
    };
  }
  if (COMMERCIAL.some((p) => local.includes(p))) {
    return {
      fit: 'commercially_appropriate',
      localPart: local,
      mailboxVerified: false,
      note: 'Indirizzo potenzialmente commerciale. Non verificato.',
    };
  }
  return {
    fit: 'unknown',
    localPart: local,
    mailboxVerified: false,
    note: 'Local-part non classificato. Non equivale a mailbox verificata.',
  };
}
