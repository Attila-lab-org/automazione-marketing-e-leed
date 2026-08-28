export type ResponseMode = 'DRAFT_ONLY' | 'APPROVAL_REQUIRED' | 'AUTO_ALLOWED' | 'HUMAN_ONLY';

export type CommercialPlaybook = {
  version: number;
  brand: {
    name: string;
    signature: string;
    tone: string;
    language: string;
    presentation: string;
  };
  offer: {
    key: string;
    description: string;
    allowedFeatures: string[];
  };
  pricing: {
    mode: 'fixed' | 'range' | 'hidden';
    aiMayCommunicate: boolean;
    min: number | null;
    max: number | null;
    currency: 'EUR';
  };
  discount: {
    allowed: boolean;
    maxAutomatic: number | null;
    defaultMode: 'HUMAN_ONLY';
  };
  qualification: {
    questions: string[];
    requiredSignals: string[];
    disqualifiers: string[];
  };
  call: {
    proposeWhen: string;
    bookingUrl: string | null;
    durationMinutes: number;
  };
  /**
   * Percorso consulenziale non aggressivo:
   * capire bisogno → valorizzare proposta → chiamata solo dopo interesse esplicito.
   */
  conversation: {
    strategy: 'consultative';
    maxQuestionsPerTurn: 1;
    proposeCallOnlyAfterExplicitInterest: boolean;
    path: Array<'understand_need' | 'value_offer' | 'propose_call'>;
  };
  promisePolicy: {
    neverPromise: string[];
  };
  humanEscalation: {
    price: boolean;
    discount: boolean;
    contracts: boolean;
    legalPrivacy: boolean;
    angry: boolean;
    highComplexity: boolean;
    lowConfidence: boolean;
    highValue: boolean;
  };
  autonomy: {
    defaultMode: ResponseMode;
    firstReplyMode: ResponseMode;
    simpleFaqMode: ResponseMode;
  };
};

export const DEFAULT_PLAYBOOK: CommercialPlaybook = {
  version: 1,
  brand: {
    name: 'Attila Lab',
    signature: 'Attila',
    tone: 'professionale, concreto, italiano',
    language: 'it',
    presentation: 'studio che propone un’anteprima di sito, senza impegno',
  },
  offer: {
    key: 'website_upgrade',
    description: 'Sito professionale per attività locali, da 350 €, con consegna della proposta base in 24 ore',
    allowedFeatures: [
      'sito vetrina',
      'prenotazioni online',
      'galleria',
      'menu visibile',
      'contatti chiari',
      'consegna della proposta base in 24 ore',
    ],
  },
  pricing: {
    mode: 'range',
    aiMayCommunicate: true,
    min: 350,
    max: 1000,
    currency: 'EUR',
  },
  discount: {
    allowed: false,
    maxAutomatic: null,
    defaultMode: 'HUMAN_ONLY',
  },
  qualification: {
    questions: [
      'Avete già un sito aggiornato?',
      'Vi serve soprattutto visibilità o prenotazioni?',
      'Chi decide sull’investimento?',
    ],
    requiredSignals: ['interesse', 'canale di contatto'],
    disqualifiers: ['richiesta illegale', 'fuori settore'],
  },
  call: {
    proposeWhen:
      'Solo dopo interesse esplicito del cliente (vuole capire meglio, chiede dettagli concreti, o accetta una chiamata). Mai nelle prime risposte solo perché ci sono slot liberi.',
    bookingUrl: null,
    durationMinutes: 20,
  },
  conversation: {
    strategy: 'consultative',
    maxQuestionsPerTurn: 1,
    proposeCallOnlyAfterExplicitInterest: true,
    path: ['understand_need', 'value_offer', 'propose_call'],
  },
  promisePolicy: {
    neverPromise: [
      'posizionamento garantito',
      'numero di clienti',
      'tempi diversi dalle 24 ore della proposta base senza conferma',
      'sconti non autorizzati',
      'funzionalità non in offerta',
    ],
  },
  humanEscalation: {
    price: false,
    discount: true,
    contracts: true,
    legalPrivacy: true,
    angry: true,
    highComplexity: true,
    lowConfidence: true,
    highValue: true,
  },
  autonomy: {
    defaultMode: 'APPROVAL_REQUIRED',
    firstReplyMode: 'APPROVAL_REQUIRED',
    simpleFaqMode: 'APPROVAL_REQUIRED',
  },
};

