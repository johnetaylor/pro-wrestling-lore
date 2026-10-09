// Loads the data bundles the build writes under /data/<version>/, once each.
import { decode, type CalendarBundle, type DetailBundle, type FamilyBundle, type Model, type ProfileBundle, type RatingsBundle, type ShowDetailBundle, type StorylineBundle, type TitleBundle } from './model.ts';

let base = '';
const cache = new Map<string, Promise<unknown>>();

export function setDataBase(url: string) {
  base = url.endsWith('/') ? url : `${url}/`;
}

function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(base + path).then((r) => {
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export async function loadModel(): Promise<Model> {
  return decode(await get('core.json'));
}

export const loadDetails = (year: string) => get<DetailBundle>(`details/${year}.json`).catch(() => ({}) as DetailBundle);
export const loadProfile = async (id: string): Promise<ProfileBundle | null> => (await get<Record<string, ProfileBundle>>('profiles.json'))[id] ?? null;
export const loadStorylines = () => get<StorylineBundle>('storylines.json');
export const loadShowDetails = (year: string) => get<ShowDetailBundle>(`shows/${year}.json`).catch(() => ({}) as ShowDetailBundle);
export const loadTitles = () => get<TitleBundle>('titles.json');
export const loadFamilies = () => get<FamilyBundle>('families.json');
export const loadCalendar = () => get<CalendarBundle>('calendar.json');
export const loadRatings = () => get<RatingsBundle>('ratings.json');
