import RestaurantPremium from '@/components/templates/restaurant-premium';
import RestaurantPremiumV2 from '@/components/templates/restaurant-premium-v2';
import type { DemoInstanceData } from '@/lib/templates/restaurant-premium';
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from '@/lib/templates/restaurant-premium-v2';
import type { KnownRendererKey } from '@/lib/templates/registry';

export type DemoRendererProps = {
  rendererKey: KnownRendererKey;
  data: DemoInstanceData | DemoInstanceDataV2;
  compact?: boolean;
};

export default function DemoRenderer({ rendererKey, data, compact }: DemoRendererProps) {
  if (rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
    return <RestaurantPremiumV2 data={data as DemoInstanceDataV2} compact={compact} />;
  }
  return <RestaurantPremium data={data as DemoInstanceData} compact={compact} />;
}