export function mergePlaybook(raw: unknown): CommercialPlaybook {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const brand = rec.brand && typeof rec.brand === 'object' ? (rec.brand as Record<string, unknown>) : {};
  const offer = rec.offer && typeof rec.offer === 'object' ? (rec.offer as Record<string, unknown>) : {};
  const pricing = rec.pricing && typeof rec.pricing === 'object' ? (rec.pricing as Record<string, unknown>) : {};
  const discount = rec.discount && typeof rec.discount === 'object' ? (rec.discount as Record<string, unknown>) : {};
  const qualification =
    rec.qualification && typeof rec.qualification === 'object'
      ? (rec.qualification as Record<string, unknown>)
      : {};
  const call = rec.call && typeof rec.call === 'object' ? (rec.call as Record<string, unknown>) : {};
  const conversation =
    rec.conversation && typeof rec.conversation === 'object'
      ? (rec.conversation as Record<string, unknown>)
      : {};
  const promise =
    rec.promisePolicy && typeof rec.promisePolicy === 'object'
      ? (rec.promisePolicy as Record<string, unknown>)
      : {};
  const human =
    rec.humanEscalation && typeof rec.humanEscalation === 'object'
      ? (rec.humanEscalation as Record<string, unknown>)
      : {};
  const autonomy =
    rec.autonomy && typeof rec.autonomy === 'object' ? (rec.autonomy as Record<string, unknown>) : {};

  const str = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback);
  const num = (value: unknown, fallback: number | null) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  const list = (value: unknown, fallback: string[]) =>
    Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : fallback;
  const mode = (value: unknown, fallback: ResponseMode): ResponseMode => {
    if (
      value === 'DRAFT_ONLY' ||
      value === 'APPROVAL_REQUIRED' ||
      value === 'AUTO_ALLOWED' ||
      value === 'HUMAN_ONLY'
    ) {
      return value;
    }
    return fallback;
  };

  return {
    version: typeof rec.version === 'number' ? rec.version : DEFAULT_PLAYBOOK.version,
    brand: {
      name: str(brand.name, DEFAULT_PLAYBOOK.brand.name),
      signature: str(brand.signature, DEFAULT_PLAYBOOK.brand.signature),
      tone: str(brand.tone, DEFAULT_PLAYBOOK.brand.tone),
      language: str(brand.language, DEFAULT_PLAYBOOK.brand.language),
      presentation: str(brand.presentation, DEFAULT_PLAYBOOK.brand.presentation),
    },
    offer: {
      key: str(offer.key, DEFAULT_PLAYBOOK.offer.key),
      description: str(offer.description, DEFAULT_PLAYBOOK.offer.description),
      allowedFeatures: list(offer.allowedFeatures, DEFAULT_PLAYBOOK.offer.allowedFeatures),
    },
    pricing: {
      mode:
        pricing.mode === 'fixed' || pricing.mode === 'range' || pricing.mode === 'hidden'
          ? pricing.mode
          : DEFAULT_PLAYBOOK.pricing.mode,
      aiMayCommunicate: bool(
        pricing.aiMayCommunicate,
        DEFAULT_PLAYBOOK.pricing.aiMayCommunicate,
      ),
      min: num(pricing.min, DEFAULT_PLAYBOOK.pricing.min),
      max: num(pricing.max, DEFAULT_PLAYBOOK.pricing.max),
      currency: 'EUR',
    },
    discount: {
      allowed: bool(discount.allowed, false),
      maxAutomatic: num(discount.maxAutomatic, null),
      defaultMode: 'HUMAN_ONLY',
    },
    qualification: {
      questions: list(qualification.questions, DEFAULT_PLAYBOOK.qualification.questions),
      requiredSignals: list(qualification.requiredSignals, DEFAULT_PLAYBOOK.qualification.requiredSignals),
      disqualifiers: list(qualification.disqualifiers, DEFAULT_PLAYBOOK.qualification.disqualifiers),
    },
    call: {
      proposeWhen: str(call.proposeWhen, DEFAULT_PLAYBOOK.call.proposeWhen),
      bookingUrl: typeof call.bookingUrl === 'string' && call.bookingUrl.trim() ? call.bookingUrl.trim() : null,
      durationMinutes: typeof call.durationMinutes === 'number' ? call.durationMinutes : 20,
    },
    conversation: {
      strategy: 'consultative',
      maxQuestionsPerTurn: 1,
      proposeCallOnlyAfterExplicitInterest: bool(
        conversation.proposeCallOnlyAfterExplicitInterest,
        DEFAULT_PLAYBOOK.conversation.proposeCallOnlyAfterExplicitInterest,
      ),
      path: Array.isArray(conversation.path)
        ? (conversation.path.filter(
            (step): step is 'understand_need' | 'value_offer' | 'propose_call' =>
              step === 'understand_need' || step === 'value_offer' || step === 'propose_call',
          ) as Array<'understand_need' | 'value_offer' | 'propose_call'>)
        : DEFAULT_PLAYBOOK.conversation.path,
    },
    promisePolicy: {
      neverPromise: list(promise.neverPromise, DEFAULT_PLAYBOOK.promisePolicy.neverPromise),
    },
    humanEscalation: {
      price: bool(human.price, DEFAULT_PLAYBOOK.humanEscalation.price),
      discount: bool(human.discount, true),
      contracts: bool(human.contracts, true),
      legalPrivacy: bool(human.legalPrivacy, true),
      angry: bool(human.angry, true),
      highComplexity: bool(human.highComplexity, true),
      lowConfidence: bool(human.lowConfidence, true),
      highValue: bool(human.highValue, true),
    },
    autonomy: {
      defaultMode: mode(autonomy.defaultMode, 'APPROVAL_REQUIRED'),
      firstReplyMode: mode(autonomy.firstReplyMode, 'APPROVAL_REQUIRED'),
      simpleFaqMode: mode(autonomy.simpleFaqMode, 'APPROVAL_REQUIRED'),
    },
  };
}
