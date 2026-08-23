/**
 * Factory AIProvider — selezione via env AI_PROVIDER_MODE (mock|live),
 * default mock (§22.3).
 */

import { AIProviderLive } from './live';
import { AIProviderMock } from './mock';
import type { AIProvider } from './types';

export type {
  AIProvider,
  GeneratedMessage,
  GenerateMessageInput,
  RegenerateFieldInput,
  RegenerateFieldResult,
} from './types';
export { AIProviderMock } from './mock';
export { AIProviderLive } from './live';

export function getAIProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const mode = (env.AI_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live') {
    return new AIProviderLive({ apiKey: env.AI_API_KEY ?? '', model: env.AI_MODEL });
  }
  if (mode !== 'mock') {
    throw new Error(`AI_PROVIDER_MODE "${mode}" non valido: atteso mock|live`);
  }
  return new AIProviderMock();
}
