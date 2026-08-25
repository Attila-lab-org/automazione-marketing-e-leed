import { classifyEmailFit } from '@/lib/intelligence/email-fit';
import type { WebsiteSnapshot } from '@/lib/intelligence/extract';
import {
  type BusinessOpportunity,
  type DemoPersonalization,
  type InboundClassification,
  type OutboundCritique,
  type OutboundDraft,
  type SalesReplyDraft,
  type WebsiteAnalysis,
} from './schemas';
import { criticDraft, hasInjectionAttempt } from './grounding';

export type WebsiteAnalysisInput = {
  snapshot: WebsiteSnapshot;
  google?: {
    name?: string | null;
    category?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    city?: string | null;
  };
  screenshotAvailable?: boolean;
};

export type BusinessAnalysisInput = {
  name: string;
  city?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  websiteUrl?: string | null;
  discoveryScore?: number | null;
  alreadyContacted?: boolean;
  hasDemo?: boolean;
  email?: string | null;
  website?: WebsiteAnalysis | null;
};

export type OutboundWriterInput = {
  leadName: string;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  demoUrl?: string | null;
  senderName: string;
  offerName: string;
  verifiedFacts: string[];
  website?: WebsiteAnalysis | null;
};

function scoreFromFacts(input: WebsiteAnalysisInput): number {
  let score = 40;
  const g = input.google;
  if ((g?.reviewCount ?? 0) >= 200) score += 20;
  else if ((g?.reviewCount ?? 0) >= 50) score += 12;
  if ((g?.rating ?? 0) >= 4.3) score += 10;
  if (input.snapshot.retrieved) score += 8;
  if (input.snapshot.ctas.length === 0 && input.snapshot.retrieved) score += 10;
  if (!input.snapshot.hasViewportMeta && input.snapshot.retrieved) score += 6;
  if (input.snapshot.bookingSignals.length === 0 && input.snapshot.retrieved) score += 6;
  return Math.max(0, Math.min(100, score));
}

export function mockAnalyzeWebsite(input: WebsiteAnalysisInput): WebsiteAnalysis {
  const snap = input.snapshot;
  const corpus = [
    snap.title,
    snap.description,
    snap.headings.join(' '),
    snap.ctas.join(' '),
    snap.textExcerpt,
    input.google?.name,
    input.google?.city,
  ]
    .filter(Boolean)
    .join('\n');

  const issues: WebsiteAnalysis['issues'] = [];
  const strengths: WebsiteAnalysis['strengths'] = [];
  if (snap.retrieved && snap.ctas.length === 0) {
    issues.push({
      text: 'Nessuna CTA evidenziata nel testo recuperato',
      evidence: snap.headings[0] || snap.title || 'HTML senza link di prenotazione/contatto osservati',
    });
  }
  if (snap.retrieved && !snap.hasViewportMeta) {
    issues.push({
      text: 'Meta viewport non osservata nel HTML recuperato',
      evidence: 'assenza di name="viewport" nel markup',
    });
  }
  if ((input.google?.reviewCount ?? 0) > 100) {
    strengths.push({
      text: 'Attività con molte recensioni pubbliche',
      evidence: `${input.google?.reviewCount} recensioni Google`,
    });
  }
  if (snap.bookingSignals.length > 0) {
    strengths.push({
      text: 'Segnale di prenotazione presente nel sito',
      evidence: snap.bookingSignals.join(', '),
    });
  }

  return {
    opportunityScore: scoreFromFacts(input),
    confidence: snap.retrieved ? 0.72 : 0.35,
    visualQuality: input.screenshotAvailable ? 'medium' : 'unknown',
    mobileClarity: snap.retrieved ? (snap.hasViewportMeta ? 'medium' : 'low') : 'unknown',
    ctaClarity: snap.retrieved ? (snap.ctas.length > 0 ? 'medium' : 'low') : 'unknown',
    bookingClarity: snap.retrieved
      ? snap.bookingSignals.length > 0
        ? 'present'
        : 'none_observed'
      : 'unknown',
    trustPresentation: (input.google?.reviewCount ?? 0) > 50 ? 'high' : 'unknown',
    strengths,
    issues,
    recommendedOffer: 'Restaurant Premium V3',
    recommendedApproach: snap.retrieved
      ? 'Partire dal gap tra reputazione Google e chiarezza del sito, senza inventare prestazioni.'
      : 'Manca il testo del sito: analisi limitata ai dati Google.',
    evidence: [
      ...(input.google?.reviewCount
        ? [
            {
              label: 'Recensioni Google',
              source: 'google' as const,
              quote: `${input.google.reviewCount} recensioni`,
            },
          ]
        : []),
      ...(snap.title
        ? [{ label: 'Title sito', source: 'website' as const, quote: snap.title }]
        : []),
    ],
    humanReviewRequired: !snap.retrieved || hasInjectionAttempt(corpus),
  };
}

