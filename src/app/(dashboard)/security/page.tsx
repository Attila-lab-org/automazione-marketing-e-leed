import PageHeader from "@/components/page-header";
import { requireAdminSession } from "@/lib/auth/guard";
import SecurityBrowser from "./security-browser";

export default async function SecurityPage() {
  await requireAdminSession();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Sicurezza"
        description="Cerca i contatti, scegli un’attività già salvata o scrivi tu l’indirizzo del sito. Si apre solo la pagina pubblica. Per ogni voce il report dice cosa si vede e cosa rischia se non sistema."
      />
      <SecurityBrowser />
    </div>
  );
}
