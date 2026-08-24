import RestaurantPremiumV3 from '@/components/templates/restaurant-premium-v3';
import { prefillFromLeadV3 } from '@/lib/templates/merge-v3';
import { RESTAURANT_PREMIUM_V3_DEFAULTS } from '@/lib/templates/restaurant-premium-v3';

/** Internal QA surface for visual screenshots (not linked in nav). */
export default function RestaurantV3QaPage() {
  const data = prefillFromLeadV3(
    {
      name: 'Trattoria Duomo',
      city: 'Milano',
      rating: 4.7,
      reviewCount: 1082,
      address: 'Via Torino 12, Milano',
      phone: '+39 02 1234567',
    },
    RESTAURANT_PREMIUM_V3_DEFAULTS,
  );

  return <RestaurantPremiumV3 data={data} />;
}
