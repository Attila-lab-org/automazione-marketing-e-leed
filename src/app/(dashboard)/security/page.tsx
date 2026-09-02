import PageHeader from "@/components/page-header";
import { requireAdminSession } from "@/lib/auth/guard";
import SecurityBrowser from "./security-browser";

export default async function SecurityPage() {
  await requireAdminSession();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Sicurezza"
        description="Cerca i contatti, scegli un’attività già salvata o scrivi l’indirizzo. Si apre solo la pagina pubblica."
      />
      <SecurityBrowser />
    </div>
  );
}
