import DemoRenderer from '@/components/templates/demo-renderer';
import { loadDemoBySlug } from '@/lib/demos/load';
import { resolveRendererKey, UnsupportedRendererError } from '@/lib/templates/registry';
import {
  getOwnerDeliveryTime,
  getOwnerOfferPrice,
  isOwnerBridgeEnabled,
  isOwnerContactConfigured,
  isOwnerPhoneConfigured,
  isOwnerWhatsAppConfigured,
} from '@/lib/templates/owner-commercial';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function load(slug: string) {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const admin = createAdminSupabaseClient(process.env);
  return loadDemoBySlug(admin, slug);
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const demo = await load(slug);
  const title =
    (demo?.data as { branding?: { business_name?: string | null } })?.branding?.business_name ??
    'Demo';
  return {
    title: String(title),
    robots: { index: false, follow: false },
  };
}

export default async function PublicDemoPage({ params }: PageProps) {
  const { slug } = await params;
  const demo = await load(slug);
  if (!demo) {
    return <p className="p-8 text-sm text-stone-500">Demo non trovata</p>;
  }

  try {
    resolveRendererKey(demo.rendererKey);
  } catch (err) {
    if (err instanceof UnsupportedRendererError) {
      return <p className="p-8 text-sm text-red-600">{err.message}</p>;
    }
    throw err;
  }

  return (
    <>
      <meta name="robots" content="noindex,nofollow" />
      <DemoRenderer
        rendererKey={demo.rendererKey}
        data={demo.data}
        demoSlug={demo.slug}
        offerPrice={getOwnerOfferPrice()}
        deliveryTime={getOwnerDeliveryTime()}
        showOwnerBridge={isOwnerBridgeEnabled()}
        whatsappEnabled={isOwnerWhatsAppConfigured()}
        phoneEnabled={isOwnerPhoneConfigured()}
        siteEnabled={isOwnerContactConfigured()}
      />
    </>
  );
}