export function mockAnalyzeBusiness(input: BusinessAnalysisInput): BusinessOpportunity {
  const emailFit = classifyEmailFit(input.email);
  const ai = input.website?.opportunityScore ?? Math.round(input.discoveryScore ?? 50);
  const det = input.discoveryScore ?? null;
  const commercialPriority = Math.round(((det ?? ai) + ai) / 2);
  const reasons: string[] = [];
  if (input.reviewCount) reasons.push(`${input.reviewCount} recensioni Google`);
  if (input.rating) reasons.push(`rating Google ${input.rating}`);
  if (input.website?.ctaClarity === 'low') reasons.push('CTA poco evidente nel testo del sito');
  if (input.alreadyContacted) reasons.push('già contattato in passato');
  if (reasons.length === 0) reasons.push('Punteggio basato sui dati lead disponibili');
  return {
    deterministicScore: det,
    aiOpportunityScore: ai,
    commercialPriority,
    confidence: input.website ? 'high' : 'medium',
    reasons,
    recommendedOffer: input.website?.recommendedOffer ?? 'Restaurant Premium V3',
    recommendedApproach:
      input.website?.recommendedApproach ??
      'Usare i dati Google verificati e non inventare dettagli sul sito.',
    alreadyContacted: Boolean(input.alreadyContacted),
    factsUsed: [
      {
        label: 'Lead',
        source: 'lead',
        quote: `${input.name}${input.city ? `, ${input.city}` : ''}`,
      },
      {
        label: 'Email commerciale',
        source: 'lead',
        quote: emailFit.note,
      },
    ],
    humanReviewRequired: emailFit.fit === 'not_commercial',
  };
}

