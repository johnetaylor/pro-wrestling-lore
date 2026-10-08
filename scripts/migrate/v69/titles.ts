// Championship records with their reigns, plus the lineage diagrams from v69.
import { LINEAGE_PROMOTIONS, LINEAGE_TREES } from './lineage-trees.ts';
import type { Reign, Title } from '../../lib/types.ts';
import { compact, nameKey, slugify, unique } from '../../lib/util.ts';
import type { LegacyIdMaps, MigrationLog } from './context.ts';
import type { Identity } from './identity.ts';

/** Lineage title metadata (v69 championshipLineages ids → title ids). */
const LINEAGE_TITLE: Record<string, string> = {
  wwe: 'wwe-championship',
  wcw: 'wcw-world-heavyweight-championship',
  intl: 'wcw-international-world-heavyweight-championship',
  oldworld: 'world-heavyweight-championship-2002',
  universal: 'wwe-universal-championship',
  ic: 'intercontinental-championship',
  us: 'united-states-championship',
  european: 'wwe-european-championship',
  hardcore: 'wwf-hardcore-championship',
  'north-american': 'wwf-north-american-heavyweight-championship',
  nwa: 'nwa-worlds-heavyweight-championship',
  tag02: 'world-tag-team-championship',
  tag71: 'world-tag-team-championship-1971',
  wcwtag: 'wcw-world-tag-team-championship',
  tag16: 'wwe-tag-team-championship',
  world23: 'world-heavyweight-championship',
  national: 'nwa-national-heavyweight-championship',
  georgia: 'nwa-georgia-heavyweight-championship',
};

/** Featured v69 belts (current main-roster titles). */
const BELT_TITLE: Record<string, string> = {
  'undisputed-wwe': 'wwe-championship',
  'world-heavyweight': 'world-heavyweight-championship',
  intercontinental: 'intercontinental-championship',
  'united-states': 'united-states-championship',
  'wwe-tag-team': 'wwe-tag-team-championship',
  'world-tag-team': 'world-tag-team-championship',
};

const DISPLAY: Record<string, string> = {
  'wwe-championship': 'WWE Championship',
  'world-heavyweight-championship': 'World Heavyweight Championship',
  'world-heavyweight-championship-2002': 'World Heavyweight Championship (2002–2013)',
  'world-tag-team-championship': 'World Tag Team Championship',
  'world-tag-team-championship-1971': 'World Tag Team Championship (1971–2010)',
  'wwe-tag-team-championship': 'WWE Tag Team Championship',
  'intercontinental-championship': 'Intercontinental Championship',
  'united-states-championship': 'United States Championship',
  'wwe-universal-championship': 'Universal Championship',
  'wcw-world-heavyweight-championship': 'WCW World Heavyweight Championship',
  'nwa-worlds-heavyweight-championship': 'NWA Worlds Heavyweight Championship',
};

/**
 * Title id for a reign's championship name. Names come from two sources with different
 * conventions (curated belts, The SmackDown Hotel lineage names with "Old/New" slashes),
 * and a few names belong to different lineages in different eras.
 */
function titleIdFor(rawName: string, start: string): { id: string; rule?: string } {
  const name = rawName.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g, '').trim();
  const k = nameKey(name);
  const wweChampionship = ['undisputedwwechampionship', 'wwechampionship', 'wweworldheavyweightwwechampionship', 'wwfwwechampionship', 'wweworldheavyweightchampionship'];
  if (wweChampionship.includes(k)) return { id: 'wwe-championship', rule: 'WWE Championship spellings' };
  if (k === 'worldheavyweightchampionship') return start < '2014-01-01' ? { id: 'world-heavyweight-championship-2002', rule: 'WHC before 2014 = 2002–2013 lineage' } : { id: 'world-heavyweight-championship', rule: 'WHC from 2023' };
  if (k === 'worldtagteamchampionship') return start < '2011-01-01' ? { id: 'world-tag-team-championship-1971', rule: 'World Tag Team before 2011 = 1971–2010 lineage' } : { id: 'world-tag-team-championship', rule: 'World Tag Team from 2024 = 2002 lineage' };
  if (k === 'wwetagteamchampionship') return start < '2016-08-01' ? { id: 'world-tag-team-championship', rule: 'WWE Tag Team before 2016 = 2002 lineage' } : { id: 'wwe-tag-team-championship', rule: 'WWE Tag Team from 2024 = 2016 lineage' };
  if (['wwerawtagteamchampionship', 'wwewwerawtagteamchampionship', 'wwerawworldtagteamchampionship', 'wwewwerawworldtagteamchampionship'].includes(k))
    return { id: 'world-tag-team-championship', rule: 'Raw tag team names = 2002 lineage' };
  if (['wwesmackdowntagteamchampionship', 'wwesmackdownwwetagteamchampionship'].includes(k)) return { id: 'wwe-tag-team-championship', rule: 'SmackDown tag team names = 2016 lineage' };
  if (['intercontinentalchampionship', 'wweintercontinentalchampionship'].includes(k)) return { id: 'intercontinental-championship', rule: 'Intercontinental spellings' };
  if (['unitedstateschampionship', 'wweunitedstateschampionship'].includes(k)) return { id: 'united-states-championship', rule: 'United States spellings' };
  if (k === 'wweuniversalchampionship') return { id: 'wwe-universal-championship' };
  if (k === 'nwaworldheavyweightchampionship' || k === 'nwaworldsheavyweightchampionship') return { id: 'nwa-worlds-heavyweight-championship', rule: 'NWA World(s) spellings' };
  return { id: slugify(name) };
}

