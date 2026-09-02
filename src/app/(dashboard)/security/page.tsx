import PageHeader from "@/components/page-header";
import { requireAdminSession } from "@/lib/auth/guard";
import SecurityBrowser from "./security-browser";

export default async function SecurityPage() {
  await requireAdminSession();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Sicurezza"
        description="Cerca i contatti, scegline uno o tutti, fai aprire la pagina pubblica e leggi un report con prove. Da lì decidi: saltare, scrivere, o un controllo più avanti con permesso scritto."
      />
      <SecurityBrowser />
    </div>
  );
}
