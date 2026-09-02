import { explainFinding } from '@/lib/security/explain';
import { securityScoreClass } from '@/lib/security/labels';
import { loadPublicSecurityReport } from '@/lib/security/run-audit';
import { scoreBandLabel } from '@/lib/security/surface-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getOwnerWhatsApp, isOwnerContactConfigured } from '@/lib/templates/owner-commercial';
import { buildWhatsAppUrl } from '@/lib/templates/v3-cta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const admin = createAdminSupabaseClient(process.env);
  return loadPublicSecurityReport(admin, slug);
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const report = await load(slug);
  return {
    title: report ? `Cose visibili sul sito di ${report.name}` : 'Report non trovato',
    robots: { index: false, follow: false },
  };
}

export default async function PublicSecurityPage({ params }: PageProps) {
  const { slug } = await params;
  const report = await load(slug);
  const whatsapp = buildWhatsAppUrl({
    phoneOrUrl: getOwnerWhatsApp(),
    businessName: report?.name,
  });
  const contactUrl =
    process.env.OWNER_CONTACT_URL?.trim() || process.env.NEXT_PUBLIC_OWNER_CONTACT_URL?.trim() || null;

  if (!report) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <meta name="robots" content="noindex,nofollow" />
        <p className="text-sm text-stone-500">Questo report non è disponibile.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <meta name="robots" content="noindex,nofollow" />
      <p className="text-xs uppercase tracking-wide text-stone-400">Cose visibili da fuori</p>
      <h1 className="mt-2 text-2xl font-semibold text-stone-900">{report.name}</h1>
      <p className="mt-1 text-sm text-stone-500">{report.domain}</p>

      <div className={`mt-6 inline-block rounded-2xl border px-5 py-4 ${securityScoreClass(report.score)}`}>
        <div className="text-4xl font-semibold tabular-nums">{report.score}</div>
        <div className="mt-1 text-xs font-medium">{scoreBandLabel(report.score)}</div>
      </div>

      <p className="mt-6 text-sm text-stone-600">
        Aprendo la pagina pubblica come un visitatore, senza provare ingressi né percorsi nascosti, si vede:
      </p>
      <ul className="mt-4 space-y-3">
        {report.findings.map((item) => {
          const explained = explainFinding(item.code);
          return (
            <li key={item.code} className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="font-semibold text-stone-900">{item.title}</h2>
              <p className="mt-2 text-sm text-stone-700">
                <span className="font-medium">Cosa significa.</span> {explained.meaning}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                <span className="font-medium">Esempio.</span> {explained.example}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        {whatsapp ? (
          <a
            href={whatsapp}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Scrivici su WhatsApp
          </a>
        ) : null}
        {isOwnerContactConfigured() && contactUrl ? (
          <a
            href={contactUrl}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800"
          >
            Contattaci
          </a>
        ) : null}
      </div>
    </main>
  );
}
