import RestaurantPremium from '@/components/templates/restaurant-premium';
import RestaurantPremiumV2 from '@/components/templates/restaurant-premium-v2';
import RestaurantPremiumV3 from '@/components/templates/restaurant-premium-v3';
import type { DemoInstanceData } from '@/lib/templates/restaurant-premium';
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from '@/lib/templates/restaurant-premium-v2';
import {
  RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  type DemoInstanceDataV3,
} from '@/lib/templates/restaurant-premium-v3';
import type { KnownRendererKey } from '@/lib/templates/registry';
import type { RestaurantPremiumV3CommercialProps } from '@/components/templates/restaurant-premium-v3';

export type DemoRendererProps = {
  rendererKey: KnownRendererKey;
  data: DemoInstanceData | DemoInstanceDataV2 | DemoInstanceDataV3;
  compact?: boolean;
  demoSlug?: string;
} & RestaurantPremiumV3CommercialProps;

export default function DemoRenderer({
  rendererKey,
  data,
  compact,
  demoSlug,
  offerPrice,
  showOwnerBridge,
  whatsappEnabled,
  phoneEnabled,
  siteEnabled,
  deliveryTime,
}: DemoRendererProps) {
  if (rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY) {
    return (
      <RestaurantPremiumV3
        data={data as DemoInstanceDataV3}
        compact={compact}
        demoSlug={demoSlug}
        offerPrice={offerPrice}
        showOwnerBridge={showOwnerBridge}
        whatsappEnabled={whatsappEnabled}
        phoneEnabled={phoneEnabled}
        siteEnabled={siteEnabled}
        deliveryTime={deliveryTime}
      />
    );
  }
  if (rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
    return <RestaurantPremiumV2 data={data as DemoInstanceDataV2} compact={compact} />;
  }
  return <RestaurantPremium data={data as DemoInstanceData} compact={compact} />;
}
