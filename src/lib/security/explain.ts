import type { SurfaceFinding } from './surface-audit';

export type FindingExplain = {
  meaning: string;
  risk: string;
};

const EXPLAIN: Record<string, FindingExplain> = {
  NO_HTTPS: {
    meaning: 'La pagina si apre senza lucchetto. Nome e telefono del modulo viaggiano in chiaro.',
    risk: 'un cliente che prenota dal Wi-Fi può farsi leggere nome e telefono. Perde fiducia e può non tornare.',
  },
  BAD_CERT: {
    meaning: 'Il browser non accetta il lucchetto e mostra un avviso.',
    risk: 'il cliente vede l’avviso, chiude e prenota altrove. Visite e chiamate dal sito si perdono.',
  },
  CARD_FORM_OWN: {
    meaning: 'I numeri della carta li scrive sul vostro sito, non sul pagamento della banca.',
    risk: 'se quei numeri escono, il danno è vostro: contestazioni, banca e clienti che non pagano più online.',
  },
  NO_HSTS: {
    meaning: 'Oggi c’è il lucchetto, ma il browser può ancora aprire la versione senza.',
    risk: 'qualcuno può mandare il cliente sulla copia senza lucchetto e leggere nome e telefono.',
  },
  NO_CSP: {
    meaning: 'Il sito non dice al browser quali pulsanti e testi sono i vostri.',
    risk: 'un pulsante falso «Prenota qui» può portare i clienti altrove o a lasciare i dati a un altro.',
  },
  CSP_REPORT_ONLY: {
    meaning: 'La regola c’è, ma non blocca: registra soltanto.',
    risk: 'un pulsante o un testo estraneo resta visibile. I clienti lo usano come se fosse vostro.',
  },
  NO_FRAME_PROTECTION: {
    meaning: 'La vostra pagina può comparire dentro il sito di un altro.',
    risk: 'il cliente crede di prenotare da voi e lascia nome e telefono a qualcun altro.',
  },
  NO_NOSNIFF: {
    meaning: 'Il browser può trattare un file come se fosse un altro tipo.',
    risk: 'resta più facile far passare un file che il cliente non si aspetta. Da sola è una regola di igiene.',
  },
  EMAILS_VISIBLE: {
    meaning: 'L’email è in pagina, visibile a tutti. Non significa che la casella sia stata aperta.',
    risk: 'arriva più pubblicità. Non è un furto: è un recapito pubblico, e lo salviamo sul contatto.',
  },
  OLD_COPYRIGHT: {
    meaning: 'In fondo c’è un anno vecchio.',
    risk: 'il passante pensa che il sito sia fermo e va dal concorrente, anche se voi lavorate ogni giorno.',
  },
  FORM_TO_HTTP: {
    meaning: 'Il modulo manda i dati verso una pagina senza lucchetto.',
    risk: 'la prenotazione può essere letta in rete. Il cliente se ne accorge e non completa.',
  },
  MIXED_CONTENT: {
    meaning: 'La pagina ha il lucchetto, ma carica pezzi senza.',
    risk: 'il menù o un pulsante spariscono, oppure il browser avvisa. Il cliente se ne va.',
  },
  COOKIE_INSECURE: {
    meaning: 'Il sito lascia un ricordo sul telefono senza dire «solo con lucchetto».',
    risk: 'su un Wi-Fi aperto quel ricordo può viaggiare in chiaro. Un altro può farsi passare per il cliente.',
  },
  VISIBLE_SECRET: {
    meaning: 'Nel codice della pagina c’è una chiave che di solito sta solo sul server.',
    risk: 'altri possono usarla come se fosse vostra: costi, accessi, servizi bloccati.',
  },
  VISIBLE_MAPS_KEY: {
    meaning: 'La chiave Google Maps è scritta in pagina.',
    risk: 'altri possono usarla. Il conto delle mappe sale e le mappe possono smettere di funzionare.',
  },
  ADMIN_LINK: {
    meaning: 'In homepage si vede il link per entrare nell’area riservata. Non l’abbiamo aperta.',
    risk: 'chiunque vede dove si entra. È il primo posto che provano se password e accesso sono deboli.',
  },
  LOGIN_FORM: {
    meaning: 'Sulla pagina pubblica c’è già il campo della password.',
    risk: 'è più facile tentare l’accesso. Non significa che siano già dentro.',
  },
  FILE_UPLOAD: {
    meaning: 'Dalla pagina pubblica si può mandare un file.',
    risk: 'potete ricevere di tutto. Foto e documenti dei clienti restano da voi.',
  },
  SERVER_BANNER: {
    meaning: 'Il server si presenta con nome e versione.',
    risk: 'chi guarda sa quale programma usate e cerca i punti deboli noti. Da solo non apre nulla.',
  },
  GENERATOR_VERSION: {
    meaning: 'Il sito scrive con quale programma è fatto, e spesso la versione.',
    risk: 'se quella versione è vecchia restano buchi già noti. Da qui si vede solo il nome.',
  },
  SOURCEMAP: {
    meaning: 'C’è una mappa del codice, usata di solito da chi sviluppa.',
    risk: 'un tecnico vede più dettagli del sito. Per il cliente in vetrina non cambia, per voi sì.',
  },
  PHONES_VISIBLE: {
    meaning: 'Il numero è in pagina, visibile a tutti.',
    risk: 'arrivano anche chiamate di chi vende. Non è un furto della linea.',
  },
};

export function explainFinding(code: string): FindingExplain {
  return (
    EXPLAIN[code] ?? {
      meaning: 'È una cosa visibile aprendo la pagina, non una prova che qualcuno sia già entrato.',
      risk: 'restate senza sapere cosa vede un cliente da fuori.',
    }
  );
}

/** Una sola riga, senza ripetere «Se non sistemi». */
export function riskIfUnfixed(risk: string): string {
  const consequence = risk.replace(/^se non sistemi[:,]?\s*/i, '').trim();
  return `Se non sistemi: ${consequence}`;
}

export function withExplanation<T extends Pick<SurfaceFinding, 'code'>>(
  finding: T,
): T & FindingExplain {
  return { ...finding, ...explainFinding(finding.code) };
}

export const DEEP_CHECK_STEPS = [
  'Guardate insieme il report e, per ogni voce, cosa rischia se non sistema.',
  'Chiedete al titolare cosa gli interessa: prenotazioni, pagamenti, recapiti, accesso al sito.',
  'Se vi dà accesso (hosting, dominio, pannello), usate solo quello che indica lui e fermatevi se lo chiede.',
  'Annotate cosa avete visto insieme e cosa farete. Attila non prova ingressi e non parte da solo.',
] as const;
