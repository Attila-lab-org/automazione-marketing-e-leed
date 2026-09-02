"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { consentChannelLabel } from "@/lib/security/deep-consent";
import type { DeepAnalysis, DeepFinding } from "@/lib/security/deep-scan";
import { DEEP_CHECK_STEPS, explainFinding, riskIfUnfixed } from "@/lib/security/explain";
import { securityScoreClass } from "@/lib/security/labels";
import { findingsByCategory, scoreBandLabel } from "@/lib/security/surface-audit";
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
    latest_deep_audit_id?: string | null;
    public_slug: string;
    consent_channel: SecurityConsentChannel | null;
    consent_note: string | null;
    consent_at: string | null;
    deep_notes: string | null;
  };
  lead: { id?: string; email: string | null; city: string | null; phone: string | null };
  analysis: SurfaceAnalysis | null;
  deepAudit: {
    id: string;
    status: "running" | "completed" | "failed";
    error: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
  deepAnalysis: DeepAnalysis | null;
  emailPreview: { subject: string; html: string; text: string } | null;
  letter: string;
  canSendEmail: boolean;
  hasConfirmedProblems: boolean;
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

function confidenceLabel(confidence: SurfaceFinding["confidence"]): string {
  if (confidence === "confirmed") return "Attendibilità: confermata";
  if (confidence === "likely") return "Attendibilità: probabile";
  return "Informazione osservata";
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

function FindingCard({ item }: { item: SurfaceFinding }) {
  const explained = explainFinding(item.code);
  const isInfo = item.category === "info";
  return (
    <li className={`rounded-xl border p-4 ${severityClass(item.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{item.title}</h3>
        <span className="text-[11px] uppercase tracking-wide">
          {confidenceLabel(item.confidence)} · {severityLabel(item.severity)}
        </span>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">Perché lo segnalo.</span> {explained.meaning}
      </p>
      {isInfo ? (
        <p className="mt-2 text-sm opacity-90">
          <span className="font-medium">Nota.</span>{" "}
          {item.limit || explained.limit || "Non è da sola un problema da sistemare."}
        </p>
      ) : (
        <p className="mt-2 text-sm font-medium">{riskIfUnfixed(explained.risk)}</p>
      )}
      {explained.remediation ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">Come sistemarlo.</span> {explained.remediation}
        </p>
      ) : null}
      <p className="mt-2 text-xs opacity-80">
        <span className="font-medium">Cosa questa prova non dimostra.</span>{" "}
        {item.limit || explained.limit || "Non prova ingressi riusciti né falle non visibili da fuori."}
      </p>
      <p className="mt-2 text-xs opacity-70">Prova: {item.evidence}</p>
    </li>
  );
}

function FindingSection({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: SurfaceFinding[];
}) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-sm text-stone-500">{hint}</p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <FindingCard key={item.code} item={item} />
        ))}
      </ul>
    </section>
  );
}

function DeepFindingCard({ item }: { item: DeepFinding }) {
  const explained = explainFinding(item.code);
  return (
    <li className={`rounded-xl border p-4 ${severityClass(item.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{item.title}</h4>
        <span className="text-[11px] uppercase tracking-wide">
          {confidenceLabel(item.confidence)}
        </span>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">Perché lo segnalo.</span> {explained.meaning}
      </p>
      {item.category !== "info" ? (
        <p className="mt-2 text-sm font-medium">{riskIfUnfixed(explained.risk)}</p>
      ) : null}
      {explained.remediation ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">Come sistemarlo.</span> {explained.remediation}
        </p>
      ) : null}
      <p className="mt-2 text-xs opacity-80">
        <span className="font-medium">Cosa questa prova non dimostra.</span> {item.limit}
      </p>
      <p className="mt-2 text-xs opacity-70">
        Vista su {item.pageUrls.length} pagina{item.pageUrls.length === 1 ? "" : "e"} · Prova:{" "}
        {item.evidence}
      </p>
    </li>
  );
}

export default function SecurityReportClient({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"skip" | "send" | "deep" | "reread" | null>(null);
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
    // La funzione aggiorna lo stato solo dopo la risposta della fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function reread() {
    const leadId = report?.lead.id;
    if (!leadId) {
      setNotice("Manca il contatto collegato: non posso rileggere la pagina.");
      return;
    }
    setBusy("reread");
    setNotice(null);
    try {
      const response = await fetch("/api/security/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Rilettura non riuscita");
      setNotice(data.message ?? "Ho riletto la pagina pubblica.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Rilettura non riuscita");
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

  async function saveDeep() {
    setBusy("deep");
    setNotice(null);
    try {
      const response = await fetch(`/api/security/targets/${targetId}/deep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: deepNotes }),
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
  const grouped = analysis ? findingsByCategory(analysis.findings) : null;
  const deepAnalysis = report.deepAnalysis;
  const deepGrouped = deepAnalysis ? findingsByCategory(deepAnalysis.findings) : null;
  const cspOk = analysis?.headers.csp === "present";
  const cspMissing =
    analysis?.headers.csp === "report-only"
      ? "Solo segnalazione"
      : analysis?.headers.csp === "weak"
        ? "Troppo larga"
        : "Assente";

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
                ok={cspOk}
                label="Dice al browser quali script può eseguire"
                missing={cspMissing}
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
                ok={analysis.headers.permissionsPolicy}
                label="Limita fotocamera, posizione e simili"
                missing="Assente"
              />
              <CheckRow
                ok={analysis.headers.cookieSecure}
                label="Cookie solo con lucchetto"
                missing="Senza Secure"
              />
              <CheckRow
                ok={analysis.headers.cookieHttpOnly}
                label="Cookie di sessione non leggibili dagli script"
                missing="Senza HttpOnly"
              />
              <CheckRow
                ok={analysis.headers.cookieSameSite}
                label="Cookie di sessione con regola SameSite"
                missing="Senza SameSite"
              />
            </ul>
            {analysis.httpStatus ? (
              <p className="mt-3 text-xs text-stone-400">Stato HTTP: {analysis.httpStatus}</p>
            ) : null}
            {analysis.redirectChain?.length ? (
              <p className="mt-1 truncate text-xs text-stone-400">
                Redirect: {analysis.redirectChain.join(" → ")}
              </p>
            ) : null}
            {analysis.htmlTruncated ? (
              <p className="mt-1 text-xs text-amber-700">Risposta lunga: ho letto solo la parte iniziale.</p>
            ) : null}
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

          {grouped && analysis.findings.length === 0 ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Esito della lettura</h2>
              <p className="mt-2 text-sm text-stone-600">
                Da questa pagina pubblica non ho visto le cose che di solito segnaliamo.
              </p>
            </section>
          ) : null}

          {grouped ? (
            <>
              <FindingSection
                title="Da sistemare"
                hint="Problemi confermati dalla risposta della homepage."
                items={grouped.problems}
              />
              <FindingSection
                title="Protezione consigliata"
                hint="Regole assenti o deboli. Non sono da sole prova di un attacco."
                items={grouped.protections}
              />
              <FindingSection
                title="Informazioni pubbliche"
                hint="Cose visibili a tutti. Non abbassano il punteggio da sole."
                items={grouped.infos}
              />
            </>
          ) : null}

          {analysis.apiMentions.length > 0 || analysis.gaIds.length > 0 ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Altri dettagli visibili</h2>
              {analysis.apiMentions.length > 0 ? (
                <p className="mt-2 text-xs text-stone-500">
                  In pagina si vedono anche questi indirizzi: {analysis.apiMentions.slice(0, 5).join(", ")}
                </p>
              ) : null}
              {analysis.gaIds.length > 0 ? (
                <p className="mt-2 text-xs text-stone-500">
                  Codice di misurazione visibile: {analysis.gaIds.join(", ")}. Non è un problema di sicurezza.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Cosa fare adesso</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || !report.lead.id}
            onClick={() => void reread()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            {busy === "reread" ? "Rileggo…" : "Rileggi la pagina pubblica"}
          </button>
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
        {!report.hasConfirmedProblems ? (
          <p className="mt-2 text-sm text-stone-600">
            La prima analisi non contiene problemi confermati: l’email di allarme non viene preparata.
          </p>
        ) : !report.canSendEmail ? (
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
        <h2 className="text-sm font-semibold text-stone-900">Secondo report approfondito</h2>
        <p className="mt-1 text-sm text-stone-600">
          Dopo il permesso, Attila controlla fino a 12 pagine pubbliche collegate dello stesso sito
          e confronta il risultato con la prima homepage. Non invia moduli, non prova password e non
          modifica dati.
        </p>
        {grouped && (grouped.problems.length || grouped.protections.length) ? (
          <p className="mt-2 text-sm text-stone-700">
            Da sistemare / proteggere:{" "}
            {[...grouped.problems, ...grouped.protections]
              .map((item) => item.title)
              .slice(0, 8)
              .join("; ")}
            {[...grouped.problems, ...grouped.protections].length > 8 ? "…" : "."}
          </p>
        ) : null}
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
              {report.target.status === "deep_done"
                ? " Secondo report completato."
                : report.target.status === "deep_running"
                  ? " Scansione in corso."
                  : report.target.status === "deep_failed"
                    ? " L’ultimo tentativo non è riuscito."
                    : " Scansione pronta."}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
              {DEEP_CHECK_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            {report.deepAudit?.error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {report.deepAudit.error}
              </p>
            ) : null}

            {deepAnalysis && deepGrouped ? (
              <div className="space-y-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-stone-500">Primo report</p>
                    <p className="text-2xl font-semibold tabular-nums text-stone-900">
                      {deepAnalysis.metadata.baselineScore ?? score ?? "—"}
                    </p>
                  </div>
                  <span className="text-stone-400">→</span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-stone-500">Report approfondito</p>
                    <p className="text-2xl font-semibold tabular-nums text-stone-900">
                      {deepAnalysis.score}
                    </p>
                  </div>
                  <p className="text-sm text-stone-600">
                    {deepAnalysis.pages.length} pagine · {deepAnalysis.metadata.requestsMade} richieste
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-stone-900">Confermati</h3>
                    <ul className="mt-2 space-y-1 text-sm text-stone-700">
                      {deepAnalysis.comparison.confirmed.length ? (
                        deepAnalysis.comparison.confirmed.map((item) => (
                          <li key={item.code}>• {item.title}</li>
                        ))
                      ) : (
                        <li>Nessuno</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-stone-900">Nuovi nel secondo report</h3>
                    <ul className="mt-2 space-y-1 text-sm text-stone-700">
                      {deepAnalysis.comparison.newFindings.length ? (
                        deepAnalysis.comparison.newFindings.map((item) => (
                          <li key={item.code}>• {item.title}</li>
                        ))
                      ) : (
                        <li>Nessuno</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-stone-900">Non riprodotti</h3>
                    <ul className="mt-2 space-y-1 text-sm text-stone-700">
                      {deepAnalysis.comparison.notReproduced.length ? (
                        deepAnalysis.comparison.notReproduced.map((item) => (
                          <li key={item.code}>• {item.title}</li>
                        ))
                      ) : (
                        <li>Nessuno</li>
                      )}
                    </ul>
                  </div>
                </div>

                {[
                  { title: "Da sistemare", items: deepGrouped.problems },
                  { title: "Protezione consigliata", items: deepGrouped.protections },
                  { title: "Informazioni pubbliche", items: deepGrouped.infos },
                ].map((section) =>
                  section.items.length ? (
                    <div key={section.title}>
                      <h3 className="text-sm font-semibold text-stone-900">{section.title}</h3>
                      <ul className="mt-2 space-y-3">
                        {section.items.map((item) => (
                          <DeepFindingCard key={item.code} item={item as DeepFinding} />
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}

                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Pagine controllate</h3>
                  <ul className="mt-2 space-y-1 text-xs text-stone-600">
                    {deepAnalysis.pages.map((page) => (
                      <li key={page.url} className="truncate">
                        HTTP {page.status} · {page.url}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Limiti del controllo</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-stone-600">
                    {deepAnalysis.metadata.limits.map((limit) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {!deepAnalysis && report.target.status !== "deep_running" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void openDeep()}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "deep" ? "Scansione in corso…" : "Avvia di nuovo la scansione approfondita"}
              </button>
            ) : null}

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
                onClick={() => void saveDeep()}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                {busy === "deep" ? "Salvo…" : "Salva le note"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-stone-600">
              Annota il permesso e avvia il secondo report. La mail iniziale, se serve, può essere
              inviata prima.
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
              {busy === "deep"
                ? "Scansione in corso…"
                : "Ho il permesso: avvia il report approfondito"}
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
