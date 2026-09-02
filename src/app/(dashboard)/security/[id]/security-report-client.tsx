"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { consentChannelLabel } from "@/lib/security/deep-check";
import { DEEP_CHECK_STEPS, explainFinding, riskIfUnfixed } from "@/lib/security/explain";
import { securityScoreClass } from "@/lib/security/labels";
import { scoreBandLabel } from "@/lib/security/surface-audit";
import type { SurfaceAnalysis, SurfaceFinding } from "@/lib/security/surface-audit";
import type { SecurityConsentChannel } from "@/lib/types/database";

type ReportPayload = {
  target: {
    id: string;
    name: string;
    domain: string;
    url: string;
    status: string;
    score: number | null;
    public_slug: string;
    consent_channel: SecurityConsentChannel | null;
    consent_note: string | null;
    consent_at: string | null;
    deep_notes: string | null;
  };
  lead: { email: string | null; city: string | null; phone: string | null };
  analysis: SurfaceAnalysis | null;
  emailPreview: { subject: string; html: string; text: string } | null;
  letter: string;
  canSendEmail: boolean;
  audit: { error: string | null; http_status: number | null; final_url: string | null } | null;
  error?: string;
};

function severityClass(severity: SurfaceFinding["severity"]): string {
  if (severity === "HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function severityLabel(severity: SurfaceFinding["severity"]): string {
  if (severity === "HIGH") return "Evidenza forte";
  if (severity === "MEDIUM") return "Evidenza media";
  return "Evidenza lieve";
}

function CheckRow({ ok, label, missing }: { ok: boolean | null; label: string; missing: string }) {
  if (ok === null) {
    return (
      <li className="flex justify-between gap-3 text-sm text-stone-500">
        <span>{label}</span>
        <span>Non applicabile</span>
      </li>
    );
  }
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span className="text-stone-700">{label}</span>
      <span className={ok ? "font-medium text-emerald-700" : "font-medium text-stone-600"}>
        {ok ? "Presente" : missing}
      </span>
    </li>
  );
}

