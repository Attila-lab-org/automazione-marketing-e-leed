import { TelegramLive } from './live';
import { TelegramMock } from './mock';
import type { TelegramProvider } from './types';

export type { TelegramProvider } from './types';
export { TelegramMock } from './mock';
export { TelegramLive } from './live';
export { parseTelegramUpdate } from './parse';

export function getTelegramProvider(env: NodeJS.ProcessEnv = process.env): TelegramProvider {
  const mode = (env.TELEGRAM_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live') {
    return new TelegramLive(env.TELEGRAM_BOT_TOKEN ?? '');
  }
  if (mode !== 'mock') {
    throw new Error(`TELEGRAM_PROVIDER_MODE "${mode}" non valido: atteso mock|live`);
  }
  return new TelegramMock();
}
