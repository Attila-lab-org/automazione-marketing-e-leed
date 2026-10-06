export type CampaignProgress = {
  pending: number;
  generating: number;
  review: number;
  ready: number;
  approved: number;
  sending: number;
  sent: number;
  skipped: number;
  failed: number;
};

export function emptyCampaignProgress(): CampaignProgress {
  return {
    pending: 0,
    generating: 0,
    review: 0,
    ready: 0,
    approved: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
}

export function campaignActivityLabel(status: string, leads: number, progress: CampaignProgress): string {
  if (status === "DRAFT") return "Prossimo passo: prepara e controlla i messaggi";
  if (status === "PAUSED") return "In pausa";
  if (status === "ARCHIVED" || status === "STOPPED" || status === "COMPLETED") {
    return "Invio chiuso o fermo";
  }
  if (status !== "ACTIVE") return "Invio chiuso o fermo";
  if (leads > 0 && progress.skipped >= leads && progress.sent === 0) {
    return "Nessuna attività può ricevere questa email";
  }
  if (progress.review + progress.ready > 0) return "Messaggi pronti: controlla e approva";
  if (progress.approved + progress.sending > 0) return "Invio in corso";
  if (progress.pending + progress.generating > 0) return "Sto preparando demo e messaggi";
  if (progress.sent > 0) return "Email già uscite";
  if (progress.failed > 0) return "La preparazione si è fermata";
  return "Aperta, in attesa del prossimo passo";
}
