const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const hits: number[] = [];

export function consumeAiTestRateLimit(now = Date.now()): boolean {
  while (hits.length > 0 && now - (hits[0] ?? 0) > WINDOW_MS) {
    hits.shift();
  }
  if (hits.length >= MAX_PER_WINDOW) return false;
  hits.push(now);
  return true;
}

export function resetAiTestRateLimit(): void {
  hits.length = 0;
}
