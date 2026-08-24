import { getTelegramProvider } from '@/lib/providers/telegram';
import type { InboundChannelAdapter, InboundChannelId } from './types';
import { getChannelRegistryEntry } from './channels';

class StubInboundAdapter implements InboundChannelAdapter {
  constructor(readonly channel: InboundChannelId) {}

  verifyWebhook(): void {
    throw new Error(`${this.channel}: connector non ancora implementato (stub)`);
  }

  parseInbound(): null {
    throw new Error(`${this.channel}: connector non ancora implementato (stub)`);
  }

  async reply(): Promise<never> {
    throw new Error(`${this.channel}: connector non ancora implementato (stub)`);
  }
}

/**
 * Factory estendibile multi-canale.
 * V1: solo Telegram. Discord / Mastodon / Bluesky restano stub espliciti.
 */
export function getInboundAdapter(
  channel: InboundChannelId,
  env: NodeJS.ProcessEnv = process.env,
): InboundChannelAdapter {
  const entry = getChannelRegistryEntry(channel);
  if (!entry) throw new Error(`Canale sconosciuto: ${channel}`);

  if (channel === 'telegram') {
    return getTelegramProvider(env);
  }

  return new StubInboundAdapter(channel);
}

export function listReadyInboundChannels(): InboundChannelId[] {
  return ['telegram'];
}
