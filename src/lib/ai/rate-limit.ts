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

const operatorHits: number[] = [];

export function consumeOperatorChatRateLimit(now = Date.now()): boolean {
  while (operatorHits.length > 0 && now - (operatorHits[0] ?? 0) > WINDOW_MS) {
    operatorHits.shift();
  }
  if (operatorHits.length >= 20) return false;
  operatorHits.push(now);
  return true;
}

export function resetOperatorChatRateLimit(): void {
  operatorHits.length = 0;
}
