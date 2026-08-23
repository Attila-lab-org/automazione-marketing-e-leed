/**
 * Adapter live AI — STUB Phase 1. Senza credenziali fallisce con errore chiaro.
 * Le API key restano solo server-side (§18).
 */

import type {
  AIProvider,
  GeneratedMessage,
  GenerateMessageInput,
  RegenerateFieldInput,
  RegenerateFieldResult,
} from './types';

export interface AILiveConfig {
  apiKey: string;
  model?: string;
}

export class AIProviderLive implements AIProvider {
  private readonly config: AILiveConfig;

  constructor(config: AILiveConfig) {
    if (!config.apiKey) {
      throw new Error(
        'AIProviderLive: credenziali mancanti — configurare AI_API_KEY oppure usare AI_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
  }

  async generateMessage(_input: GenerateMessageInput): Promise<GeneratedMessage> {
    void this.config;
    throw new Error('AIProviderLive.generateMessage non implementato in Phase 1: usare mock mode');
  }

  async regenerateField(_input: RegenerateFieldInput): Promise<RegenerateFieldResult> {
    throw new Error('AIProviderLive.regenerateField non implementato in Phase 1: usare mock mode');
  }
}
