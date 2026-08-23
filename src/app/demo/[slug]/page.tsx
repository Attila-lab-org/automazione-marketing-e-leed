import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RestaurantPremium from "@/components/templates/restaurant-premium";
import { loadDemoBySlug } from "@/lib/demos/load";
import { createAdminSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const demo = await load(slug);
  const title = demo?.data.branding.business_name ?? "Demo";
  return {
    title,
    robots: { index: false, follow: false },
  };
}

export default async function PublicDemoPage({ params }: PageProps) {
  const { slug } = await params;
  const demo = await load(slug);
  if (!demo) notFound();

  return (
    <>
      <meta name="robots" content="noindex,nofollow" />
      <RestaurantPremium data={demo.data} />
    </>
  );
}
