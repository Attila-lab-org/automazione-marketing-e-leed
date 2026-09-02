import type { SurfaceFinding } from './surface-audit';

export type FindingExplain = {
  meaning: string;
  example: string;
};

const EXPLAIN: Record<string, FindingExplain> = {
  NO_HTTPS: {
    meaning:
      'La pagina non ha il lucchetto. Nome, telefono e messaggi del modulo possono essere letti da chi è sulla stessa rete.',
    example:
      'Un cliente compila «Contatti» dal Wi-Fi dell’hotel o del locale. Un’altra persona su quella rete può vedere cosa ha scritto.',
  },
  BAD_CERT: {
    meaning:
      'Il lucchetto c’è, ma il browser non si fida. Il visitatore vede un avviso e può andarsene, o entrare lo stesso senza capire se è davvero il vostro sito.',
    example:
      'È come un negozio con la targa stortata: la porta si apre, però il cliente dubita di essere nel posto giusto e qualcuno può fingere di essere voi.',
  },
  CARD_FORM_OWN: {
    meaning:
      'I numeri della carta li scrive sul vostro sito, non su un pagamento della banca (Stripe, PayPal, Satispay). Se il sito è fatto male, quei numeri restano da voi.',
    example:
      'È come far scrivere il numero della carta su un foglio in cassa, invece di far passare la carta solo sul POS. Quel foglio, se finisce in mani sbagliate, è un problema vostro.',
  },
  NO_HSTS: {
    meaning:
      'Oggi il lucchetto c’è, ma il browser non è obbligato a usarlo la volta dopo. Può ancora provare la versione senza lucchetto.',
    example:
      'È come avere la porta blindata e lasciare accanto la vecchia porta di legno. Un truffatore può spingere il cliente verso quella più debole.',
  },
  NO_CSP: {
    meaning:
      'Il sito non dà al browser una lista di chi può mettere testi e pulsanti. Se qualcuno riesce a infilare un pezzo suo, il visitatore lo vede come se fosse vostro.',
    example:
      'È come un negozio senza cartello «chi può stare dietro al bancone». Un cartello falso «Prenota qui» può sembrare vostro e portare i clienti altrove.',
  },
  CSP_REPORT_ONLY: {
    meaning:
      'La regola sugli script c’è, ma serve solo a prendere nota. Il browser non blocca niente.',
    example:
      'È come una telecamera che registra ma non chiude la porta. Utile per capire, non ferma chi entra.',
  },
  NO_FRAME_PROTECTION: {
    meaning:
      'La vostra pagina può essere messa dentro il sito di un altro. Il visitatore crede di essere da voi.',
    example:
      'È come mettere la vostra vetrina nel locale di qualcun altro. Il cliente lascia nome e telefono pensando di prenotare da voi, e invece sta scrivendo a un altro.',
  },
  NO_NOSNIFF: {
    meaning:
      'Il browser può trattare un file come se fosse un altro tipo. Di solito è una regola di igiene, non una prova di furti.',
    example:
      'È come un pacco etichettato «documenti» con dentro altro. Il computer a volte si fida dell’etichetta sbagliata.',
  },
  EMAILS_VISIBLE: {
    meaning:
      'L’email è scritta in pagina, visibile a tutti. Non significa che la casella sia stata violata.',
    example:
      'È come l’indirizzo sul campanello: serve ai clienti, ma anche a chi manda pubblicità. Per questo la salviamo sul contatto, così potete scrivere o chiamare.',
  },
  OLD_COPYRIGHT: {
    meaning:
      'In fondo alla pagina c’è un anno vecchio. Non è una prova di furto: fa solo capire che il sito forse non viene seguito.',
    example:
      'Un passante vede «© 2018» e pensa che il sito non sia aggiornato, anche se il locale lavora ogni giorno.',
  },
  FORM_TO_HTTP: {
    meaning:
      'Il modulo manda nome e telefono verso una pagina senza lucchetto. Quei dati possono essere letti in rete.',
    example:
      'Il cliente prenota dal telefono. I dati della prenotazione partono senza lucchetto e possono essere visti sulla stessa rete Wi-Fi.',
  },
  MIXED_CONTENT: {
    meaning:
      'La pagina ha il lucchetto, ma carica immagini o script senza. Il browser può avvisare o bloccare pezzi del sito.',
    example:
      'Il cliente apre il sito e il menù o un pulsante non arrivano, oppure il browser dice che la pagina non è del tutto sicura.',
  },
  COOKIE_INSECURE: {
    meaning:
      'Il sito lascia un piccolo file sul telefono del cliente senza dire «solo con lucchetto». Su una rete aperta quel file può viaggiare in chiaro.',
    example:
      'Se il sito ricorda «sei già entrato», quel ricordo può passare senza lucchetto sul Wi-Fi di un hotel.',
  },
  VISIBLE_SECRET: {
    meaning:
      'Nel codice della pagina pubblica c’è una chiave che di solito sta solo sul server. Chi copia il codice la vede.',
    example:
      'Un concorrente o uno script può copiare quella chiave e usarla come se fosse vostra, finché non la cambiate.',
  },
  VISIBLE_MAPS_KEY: {
    meaning:
      'La chiave di Google Maps è scritta in pagina. È visibile a chi apre il codice, come su tanti siti.',
    example:
      'Da questa pagina si vede solo che la chiave c’è. Non abbiamo aperto il pannello Google per vedere i limiti.',
  },
  ADMIN_LINK: {
    meaning:
      'Dalla homepage si vede l’indirizzo per entrare nell’area riservata. Non abbiamo aperto quella pagina.',
    example:
      'Un cliente o un estraneo vede il link «accedi» in homepage. Qui segnaliamo solo che è visibile, non che qualcuno sia entrato.',
  },
  LOGIN_FORM: {
    meaning:
      'Sulla pagina pubblica c’è già il campo della password. I clienti o il titolare possono accedere da lì.',
    example:
      'Se quel modulo è in homepage, resta visibile a tutti. Non significa che qualcuno sia già entrato.',
  },
  FILE_UPLOAD: {
    meaning:
      'Dalla pagina pubblica si può mandare un file (curriculum, foto, documento).',
    example:
      'Un cliente carica una foto per un preventivo. Quel file arriva sul vostro sito: va capito dove finisce.',
  },
  SERVER_BANNER: {
    meaning:
      'Il server si presenta con nome e numero di versione. È un’etichetta, non un ingresso.',
    example:
      'Chi guarda le risposte del sito legge «Apache 2.4.41». Sa quale programma usate, niente di più da questa pagina.',
  },
  GENERATOR_VERSION: {
    meaning:
      'Il sito scrive da solo con quale programma è stato fatto, e spesso anche la versione.',
    example:
      'In pagina si legge «WordPress 6.4». Serve a capire lo strumento, non a dire che è già stato bucato.',
  },
  SOURCEMAP: {
    meaning:
      'C’è un riferimento a una mappa del codice, usata di solito da chi sviluppa.',
    example:
      'Un tecnico può leggere più dettagli del sito. Per il cliente non cambia nulla in vetrina.',
  },
  PHONES_VISIBLE: {
    meaning:
      'Il numero è in pagina, visibile a tutti. Non significa che la linea sia stata violata.',
    example:
      'Serve ai clienti per chiamare, e anche a chi raccoglie numeri per pubblicità. Lo vediamo e lo possiamo usare per contattarvi.',
  },
};

export function explainFinding(code: string): FindingExplain {
  return (
    EXPLAIN[code] ?? {
      meaning: 'È una cosa visibile aprendo la pagina, non una prova che qualcuno sia già entrato.',
      example:
        'Va spiegata al titolare con parole semplici: cosa si vede da fuori e cosa può succedere a un cliente, senza allarmismi.',
    }
  );
}

export function withExplanation<T extends Pick<SurfaceFinding, 'code'>>(
  finding: T,
): T & FindingExplain {
  return { ...finding, ...explainFinding(finding.code) };
}

export const DEEP_CHECK_STEPS = [
  'Guardate insieme il report della pagina pubblica e le spiegazioni qui sotto.',
  'Chiedete al titolare cosa gli interessa: prenotazioni, pagamenti, recapiti, accesso al sito.',
  'Se vi dà accesso (hosting, dominio, pannello), usate solo quello che indica lui e fermatevi se lo chiede.',
  'Annotate cosa avete visto insieme e cosa farete. Attila non prova ingressi e non parte da solo.',
] as const;
