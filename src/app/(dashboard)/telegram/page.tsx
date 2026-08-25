import PageHeader from "@/components/page-header";
import TelegramControlPanel from "@/components/telegram-control-panel";

export default function TelegramPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Telegram"
        description="Collega il bot, avvialo e controlla come Attila trova e segue i contatti fino all’appuntamento."
      />

      <section className="grid gap-3 md:grid-cols-3" aria-label="Come attivare Telegram">
        {[
          {
            step: "1",
            title: "Collega il bot",
            text: "Configura token e webhook. Il riquadro sotto ti dice subito se manca qualcosa.",
          },
          {
            step: "2",
            title: "Aggiungilo alle chat",
            text: "Inserisci il bot nei gruppi da monitorare e abilita la lettura dei messaggi in BotFather.",
          },
          {
            step: "3",
            title: "Premi Avvia Telegram",
            text: "Da quel momento Attila intercetta i contatti e continua le conversazioni fino all’appuntamento.",
          },
        ].map((item) => (
          <article key={item.step} className="rounded-xl border border-stone-200 bg-white p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
              {item.step}
            </span>
            <h2 className="mt-3 text-sm font-semibold text-stone-900">{item.title}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-600">{item.text}</p>
          </article>
        ))}
      </section>

      <TelegramControlPanel />
    </div>
  );
}
