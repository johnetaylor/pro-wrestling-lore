// URL scheme. Every entity has one permanent path.
import type { Show } from '../../scripts/lib/types.ts';

export const personUrl = (id: string) => `/wrestlers/${id}/`;
export const showUrl = (show: Show | string) => `/shows/${typeof show === 'string' ? show : show.id}/`;
export const segmentUrl = (ref: string) => {
  const [showId, key] = ref.split('#');
  return `/shows/${showId}/#${key}`;
};
export const seriesUrl = (seriesId: string) => `/shows/${seriesId}/`;
export const promotionUrl = (promotionId: string) => `/shows/${promotionId}/`;
export const titleUrl = (id: string) => `/titles/${id}/`;
export const storylineUrl = (id: string) => `/storylines/${id}/`;
export const familyUrl = (id: string) => `/families/${id}/`;
