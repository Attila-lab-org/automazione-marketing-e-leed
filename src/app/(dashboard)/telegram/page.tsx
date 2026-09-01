import { redirect } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import TelegramPowerControl from "@/components/telegram-power-control";
import TelegramControlPanel from "@/components/telegram-control-panel";
import { requireAdminSession } from "@/lib/auth/guard";

export default async function TelegramPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  if (params.view === "archived") {
    redirect("/archive");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Bot Telegram"
        description="Accendi, spegni e configura il bot. Le conversazioni sono tutte in Messaggi."
      />

      <TelegramPowerControl />
      <Link
        href="/inbox?channel=telegram"
        className="inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
      >
        Apri i messaggi Telegram
      </Link>

      <section id="telegram-config" className="scroll-mt-24">
        <h2 className="mb-3 text-base font-semibold text-stone-900">Impostazioni bot</h2>
        <TelegramControlPanel />
      </section>
    </div>
  );
}
