export function europeRomeYmd(daysAgo: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  const utcNoon = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  const shifted = new Date(utcNoon);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function tzOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

export function europeRomeDayRange(
  daysAgo: number,
  now = new Date(),
): { ymd: string; startIso: string; endIso: string; label: string } {
  const ymd = europeRomeYmd(daysAgo, now);
  const [y, m, d] = ymd.split('-').map(Number);
  const utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0);
  const offset = tzOffsetMs('Europe/Rome', new Date(utcGuess));
  const start = new Date(utcGuess - offset);
  const nextYmd = europeRomeYmd(daysAgo - 1, now);
  const [ny, nm, nd] = nextYmd.split('-').map(Number);
  const nextGuess = Date.UTC(ny, (nm ?? 1) - 1, nd ?? 1, 0, 0, 0);
  const nextOffset = tzOffsetMs('Europe/Rome', new Date(nextGuess));
  const end = daysAgo === 0 ? now : new Date(nextGuess - nextOffset);
  return {
    ymd,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: daysAgo === 1 ? 'ieri' : daysAgo === 0 ? 'oggi' : ymd,
  };
}
