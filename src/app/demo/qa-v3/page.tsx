import { notFound } from 'next/navigation';
import RestaurantPremiumV3 from '@/components/templates/restaurant-premium-v3';
import { areQaFixturesAllowed } from '@/lib/qa/gate';
import { prefillFromLeadV3 } from '@/lib/templates/merge-v3';
import {
  getOwnerOfferPrice,
  isOwnerBridgeEnabled,
  isOwnerContactConfigured,
  isOwnerWhatsAppConfigured,
} from '@/lib/templates/owner-commercial';
import { RESTAURANT_PREMIUM_V3_DEFAULTS } from '@/lib/templates/restaurant-premium-v3';

/** Internal QA surface — not public in production unless ALLOW_PUBLIC_QA=1. */
export default function RestaurantV3QaPage() {
  if (!areQaFixturesAllowed()) notFound();

  const data = prefillFromLeadV3(
    {
      name: 'Trattoria Example',
      city: 'Milano',
      rating: 4.7,
      reviewCount: 1082,
      address: 'Via Example 12, Milano',
      phone: '+39 02 0000000',
    },
    RESTAURANT_PREMIUM_V3_DEFAULTS,
  );

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.dataset.qaReveal='1';`,
        }}
      />
      <RestaurantPremiumV3
        data={data}
        demoSlug="qa-v3"
        offerPrice={getOwnerOfferPrice()}
        showOwnerBridge={isOwnerBridgeEnabled()}
        whatsappEnabled={isOwnerWhatsAppConfigured()}
        siteEnabled={isOwnerContactConfigured()}
      />
    </>
  );
}
