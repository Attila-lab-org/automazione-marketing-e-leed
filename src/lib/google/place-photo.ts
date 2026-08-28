/** Google Places photo resource name: places/{placeId}/photos/{photoId} */
export const GOOGLE_PLACE_PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;

export function isGooglePlacePhotoName(value: string): boolean {
  return GOOGLE_PLACE_PHOTO_NAME.test(value.trim());
}

export function googlePlacePhotoPublicUrl(photoName: string): string {
  return `/api/place-photo?name=${encodeURIComponent(photoName.trim())}`;
}
