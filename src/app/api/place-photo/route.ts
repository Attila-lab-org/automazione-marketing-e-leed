import { NextResponse } from 'next/server';
import { isGooglePlacePhotoName } from '@/lib/google/place-photo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves Google Place venue photos without exposing the API key.
 * Public: demos need these images. Name is validated strictly.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name')?.trim() ?? '';
  if (!isGooglePlacePhotoName(name)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const mode = (process.env.GOOGLE_PLACES_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode !== 'live' || !apiKey) {
    return new NextResponse('Not found', { status: 404 });
  }

  const mediaUrl = new URL(`https://places.googleapis.com/v1/${name}/media`);
  mediaUrl.searchParams.set('maxHeightPx', '1600');
  mediaUrl.searchParams.set('maxWidthPx', '1600');
  mediaUrl.searchParams.set('skipHttpRedirect', 'true');

  const upstream = await fetch(mediaUrl.toString(), {
    headers: { 'X-Goog-Api-Key': apiKey },
    cache: 'force-cache',
  });
  if (!upstream.ok) {
    return new NextResponse('Not found', { status: 404 });
  }

  const body = (await upstream.json()) as { photoUri?: string };
  if (!body.photoUri || !/^https:\/\//i.test(body.photoUri)) {
    return new NextResponse('Not found', { status: 404 });
  }

  return NextResponse.redirect(body.photoUri, {
    status: 302,
    headers: {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
