// Loads data/ into memory with the indexes pages need.
import { join } from 'node:path';
import type { Family, Person, Promotion, Reign, Segment, Series, Show, Storyline, Title } from '../../scripts/lib/types.ts';
import { listFiles, nameKey, readJson } from '../../scripts/lib/util.ts';

export interface Appearance {
  show: Show;
  seg: Segment;
  role: 'competitor' | 'involved';
  outcome?: string;
}

export interface SiteData {
  promotions: Map<string, Promotion>;
  series: Map<string, Series>;
  people: Map<string, Person>;
  shows: Map<string, Show>;
  showsBySeries: Map<string, Show[]>;
  titles: Map<string, Title>;
  storylines: Map<string, Storyline>;
  families: Map<string, Family>;
  appearances: Map<string, Appearance[]>;
  reignsByPerson: Map<string, { title: Title; reign: Reign }[]>;
  storylinesByPerson: Map<string, Storyline[]>;
  familiesByPerson: Map<string, Family[]>;
  /** nameKey of every name and ring name → person ids, for linking free-text names. */
  peopleByName: Map<string, string[]>;
  calendar: any;
  /** Title lineage diagrams: lineage titles, events, views and the title-history trees. */
  lineages: any;
  ratings: any;
  segmentCount: number;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}

/**
 * v69 text uses " · " as an all-purpose separator ("WWF · first run", "Hulk Hogan · promo /
 * interview"). Pages show a comma instead; the data keeps its text until the Phase 3 cleanup.
 */
export function tidy<T extends string | undefined>(text: T): T {
  return (text === undefined ? text : text.replace(/\s+·\s+/g, ', ')) as T;
}

function tidyAll(site: Omit<SiteData, 'appearances'> & Partial<SiteData>) {
  for (const s of site.shows.values()) {
    s.name = tidy(s.name);
    for (const g of s.segments) {
      g.title = tidy(g.title);
      g.result = tidy(g.result);
      g.context = tidy(g.context);
      g.matchType = tidy(g.matchType);
    }
  }
  for (const s of site.series.values()) s.name = tidy(s.name);
  for (const t of site.titles.values()) {
    t.name = tidy(t.name);
    t.names = t.names?.map((n) => tidy(n));
  }
  for (const p of site.people.values()) {
    p.awards = p.awards?.map((a) => tidy(a));
    p.titleSummary = p.titleSummary?.map((x) => ({ ...x, name: tidy(x.name) }));
    const c = p.curated;
    if (!c) continue;
    c.promotionPeriods = c.promotionPeriods?.map((x) => ({ ...x, fullName: tidy(x.fullName), note: tidy(x.note) }));
    for (const list of Object.values(c.relationships ?? {})) for (const r of list ?? []) Object.assign(r, { name: tidy(r.name), promotions: tidy(r.promotions), note: tidy(r.note) });
    for (const a of [...(c.profile?.associates ?? []), ...(c.profile?.guestCornermen ?? [])]) Object.assign(a, { meta: tidy(a.meta), note: tidy(a.note) });
    for (const m of c.signatureMatches ?? []) Object.assign(m, { show: tidy(m.show), title: tidy(m.title) });
  }
  for (const f of site.families.values()) {
    f.name = tidy(f.name);
    for (const b of f.branches) b.name = tidy(b.name);
  }
  for (const st of site.storylines.values()) {
    st.title = tidy(st.title);
    for (const c of st.chapters) Object.assign(c, { title: tidy(c.title), show: tidy(c.show) });
  }
}

export function loadSite(dir = 'data'): SiteData {
  const promotions = new Map(readJson<Promotion[]>(join(dir, 'promotions.json')).map((p) => [p.id, p]));
  const series = new Map(readJson<Series[]>(join(dir, 'series.json')).map((s) => [s.id, s]));
  const people = new Map<string, Person>();
  const peopleByName = new Map<string, string[]>();
  for (const f of listFiles(join(dir, 'people'))) {
    const p = readJson<Person>(join(dir, 'people', f));
    people.set(p.id, p);
    for (const key of new Set([p.name, ...p.ringNames.map((r) => r.name)].map(nameKey))) if (key) push(peopleByName, key, p.id);
  }
  const shows = new Map<string, Show>();
  const showsBySeries = new Map<string, Show[]>();
  const appearances = new Map<string, Appearance[]>();
  let segmentCount = 0;
  for (const f of listFiles(join(dir, 'shows'))) {
    const s = readJson<Show>(join(dir, 'shows', f));
    shows.set(s.id, s);
    push(showsBySeries, s.series, s);
    for (const seg of s.segments) {
      segmentCount++;
      for (const p of seg.participants) push(appearances, p.person, { show: s, seg, role: p.role, outcome: p.outcome });
    }
  }
  for (const list of showsBySeries.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  for (const list of appearances.values()) list.sort((a, b) => a.show.date.localeCompare(b.show.date) || a.seg.key.localeCompare(b.seg.key));

  const titles = new Map<string, Title>();
  const reignsByPerson = new Map<string, { title: Title; reign: Reign }[]>();
  for (const f of listFiles(join(dir, 'titles'))) {
    const t = readJson<Title>(join(dir, 'titles', f));
    titles.set(t.id, t);
    for (const r of t.reigns) for (const p of r.people) push(reignsByPerson, p, { title: t, reign: r });
  }
  for (const list of reignsByPerson.values()) list.sort((a, b) => a.reign.start.localeCompare(b.reign.start));

  const storylines = new Map<string, Storyline>();
  const storylinesByPerson = new Map<string, Storyline[]>();
  for (const f of listFiles(join(dir, 'storylines'))) {
    const s = readJson<Storyline>(join(dir, 'storylines', f));
    storylines.set(s.id, s);
    const involved = new Set([...(s.people ?? []), ...s.chapters.flatMap((c) => c.people ?? [])]);
    for (const p of involved) push(storylinesByPerson, p, s);
  }
  const families = new Map<string, Family>();
  const familiesByPerson = new Map<string, Family[]>();
  for (const f of listFiles(join(dir, 'families'))) {
    const fam = readJson<Family>(join(dir, 'families', f));
    families.set(fam.id, fam);
    for (const m of fam.members) if (m.person) push(familiesByPerson, m.person, fam);
  }
  const site: SiteData = {
    promotions,
    series,
    people,
    shows,
    showsBySeries,
    titles,
    storylines,
    families,
    appearances,
    reignsByPerson,
    storylinesByPerson,
    familiesByPerson,
    peopleByName,
    // The newest year's calendar.
    calendar: readJson(join(dir, 'calendar', listFiles(join(dir, 'calendar')).sort().at(-1)!)),
    lineages: readJson(join(dir, 'title-lineages.json')),
    ratings: readJson(join(dir, 'ratings.json')),
    segmentCount,
  };
  tidyAll(site);
  return site;
}
