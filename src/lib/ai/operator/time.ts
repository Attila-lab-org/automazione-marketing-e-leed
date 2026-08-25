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

/** Costruisce un Instant ISO da data/ora civile Europe/Rome (DST-aware). */
export function europeRomeLocalToIso(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
): string {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, 0);
  const offset = tzOffsetMs('Europe/Rome', new Date(utcGuess));
  return new Date(utcGuess - offset).toISOString();
}

export function parseEuropeRomeDateTime(
  text: string,
  now = new Date(),
  opts?: { defaultHour?: number; defaultMinute?: number; durationMinutes?: number },
): { startsAt: string; endsAt: string; label: string } | null {
  const q = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const hm = q.match(/\b(\d{1,2})[:.](\d{2})\b/);
  const hour = hm ? Number(hm[1]) : (opts?.defaultHour ?? 11);
  const minute = hm ? Number(hm[2]) : (opts?.defaultMinute ?? 0);
  if (hour > 23 || minute > 59) return null;

  const today = europeRomeYmd(0, now);
  const [ty, tm, td] = today.split('-').map(Number);
  let y = ty;
  let m = tm;
  let d = td;
  let dayLabel = 'oggi';

  const dmy = q.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = dmy[3] ? (Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : ty;
    dayLabel = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  } else if (/\bdomani\b/.test(q)) {
    const tomorrow = europeRomeYmd(-1, now);
    [y, m, d] = tomorrow.split('-').map(Number);
    dayLabel = 'domani';
  } else if (/\boggi\b/.test(q)) {
    dayLabel = 'oggi';
  } else if (!hm && !/\b(slot|disponibilit|appuntament|alle)\b/.test(q)) {
    return null;
  } else if (!/\boggi\b/.test(q) && !hm) {
    const tomorrow = europeRomeYmd(-1, now);
    [y, m, d] = tomorrow.split('-').map(Number);
    dayLabel = 'domani';
  }

  const duration = opts?.durationMinutes ?? 30;
  const startsAt = europeRomeLocalToIso(y, m, d, hour, minute);
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
  const label = `${dayLabel} alle ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { startsAt, endsAt, label };
}

export function formatEuropeRome(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
