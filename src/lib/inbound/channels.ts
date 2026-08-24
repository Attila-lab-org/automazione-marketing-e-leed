import type { ChannelRegistryEntry, InboundChannelId } from './types';

/** Registry estendibile: solo Telegram è ready in V1. */
export const INBOUND_CHANNEL_REGISTRY: ChannelRegistryEntry[] = [
  {
    channel: 'telegram',
    label: 'Telegram',
    status: 'ready',
    sourceType: 'TELEGRAM_INBOUND',
  },
  {
    channel: 'discord',
    label: 'Discord',
    status: 'stub',
    sourceType: 'DISCORD_INBOUND',
  },
  {
    channel: 'mastodon',
    label: 'Mastodon',
    status: 'stub',
    sourceType: 'MASTODON_INBOUND',
  },
  {
    channel: 'bluesky',
    label: 'Bluesky',
    status: 'stub',
    sourceType: 'BLUESKY_INBOUND',
  },
];

export function getChannelRegistryEntry(
  channel: InboundChannelId,
): ChannelRegistryEntry | undefined {
  return INBOUND_CHANNEL_REGISTRY.find((c) => c.channel === channel);
}

export function sourceTypeForChannel(channel: InboundChannelId) {
  const entry = getChannelRegistryEntry(channel);
  if (!entry) throw new Error(`Canale sconosciuto: ${channel}`);
  return entry.sourceType;
}
