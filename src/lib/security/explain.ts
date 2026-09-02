import type { SurfaceFinding } from './surface-audit';
import { findingsByCategory } from './surface-audit';

export type FindingExplain = {
  meaning: string;
  risk: string;
  /** Per le sole informazioni: cosa non significa. */
  limit?: string;
  remediation?: string;
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
  HOMEPAGE_ERROR: {
    meaning: 'La homepage non ha restituito una pagina normale.',
    risk: 'il visitatore non vede il sito e va altrove. Da fuori non si può giudicare il resto.',
  },
  CARD_FORM_OWN: {
    meaning:
      'Il campo del numero carta compare direttamente nella pagina. Non possiamo considerarlo isolato solo perché è caricato anche un fornitore di pagamento.',
    risk: 'se quei numeri escono, il danno è vostro: contestazioni, banca e clienti che non pagano più online.',
    remediation:
      'Sostituire il campo carta nel DOM con il checkout ospitato o i campi isolati del fornitore di pagamento. Verificare che numero completo e codice di sicurezza non arrivino mai al server, ai log o alle email del sito.',
  },
  NO_HSTS: {
    meaning: 'Oggi c’è il lucchetto, ma il browser può ancora aprire la versione senza.',
    risk: 'qualcuno può mandare il cliente sulla copia senza lucchetto e leggere nome e telefono.',
  },
  HSTS_WEAK: {
    meaning: 'La regola che tiene il lucchetto c’è, ma dura poco.',
    risk: 'alla scadenza il browser può di nuovo provare la versione senza lucchetto.',
  },
  NO_CSP: {
    meaning: 'Il sito non dice al browser quali pulsanti e testi sono i vostri.',
    risk: 'un pulsante falso «Prenota qui» può portare i clienti altrove o a lasciare i dati a un altro.',
  },
  CSP_WEAK: {
    meaning: 'La regola CSP c’è, ma è troppo larga.',
    risk: 'script o contenuti non previsti possono comunque passare. La protezione resta debole.',
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
  NO_REFERRER_POLICY: {
    meaning: 'Manca la regola su cosa il browser manda come indirizzo di partenza.',
    risk: 'un altro sito può ricevere più dettagli del percorso da cui arriva il cliente.',
  },
  NO_PERMISSIONS_POLICY: {
    meaning: 'Manca Permissions-Policy.',
    risk: 'funzioni del browser come fotocamera o posizione non sono limitate a priori.',
  },
  EMAILS_VISIBLE: {
    meaning: 'L’email è in pagina, visibile a tutti. Non significa che la casella sia stata aperta.',
    risk: 'arriva più pubblicità. Non è un furto: è un recapito pubblico, e lo salviamo sul contatto.',
    limit: 'Non abbassa il punteggio. Serve ai clienti e anche a chi manda spam.',
  },
  OLD_COPYRIGHT: {
    meaning: 'In fondo c’è un anno vecchio.',
    risk: 'il passante può pensare che il sito sia fermo, anche se voi lavorate ogni giorno.',
    limit: 'Da sola non prova falle tecniche.',
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
  COOKIE_NO_HTTPONLY: {
    meaning: 'Un cookie che sembra di sessione è leggibile dagli script della pagina.',
    risk: 'se entra codice estraneo, può leggere quel ricordo di sessione.',
  },
  COOKIE_NO_SAMESITE: {
    meaning: 'Un cookie che sembra di sessione non indica SameSite.',
    risk: 'il browser ha meno istruzioni per evitare di inviarlo quando la richiesta parte da un altro sito.',
  },
  VISIBLE_SECRET: {
    meaning: 'Nel codice della pagina c’è una chiave che di solito sta solo sul server.',
    risk: 'altri possono usarla come se fosse vostra: costi, accessi, servizi bloccati.',
  },
  VISIBLE_MAPS_KEY: {
    meaning: 'La chiave Google Maps è scritta in pagina.',
    risk: 'altri possono usarla. Il conto delle mappe sale e le mappe possono smettere di funzionare.',
    limit: 'Dipende dai limiti impostati su Google. Non è di per sé un furto.',
  },
  ADMIN_LINK: {
    meaning: 'In homepage si vede il link per entrare nell’area riservata. Non l’abbiamo aperta.',
    risk: 'chiunque vede dove si entra. È il primo posto che provano se password e accesso sono deboli.',
    limit: 'Non prova che siano già dentro né che la password sia debole.',
  },
  WP_PINGBACK: {
    meaning: 'WordPress dichiara xmlrpc.php, di solito per i pingback.',
    risk: 'da sola non apre nulla. È un’etichetta pubblica del programma.',
    limit: 'Non è il pannello admin e non abbiamo chiamato quel file.',
  },
  LOGIN_FORM: {
    meaning: 'Sulla pagina pubblica c’è già il campo della password.',
    risk: 'è più facile tentare l’accesso. Non significa che siano già dentro.',
    limit: 'Può essere l’area clienti. Non prova un ingresso riuscito.',
  },
  FILE_UPLOAD: {
    meaning: 'Dalla pagina pubblica si può mandare un file.',
    risk: 'potete ricevere di tutto. Foto e documenti dei clienti restano da voi.',
    limit: 'Non prova dove finisce il file sul server.',
  },
  SERVER_BANNER: {
    meaning: 'Il server si presenta con nome e versione.',
    risk: 'chi guarda sa quale programma usate e cerca i punti deboli noti. Da solo non apre nulla.',
    limit: 'È solo un’etichetta. Non prova un buco aperto.',
  },
  GENERATOR_VERSION: {
    meaning: 'Il sito scrive con quale programma è fatto, e spesso la versione.',
    risk: 'se quella versione è vecchia restano buchi già noti. Da qui si vede solo il nome.',
    limit: 'Non abbiamo verificato se gli aggiornamenti sono installati.',
  },
  SOURCEMAP: {
    meaning: 'C’è una mappa del codice, usata di solito da chi sviluppa.',
    risk: 'un tecnico vede più dettagli del sito. Per il cliente in vetrina non cambia, per voi sì.',
  },
  PHONES_VISIBLE: {
    meaning: 'Il numero è in pagina, visibile a tutti.',
    risk: 'arrivano anche chiamate di chi vende. Non è un furto della linea.',
    limit: 'Non abbassa il punteggio. Contiamo solo numeri visibili o link tel:.',
  },
  HTML_TRUNCATED: {
    meaning: 'La pagina è molto lunga: ho letto solo la parte iniziale.',
    risk: 'qualche dettaglio in fondo può non comparire in questo report.',
    limit: 'Non è un problema di sicurezza: è un limite di lettura.',
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

export function categorizeFindings(findings: SurfaceFinding[]) {
  return findingsByCategory(findings);
}

export const DEEP_CHECK_STEPS = [
  'Il consenso registrato autorizza il secondo controllo sul sito indicato.',
  'Attila legge più pagine pubbliche collegate e confronta i risultati con la homepage.',
  'Non invia moduli, non prova password, non modifica dati e non esegue test di carico.',
  'Le voci non riprodotte non sono dichiarate risolte: richiedono una verifica umana.',
] as const;
