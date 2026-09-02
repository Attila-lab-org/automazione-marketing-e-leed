import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Informazioni su dati e demo · Atti-Lab',
  description: 'Come Atti-Lab usa informazioni professionali pubbliche e gestisce le demo.',
};

export default function PrivacyPage() {
  const contact =
    process.env.PRIVACY_CONTACT_EMAIL?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    'hello@outreach.attila-lab.net';

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-stone-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Atti-Lab</p>
      <h1 className="mt-2 text-3xl font-semibold text-stone-900">
        Informazioni sul trattamento dei dati
      </h1>
      <p className="mt-4 leading-7">
        Atti-Lab può raccogliere informazioni professionali già visibili pubblicamente, come nome
        dell’attività, categoria, indirizzo, sito, recapiti aziendali, orari e contenuti pubblici,
        per analizzare la presenza online e predisporre una proposta dimostrativa.
      </p>

      <div className="mt-8 space-y-7">
        <section>
          <h2 className="text-lg font-semibold text-stone-900">Cosa viene conservato</h2>
          <p className="mt-2 leading-7">
            Conserviamo i dati necessari a identificare l’attività, documentarne la fonte, creare
            la demo, registrare comunicazioni e rispettare eventuali richieste di non essere più
            contattati. La presenza online di un recapito non equivale automaticamente a consenso
            per comunicazioni promozionali.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">Demo temporanee</h2>
          <p className="mt-2 leading-7">
            Le demo sono proposte visive, non siti ufficiali dell’attività. Chiediamo ai motori di
            ricerca di non indicizzarle e vengono rese inaccessibili e cancellate automaticamente
            dopo 36 ore dalla creazione.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">Fornitori tecnici</h2>
          <p className="mt-2 leading-7">
            Non vendiamo i dati. Per fornire il servizio possiamo utilizzare soggetti tecnici
            necessari, tra cui Supabase per il database, Vercel per l’hosting, Resend per le email,
            Google per informazioni sulle attività e, quando abilitato, OpenAI per l’analisi dei
            contenuti. Questi soggetti possono trattare i dati esclusivamente per erogare i servizi
            tecnici configurati.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">Scelta e diritti</h2>
          <p className="mt-2 leading-7">
            Ogni email contiene un collegamento per non ricevere ulteriori comunicazioni. La scelta
            viene registrata in una lista di esclusione e blocca gli invii futuri. Puoi inoltre
            chiedere accesso, rettifica o cancellazione dei dati scrivendo a{' '}
            <a className="font-medium underline" href={`mailto:${contact}`}>
              {contact}
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-stone-200 pt-5 text-xs leading-5 text-stone-500">
        Titolare del trattamento: Atti-Lab. Prima della pubblicazione definitiva devono essere
        completati i dati identificativi fiscali e la sede del titolare.
      </p>
    </main>
  );
}
