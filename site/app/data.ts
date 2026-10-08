// Loads the data bundles the build writes under /data/<version>/, once each.
import { decode, type DetailBundle, type Model, type ProfileBundle, type StorylineBundle } from './model.ts';

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
