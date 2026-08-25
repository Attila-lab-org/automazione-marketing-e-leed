/**
 * Factory AIProvider (copy stub) — distinta da getAICommercialProvider (AI-0).
 * AI_PROVIDER_MODE=openai|live resta uno stub: generateMessage non è usato
 * dai job di invio, quindi non altera il comportamento email.
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
  if (mode === 'live' || mode === 'openai') {
    return new AIProviderLive({
      apiKey: env.OPENAI_API_KEY ?? env.AI_API_KEY ?? env.AI_PROVIDER_API_KEY ?? '',
      model: env.AI_MODEL,
    });
  }
  if (mode !== 'mock') {
    throw new Error(`AI_PROVIDER_MODE "${mode}" non valido: atteso mock|openai`);
  }
  return new AIProviderMock();
}