export function buildTitles(d: any, identity: Identity, maps: LegacyIdMaps, log: MigrationLog): { titles: Map<string, Title>; lineages: any } {
  const titles = new Map<string, Title>();
  const ensure = (id: string, name: string): Title => {
    let t = titles.get(id);
    if (!t) {
      t = { id, name: DISPLAY[id] ?? name, names: [], sources: [], reigns: [] };
      titles.set(id, t);
    }
    return t;
  };

  // Featured belts.
  for (const b of d.championships as any[]) {
    const id = BELT_TITLE[b.id] ?? slugify(b.name);
    const t = ensure(id, b.name);
    t.short = b.short;
    t.featured = true;
    t.sources = unique([...t.sources, b.source]);
    t.names = unique([...(t.names ?? []), b.name]);
  }
  // Lineage titles.
  for (const [lid, lt] of Object.entries(d.championshipLineages?.titles ?? {}) as [string, any][]) {
    const id = LINEAGE_TITLE[lid] ?? slugify(lt.name);
    const t = ensure(id, lt.name);
    t.names = unique([...(t.names ?? []), lt.name]);
    t.sources = unique([...t.sources, lt.source]);
  }

  // Reigns, de-duplicated: one team reign often appears once per member.
  const rules = new Map<string, Set<string>>();
  for (const r of d.careerReigns as any[]) {
    const rawName = r.title ?? r.belt;
    const fromBelt = r.belt ? BELT_TITLE[r.belt] : undefined;
    const resolved = fromBelt ? { id: fromBelt, rule: 'featured belt' } : titleIdFor(rawName, r.start);
    if (resolved.rule) {
      if (!rules.has(resolved.rule)) rules.set(resolved.rule, new Set());
      rules.get(resolved.rule)!.add(rawName);
    }
    const t = ensure(resolved.id, rawName.replace(/^[^A-Za-z0-9]+/, ''));
    t.names = unique([...(t.names ?? []), rawName.replace(/^[^A-Za-z0-9]+/, '')]);
    const people = unique<string>((r.people ?? []).map((l: string) => identity.pid(l) ?? l));
    const twin = t.reigns.find((x) => x.start === r.start && (x.people.some((p) => people.includes(p)) || nameKey(x.holder) === nameKey(r.holder)));
    if (twin) {
      twin.people = unique([...twin.people, ...people]);
      twin.legacyIds.push(r.id);
      twin.sources = unique([...twin.sources, r.source, r.extraSource]);
      if (r.curated && !twin.curated) {
        // A curated record outranks a profile-derived one for holder, dates and notes.
        Object.assign(twin, compact({ holder: r.holder, end: r.end, note: r.note, dateNote: r.dateNote, memberStarts: r.memberStarts, curated: true }));
      }
      maps.reigns[r.id] = `${t.id}#${twin.id}`;
      log.count('reign records merged into one reign');
      continue;
    }
    const reign: Reign = compact({
      id: `r${t.reigns.length + 1}`,
      holder: r.holder,
      people,
      start: r.start,
      end: r.end,
      days: r.days,
      ongoing: r.ongoing,
      note: r.note,
      dateNote: r.dateNote,
      memberStarts: r.memberStarts
        ? Object.fromEntries(Object.entries(r.memberStarts).map(([k, v]) => [identity.pid(k) ?? k, v as string]))
        : undefined,
      curated: r.curated || undefined,
      sources: unique<string>([r.source, r.extraSource]),
      legacyIds: [r.id],
    }) as Reign;
    reign.sources ??= [];
    t.reigns.push(reign);
    maps.reigns[r.id] = `${t.id}#${reign.id}`;
  }
  for (const t of titles.values()) {
    t.reigns.sort((a, b) => a.start.localeCompare(b.start));
    t.reigns.forEach((r, i) => {
      const newId = `r${i + 1}`;
      if (r.id === newId) return;
      for (const l of r.legacyIds) maps.reigns[l] = `${t.id}#${newId}`;
      r.id = newId;
    });
  }
  log.queue({
    kind: 'titles',
    title: 'Championship name rules applied',
    detail: 'Reign names from different sources were mapped to one title per lineage. Check these groupings; every other name became its own title.',
    records: [...rules.entries()].map(([rule, names]) => `${rule}: ${[...names].join(' | ')}`),
  });
  const slashed = [...titles.values()].filter((t) => (t.names ?? []).some((n) => n.includes('/')) && !Object.values(BELT_TITLE).includes(t.id) && t.id !== 'wwe-championship');
  if (slashed.length)
    log.queue({
      kind: 'titles',
      title: 'Titles named "Old/New" by the source',
      detail: 'These names describe a renamed title. Each needs to be checked against the plain-named title it may duplicate.',
      records: slashed.map((t) => `${t.id}: ${(t.names ?? []).join(' | ')}`),
    });

  // Lineage diagram data, with title links.
  const L = d.championshipLineages ?? {};
  const lineages = compact({
    asOf: L.asOf,
    coverage: L.coverage,
    titles: Object.fromEntries(Object.entries(L.titles ?? {}).map(([lid, lt]: [string, any]) => [lid, { ...lt, title: LINEAGE_TITLE[lid] ?? slugify(lt.name) }])),
    events: L.events,
    views: Object.fromEntries(
      Object.entries(L.views ?? {}).map(([vid, v]: [string, any]) => [vid, { ...v, title: BELT_TITLE[vid] ?? vid }]),
    ),
    promotions: LINEAGE_PROMOTIONS,
    trees: LINEAGE_TREES,
  });
  return { titles, lineages };
}
