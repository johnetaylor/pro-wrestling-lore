// One ID per person. Maps all v69 person IDs (curated slugs, archive-person-*, hf-person-*)
// to clean, permanent slugs, applying the identity decisions below.
import { SlugAllocator, slugify } from '../../lib/util.ts';
import type { MigrationLog } from './context.ts';

/** Records whose v69 ID is a character name; the person keeps their own name. */
export const RENAMES: Record<string, string> = {
  'el-grande-americano': 'ludwig-kaiser',
  'rayo-americano': 'pete-dunne',
  'bravo-americano': 'tyler-bate',
};

/** Two v69 records that are one person: the key folds into the value. */
export const MERGES: Record<string, string> = {
  'cruz-montana': 'mike-santana',
  'eli-knight': 'ek-prosper',
};

export const NAMES: Record<string, string> = {
  'ludwig-kaiser': 'Ludwig Kaiser',
  'pete-dunne': 'Pete Dunne',
  'tyler-bate': 'Tyler Bate',
  'mike-santana': 'Mike Santana',
  'ek-prosper': 'EK Prosper',
};

/** Ring names with known boundaries. Dates for other names come from billing evidence. */
export const DATED_RING_NAMES: Record<string, { name: string; from?: string; to?: string; note?: string; sources?: string[] }[]> = {
  'chad-gable': [{ name: 'El Grande Americano', to: '2025-07-06', note: 'The character passed to Ludwig Kaiser on July 7, 2025.' }],
  'ludwig-kaiser': [{ name: 'El Grande Americano', from: '2025-07-07', note: 'Took over the character from Chad Gable.' }],
  'mike-santana': [
    {
      name: 'Cruz Montana',
      note: 'His WWE NXT ring name.',
      sources: ['https://www.postwrestling.com/2026/07/27/mike-santana-reveals-new-nxt-name-cruz-montana/'],
    },
  ],
  'ek-prosper': [
    {
      name: 'EK Prosper',
      note: 'Renamed from Eli Knight in NXT.',
      sources: ['https://www.f4wonline.com/news/wwe-nxts-eli-knight-gets-new-in-ring-name'],
    },
  ],
};

export interface Identity {
  /** legacy id -> canonical id */
  map: Map<string, string>;
  /** canonical id -> legacy ids, in priority order (the record that names the person first) */
  members: Map<string, string[]>;
  pid(legacyId: string): string | undefined;
}

export function buildIdentity(roster: any[], log: MigrationLog): Identity {
  const map = new Map<string, string>();
  const members = new Map<string, string[]>();
  const slugs = new SlugAllocator();
  const add = (legacy: string, id: string) => {
    map.set(legacy, id);
    if (!members.has(id)) members.set(id, []);
    members.get(id)!.push(legacy);
  };

  const curated = roster.filter((p) => !p.id.startsWith('archive-person-') && !p.id.startsWith('hf-person-'));
  const archived = roster.filter((p) => p.id.startsWith('archive-person-') || p.id.startsWith('hf-person-'));

  // Curated slugs keep their IDs, except renamed characters and merged duplicates.
  for (const p of curated) {
    if (MERGES[p.id]) continue;
    const id = RENAMES[p.id] ?? p.id;
    if (!slugs.reserve(id)) {
      log.queue({ kind: 'identity', title: `Two curated records claim the ID "${id}"`, records: [p.id] });
      continue;
    }
    add(p.id, id);
  }
  for (const [from, to] of Object.entries(MERGES)) {
    if (!roster.some((p) => p.id === from)) continue;
    const target = map.get(to);
    if (!target) throw new Error(`Merge target ${to} missing`);
    add(from, target);
  }
  // Archive records get a slug of their name.
  for (const p of archived) {
    const base = slugify(p.name);
    const id = slugs.claim(base);
    if (id !== base) {
      log.queue({
        kind: 'identity',
        title: `Name already used: ${p.name}`,
        detail: `"${base}" belongs to another person record, so this one became "${id}". Check whether they are the same person.`,
        records: [p.id, base],
      });
    }
    add(p.id, id);
  }

  for (const [legacy, id] of Object.entries(RENAMES)) {
    log.queue({
      kind: 'identity-decision',
      title: `${legacy} → ${id}`,
      detail: 'The v69 ID was a character name; the person keeps their own name and the character becomes a dated ring name.',
      records: [legacy],
      decision: 'applied',
    });
  }
  for (const [legacy, id] of Object.entries(MERGES)) {
    log.queue({
      kind: 'identity-decision',
      title: `${legacy} merged into ${id}`,
      detail: 'Two v69 records for one person.',
      records: [legacy, id],
      sources: DATED_RING_NAMES[id]?.flatMap((r) => r.sources ?? []),
      decision: 'applied',
    });
  }

  return { map, members, pid: (legacyId: string) => map.get(legacyId) };
}
