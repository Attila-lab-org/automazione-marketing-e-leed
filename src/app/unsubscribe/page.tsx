import type { Metadata } from 'next';
import UnsubscribeClient from './unsubscribe-client';

export const metadata: Metadata = {
  title: 'Disiscrizione · Atti-Lab',
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <UnsubscribeClient token={token} />;
}
