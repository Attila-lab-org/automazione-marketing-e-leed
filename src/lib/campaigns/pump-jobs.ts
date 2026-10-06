let pumping: Promise<void> | null = null;

/** Runs a few queued campaign jobs now, so progress does not depend only on the cron. */
export function pumpCampaignJobs(limit = 4): Promise<void> {
  if (pumping) return pumping;
  pumping = fetch("/api/jobs/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      pumping = null;
    });
  return pumping;
}