export function mockPersonalizeDemo(input: BusinessAnalysisInput): DemoPersonalization {
  const city = input.city ? ` a ${input.city}` : '';
  return {
    headline: input.name,
    subheadline: `Un’immagine online all’altezza di ${input.name}${city}`,
    description: input.reviewCount
      ? `${input.name} è un’attività con ${input.reviewCount} recensioni pubbliche. Questa anteprima mostra come potrebbe presentarsi il sito.`
      : `Anteprima dimostrativa per ${input.name}, costruita solo sui dati pubblici disponibili.`,
    ctaLabel: 'Prenota un tavolo',
    contentPriorities: ['hero', 'menu', 'prenotazione', 'recensioni'],
    tone: 'caldo e concreto',
    sectionEmphasis: ['prenotazione', 'galleria'],
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function mockDraftOutbound(input: OutboundWriterInput): OutboundDraft {
  const cityBit = input.city ? ` a ${input.city}` : '';
  const reviewBit =
    input.reviewCount && input.reviewCount > 0
      ? `Ho notato le ${input.reviewCount} recensioni pubbliche`
      : 'Ho visto i dati pubblici dell’attività';
  const demoBit = input.demoUrl
    ? `Puoi vedere un’anteprima qui: ${input.demoUrl}`
    : 'Posso mostrarti un’anteprima non appena è pronta.';
  const text = [
    `Buongiorno,`,
    `${reviewBit} di ${input.leadName}${cityBit}.`,
    `Ho preparato un’ipotesi di come potrebbe presentarsi online, senza impegno.`,
    demoBit,
    `Se è utile, mi dica se preferisce continuare via email.`,
    `Cordiali saluti,`,
    input.senderName,
  ].join('\n\n');
  const claims: OutboundDraft['claimsUsed'] = [
    {
      claim: `Nome attività ${input.leadName}`,
      source: 'lead',
      evidence: input.leadName,
    },
  ];
  if (input.city) {
    claims.push({ claim: `Città ${input.city}`, source: 'lead', evidence: input.city });
  }
  if (input.reviewCount) {
    claims.push({
      claim: `${input.reviewCount} recensioni`,
      source: 'google',
      evidence: `${input.reviewCount} recensioni`,
    });
  }
  if (input.demoUrl) {
    claims.push({ claim: 'Link anteprima', source: 'demo', evidence: input.demoUrl });
  }
  return {
    subject: `Un’idea per ${input.leadName}`,
    textBody: text,
    htmlBody: `<p>${escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`,
    confidence: 0.78,
    claimsUsed: claims,
    reasoningSummary: 'Copy ancorato solo a nome, città, recensioni e URL demo.',
    tone: 'professionale',
    recommendedCTA: 'Vedi l’anteprima',
  };
}

export function mockCritiqueOutbound(draft: OutboundDraft, facts: string[]): OutboundCritique {
  return criticDraft(draft, facts);
}

export function mockClassifyInbound(text: string): InboundClassification {
  const t = text.toLowerCase();
  if (/cancellami|non scrivermi|unsubscribe|stop\b|rimuovimi/.test(t)) {
    return {
      intent: 'unsubscribe',
      language: 'it',
      sentiment: 'negative',
      recommendedState: 'UNSUBSCRIBED',
      unsubscribe: true,
      notInterested: false,
      pricing: false,
      discountAsk: false,
      legal: false,
      angry: false,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.96,
      summary: 'Richiesta esplicita di non essere più contattato',
      servicesRequested: [],
    };
  }
  if (/non mi interessa|non siamo interessati/.test(t)) {
    return {
      intent: 'not_interested',
      language: 'it',
      sentiment: 'negative',
      recommendedState: 'NOT_INTERESTED',
      unsubscribe: false,
      notInterested: true,
      pricing: false,
      discountAsk: false,
      legal: false,
      angry: false,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.93,
      summary: 'Rifiuto commerciale esplicito',
      servicesRequested: [],
    };
  }
  if (/sconto|350\s*euro|me lo fai a/.test(t)) {
    return {
      intent: 'discount_request',
      language: 'it',
      sentiment: 'neutral',
      recommendedState: 'HUMAN_REQUIRED',
      unsubscribe: false,
      notInterested: false,
      pricing: true,
      discountAsk: true,
      legal: false,
      angry: false,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.9,
      summary: 'Richiesta di sconto/prezzo negoziato',
      servicesRequested: [],
    };
  }
  if (/quanto costa|prezzo|preventivo/.test(t)) {
    return {
      intent: 'quote_request',
      language: 'it',
      sentiment: 'neutral',
      recommendedState: 'PRICING',
      unsubscribe: false,
      notInterested: false,
      pricing: true,
      discountAsk: false,
      legal: false,
      angry: false,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.88,
      summary: 'Domanda di prezzo',
      servicesRequested: [],
    };
  }
  if (/tra un mese|più avanti|tra \d+ (giorni|settimane|mesi)/.test(t)) {
    return {
      intent: 'follow_up_later',
      language: 'it',
      sentiment: 'neutral',
      recommendedState: 'FOLLOW_UP_LATER',
      unsubscribe: false,
      notInterested: false,
      pricing: false,
      discountAsk: false,
      legal: false,
      angry: false,
      followUpLater: true,
      followUpAt: null,
      confidence: 0.86,
      summary: 'Richiesta di ricontatto successivo',
      servicesRequested: [],
    };
  }
  if (/privacy|gdpr|legale|contratto/.test(t)) {
    return {
      intent: 'legal_privacy',
      language: 'it',
      sentiment: 'neutral',
      recommendedState: 'HUMAN_REQUIRED',
      unsubscribe: false,
      notInterested: false,
      pricing: false,
      discountAsk: false,
      legal: true,
      angry: false,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.84,
      summary: 'Tema legale/privacy',
      servicesRequested: [],
    };
  }
  if (/inaccettabile|truffa|arrabbi|maleducat/.test(t)) {
    return {
      intent: 'angry',
      language: 'it',
      sentiment: 'negative',
      recommendedState: 'HUMAN_REQUIRED',
      unsubscribe: false,
      notInterested: false,
      pricing: false,
      discountAsk: false,
      legal: false,
      angry: true,
      followUpLater: false,
      followUpAt: null,
      confidence: 0.8,
      summary: 'Tono ostile',
      servicesRequested: [],
    };
  }
  const services: string[] = [];
  if (/whatsapp/.test(t)) services.push('WhatsApp');
  if (/prenotaz/.test(t)) services.push('prenotazioni');
  return {
    intent: services.length ? 'custom_request' : 'info_request',
    language: 'it',
    sentiment: 'positive',
    recommendedState: services.length ? 'QUALIFYING' : 'ENGAGED',
    unsubscribe: false,
    notInterested: false,
    pricing: false,
    discountAsk: false,
    legal: false,
    angry: false,
    followUpLater: false,
    followUpAt: null,
    confidence: 0.7,
    summary: services.length ? `Richiesta servizi: ${services.join(', ')}` : 'Richiesta informazioni',
    servicesRequested: services,
  };
}

export function mockDraftReply(input: {
  classification: InboundClassification;
  playbookName: string;
  pricingAllowed: boolean;
  priceRange?: string | null;
  bookingUrl?: string | null;
  allowedFeatures: string[];
}): SalesReplyDraft {
  if (input.classification.unsubscribe || input.classification.notInterested) {
    return {
      text: 'Richiesta gestita in modo deterministico. Nessuna risposta commerciale automatica.',
      claimsUsed: [],
      recommendedState: input.classification.recommendedState,
      nextStep: 'stop',
      confidence: 1,
      humanRequiredReason: null,
    };
  }
  if (input.classification.discountAsk) {
    return {
      text: 'Grazie per il messaggio. Per una proposta su misura la passo al titolare, che le risponderà a breve.',
      claimsUsed: [],
      recommendedState: 'HUMAN_REQUIRED',
      nextStep: 'handoff_pricing',
      confidence: 0.85,
      humanRequiredReason: 'Negotiation / pricing',
    };
  }
  if (input.classification.pricing) {
    if (!input.pricingAllowed) {
      return {
        text: 'Grazie. Il prezzo dipende da cosa serve davvero al locale: le faccio due domande e poi le preparo una proposta precisa.',
        claimsUsed: [],
        recommendedState: 'PRICING',
        nextStep: 'qualify_then_handoff',
        confidence: 0.8,
        humanRequiredReason: 'Prezzo non autorizzato in playbook',
      };
    }
    return {
      text: `Il lavoro si colloca nella fascia ${input.priceRange}. Se vuole, le mostro cosa è incluso.`,
      claimsUsed: [
        {
          claim: 'Fascia di prezzo playbook',
          source: 'playbook',
          evidence: input.priceRange ?? '',
        },
      ],
      recommendedState: 'PRICING',
      nextStep: 'confirm_interest',
      confidence: 0.74,
      humanRequiredReason: null,
    };
  }
  const extra = input.classification.servicesRequested.filter((s) =>
    input.allowedFeatures.some((f) => f.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(f.toLowerCase())),
  );
  const denied = input.classification.servicesRequested.filter((s) => !extra.includes(s));
  const lines = ['Grazie per il messaggio.'];
  if (extra.length) lines.push(`Posso includere: ${extra.join(', ')}.`);
  if (denied.length) lines.push(`Per ${denied.join(', ')} verifico prima se rientra nell’offerta.`);
  if (input.bookingUrl) lines.push(`Se preferisce una chiamata breve: ${input.bookingUrl}`);
  lines.push(`Cordiali saluti,\n${input.playbookName}`);
  return {
    text: lines.join('\n\n'),
    claimsUsed: [],
    recommendedState: input.classification.recommendedState,
    nextStep: extra.length ? 'confirm_scope' : 'qualify',
    confidence: 0.76,
    humanRequiredReason: denied.length ? 'Richiesta custom' : null,
  };
}