export default function SecurityReportClient({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"skip" | "send" | "deep" | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [consentChannel, setConsentChannel] = useState<SecurityConsentChannel>("phone");
  const [consentNote, setConsentNote] = useState("");
  const [deepNotes, setDeepNotes] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/security/targets/${targetId}`, { cache: "no-store" });
    const data = (await response.json()) as ReportPayload;
    if (!response.ok) throw new Error(data.error ?? "Report non trovato");
    setReport(data);
    setDeepNotes(data.target.deep_notes ?? "");
    if (data.target.consent_channel) setConsentChannel(data.target.consent_channel);
    if (data.target.consent_note) setConsentNote(data.target.consent_note);
  }, [targetId]);

  useEffect(() => {
    load().catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Report non trovato"));
  }, [load]);

  async function skip() {
    setBusy("skip");
    setNotice(null);
    try {
      const response = await fetch(`/api/security/targets/${targetId}/skip`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Operazione non riuscita");
      router.push("/security");
      router.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Operazione non riuscita");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }
    setBusy("send");
    setNotice(null);
    try {
      const response = await fetch(`/api/security/targets/${targetId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Invio non riuscito");
      setConfirmSend(false);
      setNotice(data.message ?? "Fatto.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Invio non riuscito");
    } finally {
      setBusy(null);
    }
  }

  async function openDeep() {
    setBusy("deep");
    setNotice(null);
    try {
      const response = await fetch(`/api/security/targets/${targetId}/deep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          channel: consentChannel,
          note: consentNote.trim() || null,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Non ho potuto aprire il controllo");
      setNotice(data.message ?? "Controllo approfondito aperto.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Non ho potuto aprire il controllo");
    } finally {
      setBusy(null);
    }
  }

  async function saveDeep(done = false) {
    setBusy("deep");
    setNotice(null);
    try {
      const response = await fetch(`/api/security/targets/${targetId}/deep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: deepNotes, done }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Salvataggio non riuscito");
      setNotice(data.message ?? "Salvato.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Salvataggio non riuscito");
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-700">
        {loadError}{" "}
        <Link href="/security" className="underline">
          Torna alla lista
        </Link>
      </p>
    );
  }
  if (!report) {
    return <p className="text-sm text-stone-500">Apro il report…</p>;
  }

  const score = report.target.score;
  const analysis = report.analysis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/security" className="text-sm text-stone-500 hover:text-stone-800">
            ← Lista sicurezza
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-stone-900">{report.target.name}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {report.target.domain}
            {report.lead.city ? ` · ${report.lead.city}` : ""}
          </p>
        </div>
        {score !== null ? (
          <div className={`rounded-2xl border px-4 py-3 text-right ${securityScoreClass(score)}`}>
            <div className="text-3xl font-semibold tabular-nums">{score}</div>
            <div className="mt-1 text-xs font-medium">{scoreBandLabel(score)}</div>
          </div>
        ) : null}
      </div>

      <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
        Questo report elenca solo cose visibili aprendo la pagina pubblica, come un visitatore. Niente
        percorsi nascosti, niente moduli inviati, niente ipotesi.
      </p>

      {report.audit?.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {report.audit.error}
        </p>
      ) : null}

      {analysis ? (
        <>
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Cosa ha risposto il sito</h2>
            <ul className="mt-3 space-y-2">
              <CheckRow
                ok={analysis.headers.https}
                label="Pagina con lucchetto (https)"
                missing="Senza lucchetto"
              />
              <CheckRow
                ok={analysis.headers.hsts}
                label="Chiede al browser di restare su https"
                missing="Assente"
              />
              <CheckRow
                ok={analysis.headers.csp === "present"}
                label="Dice al browser quali script può eseguire"
                missing={analysis.headers.csp === "report-only" ? "Solo segnalazione" : "Assente"}
              />
              <CheckRow
                ok={analysis.headers.frameProtection}
                label="Vieta di essere messa in un’altra pagina"
                missing="Assente"
              />
              <CheckRow ok={analysis.headers.nosniff} label="Regola nosniff" missing="Assente" />
              <CheckRow
                ok={analysis.headers.referrerPolicy}
                label="Dice cosa può vedere il sito precedente"
                missing="Assente"
              />
              <CheckRow
                ok={analysis.headers.cookieSecure}
                label="Cookie solo con lucchetto"
                missing="Senza Secure"
              />
            </ul>
            {report.audit?.final_url ? (
              <p className="mt-3 truncate text-xs text-stone-400">Pagina aperta: {report.audit.final_url}</p>
            ) : null}
          </section>

          {analysis.technologies.length > 0 ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Scritto in pagina</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {analysis.technologies.map((item) => (
                  <span
                    key={item.name}
                    title={item.evidence}
                    className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Cose viste</h2>
            {analysis.findings.length === 0 ? (
              <p className="mt-2 text-sm text-stone-600">
                Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {analysis.findings.map((item) => {
                  const explained = explainFinding(item.code);
                  return (
                    <li key={item.code} className={`rounded-xl border p-4 ${severityClass(item.severity)}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">{item.title}</h3>
                        <span className="text-[11px] uppercase tracking-wide">{severityLabel(item.severity)}</span>
                      </div>
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Cosa si vede.</span> {explained.meaning}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {riskIfUnfixed(explained.risk)}
                      </p>
                      <p className="mt-2 text-xs opacity-70">Prova: {item.evidence}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {analysis.apiMentions.length > 0 ? (
              <p className="mt-4 text-xs text-stone-500">
                In pagina si vedono anche questi indirizzi: {analysis.apiMentions.slice(0, 5).join(", ")}
              </p>
            ) : null}
            {analysis.gaIds.length > 0 ? (
              <p className="mt-2 text-xs text-stone-500">
                Codice di misurazione visibile: {analysis.gaIds.join(", ")}. Non è un problema di sicurezza.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Cosa fare adesso</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void skip()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            {busy === "skip" ? "Salto…" : "Salta questo contatto"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !report.emailPreview}
            onClick={() => void send()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "send"
              ? "Invio…"
              : confirmSend
                ? report.canSendEmail
                  ? "Confermo: invia l’email"
                  : "Manca l’email del contatto"
                : "Prepara / invia email"}
          </button>
        </div>
        {report.lead.email ? (
          <p className="mt-2 text-sm text-stone-600">
            Email sul contatto: {report.lead.email}
            {analysis?.emailsFound?.length
              ? " — letta dalla pagina pubblica e salvata."
              : ""}
          </p>
        ) : null}
        {!report.canSendEmail ? (
          <p className="mt-2 text-sm text-amber-800">
            In questa pagina pubblica non ho visto un’email da salvare. Puoi comunque chiamare e, se
            il titolare dà il permesso al telefono, aprire subito il controllo approfondito.
          </p>
        ) : null}
        {confirmSend && report.canSendEmail ? (
          <p className="mt-2 text-sm text-stone-600">
            Premi di nuovo per confermare. Se le email sono in prova, non parte un invio vero.
          </p>
        ) : null}
        {notice ? <p className="mt-3 text-sm text-emerald-800">{notice}</p> : null}

        {report.emailPreview ? (
          <div className="mt-4 rounded-lg border border-stone-100 bg-stone-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Anteprima email</p>
            <p className="mt-1 text-sm font-semibold text-stone-900">{report.emailPreview.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{report.emailPreview.text}</pre>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-dashed border-stone-300 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Controllo più approfondito</h2>
        <p className="mt-1 text-sm text-stone-600">
          Si può aprire <strong>prima della mail</strong>, se il titolare ti ha detto sì al telefono,
          di persona o con la lettera. Non serve a trovare le email: quelle visibili in pagina si
          salvano al primo controllo. Attila non attacca e non parte da solo: il controllo lo fai tu
          con lui.
        </p>
        {report.lead.phone ? (
          <p className="mt-2 text-sm text-stone-700">
            Telefono sul contatto: <span className="font-medium">{report.lead.phone}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Sul contatto non c’è ancora un telefono.</p>
        )}

        {report.target.consent_at ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Permesso annotato: {consentChannelLabel(report.target.consent_channel)}
              {report.target.consent_note ? ` · ${report.target.consent_note}` : ""}.
              {report.target.status === "deep_done" ? " Controllo segnato come fatto." : " Controllo aperto."}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
              {DEEP_CHECK_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <label className="block text-sm text-stone-700">
              Note del controllo
              <textarea
                value={deepNotes}
                onChange={(event) => setDeepNotes(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                placeholder="Cosa avete guardato insieme, cosa ha chiesto, cosa farete."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveDeep(false)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                {busy === "deep" ? "Salvo…" : "Salva le note"}
              </button>
              {report.target.status !== "deep_done" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void saveDeep(true)}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Segna come fatto
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-stone-600">
              Annota il permesso e apri il controllo. La mail, se serve, la puoi mandare dopo.
            </p>
            <label className="block text-sm text-stone-700">
              Come è arrivato il permesso
              <select
                value={consentChannel}
                onChange={(event) => setConsentChannel(event.target.value as SecurityConsentChannel)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                <option value="phone">Al telefono</option>
                <option value="in_person">Di persona</option>
                <option value="letter">Lettera firmata</option>
              </select>
            </label>
            <label className="block text-sm text-stone-700">
              Chi ha detto sì (facoltativo)
              <input
                value={consentNote}
                onChange={(event) => setConsentNote(event.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                placeholder="Es. Mario Rossi, titolare, 2 settembre"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openDeep()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "deep" ? "Apro…" : "Ho il permesso: apri il controllo approfondito"}
            </button>
          </div>
        )}

        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-xs text-stone-700">
          {report.letter}
        </pre>
        {score !== null ? (
          <p className="mt-3 text-xs text-stone-500">
            Anteprima pubblica (non indicizzata):{" "}
            <Link className="underline" href={`/demo/sicurezza/${report.target.public_slug}`}>
              /demo/sicurezza/{report.target.public_slug}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
