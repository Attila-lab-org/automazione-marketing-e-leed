import PageHeader from "@/components/page-header";
import { requireAdminSession } from "@/lib/auth/guard";
import SecurityBrowser from "./security-browser";

export default async function SecurityPage() {
  await requireAdminSession();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Sicurezza"
        description="Cerca i contatti, scegline uno o tutti, fai aprire la pagina pubblica e leggi un report con prove e esempi. Le email visibili si salvano subito. Il controllo approfondito si può aprire anche prima della mail, se il titolare dà il permesso al telefono."
      />
      <SecurityBrowser />
    </div>
  );
}
