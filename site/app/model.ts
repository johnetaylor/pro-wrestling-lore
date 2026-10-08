// The explorer's data model: compact bundles written at build time, decoded in the browser.
// Pure module (no DOM, no Node APIs), so the build can use the same decoder.

export const DAY = 86400000;

/** Moment kinds, as stored in the bundle. */
export const KIND = { match: 0, title: 1, promo: 2, appearance: 3 } as const;
export type KindCode = 0 | 1 | 2 | 3;

/** Outcome codes, one character per competitor: win, loss, DQ loss, count-out loss, no contest, draw, unknown. */
export type OutcomeCode = 'w' | 'l' | 'q' | 'c' | 'n' | 'd' | '-';

// ---------- Bundle (what the build writes) ----------

export interface CoreBundle {
  v: 1;
  asOf: string; // the archive's "today"
  first: string; // earliest date anything is drawn
  promotions: [id: string, name: string, fullName: string][];
  /** flags: 1 = on the curated roster, 2 = has a full career profile (curated content) */
  people: [id: string, name: string, aliases: string, flags: number, brands: string][];
  /** shows series: id, promotion, name, kind (weekly, ple, special, event, arena), first year, color, note, source */
  series: [id: string, promotion: number, name: string, kind: string, start: number, color: string, note: string, source: string][];
  /** flags: 1 = pay-per-view or special, 2 = dated by taping; series is an index into series, or -1 */
  shows: [id: string, label: string, date: string, promotion: number, flags: number, series: number, name: string][];
  /** competitors and involved are people indexes; outcomes line up with competitors */
  moments: [show: number, key: string, kind: KindCode, title: string, competitors: number[], involved: number[], outcomes: string][];
  titles: [id: string, name: string, short: string][];
  /** end '' = current; starts holds per-member start dates when members joined late; name is the
   * title's name in the reign's era ('' when it is the current name), e.g. WWF Championship */
  reigns: [title: number, id: string, people: number[], start: string, end: string, holder: string, starts: Record<number, string> | 0, name: string][];
  /** curated promotion runs: person, short name, promotion id or '', start, end ('' = ongoing), full name, note, sources */
  periods: [person: number, name: string, promotion: string, start: string, end: string, fullName: string, note: string, sources: string[]][];
  /** profile facts the timeline needs without loading a profile: debut, debut precision, career end, end label, display-through, status */
  spans: [person: number, debut: string, precision: string, end: string, endLabel: string, through: string, status: string][];
  /** career totals from CAGEMATCH: person, matches, wins, losses, draws, source */
  totals: [person: number, matches: number, wins: number, losses: number, draws: number, source: string][];
}

/** Per-year details: result, context, match type, duration, sources, rating sources, position on the card (0 = unknown), others on screen. */
export type DetailRow = [
  result: string,
  context: string,
  matchType: string,
  duration: string,
  sources: string[],
  ratings: [provider: string, value: number, unit: string, url: string, votes: number][],
  order: number,
  guests: string,
];
export type DetailBundle = Record<string, DetailRow>;

/** Per-year show details: taping date, coverage note, where to watch, notes, sources, and whether the card is numbered. */
export type ShowDetailRow = [recorded: string, coverage: string, watch: string, watchLabel: string, notes: string[], sources: string[], numbered: 0 | 1];
export type ShowDetailBundle = Record<string, ShowDetailRow>;

export interface LineageNode {
  id: string;
  track: string;
  name: string;
  type?: string;
  event?: string;
  events?: string[];
  caption?: string;
  note?: string;
  edge?: string;
  parents?: LineageNode[];
}

/** Championship facts beyond the core bundle: promotion, featured, sources, other names; and the lineage diagrams. */
export interface TitleBundle {
  v: 1;
  titles: Record<string, [promotion: string, featured: 0 | 1, sources: string[], names: string[]]>;
  lineage: {
    asOf: string;
    coverage: string;
    titles: Record<string, { id: string; name: string; start: string; end?: string; first?: string; source?: string; note?: string; names?: string; title: string; precision?: string; originLabel?: string }>;
    events: { id: string; date: string; kind: string; track: string; label: string; text: string; sources: string[]; from?: string; to?: string; precision?: string }[];
    views: Record<string, { main: string; tracks: string[]; summary: string; title: string }>;
    promotions: Record<string, { label: string; tone: string; text: string }>;
    trees: Record<string, { intro: string; notes: string[]; background: string[]; root: LineageNode; outputs?: LineageNode[] }>;
  };
}

export interface FamilyBundle {
  v: 1;
  families: {
    id: string;
    name: string;
    description?: string;
    branches: { id: string; name: string; note?: string }[];
    members: { id: string; name: string; person?: string; branch?: string; note?: string; aliases?: string[]; source?: string; layout?: { x: number; y: number } }[];
    links: { a: string; b: string; type: string; label?: string; source?: string }[];
    sources: Record<string, { label: string; url: string }>;
  }[];
}

export interface CalendarEvent {
  id: string;
  promotion: string;
  date: string;
  end?: string;
  name: string;
  series?: string;
  kind: string;
  status?: string;
  venue?: string;
  city?: string;
  time?: string;
  note?: string;
  source: string;
  recap?: string;
  recaps?: { url: string; label: string }[];
  watch?: string;
  watchLabel?: string;
  watchNote?: string;
  show?: string;
}

export interface CalendarBundle {
  v: 1;
  year: number;
  checked: string;
  promotions: { id: string; name: string; fullName: string; schedule: string; watch?: string }[];
  events: CalendarEvent[];
  weeklyEvents: CalendarEvent[];
  viewing: Record<string, string>;
  viewingGuide: { title: string; text: string; links: { label: string; url: string }[] }[];
}

export interface StorylineBundle {
  v: 1;
  storylines: {
    id: string;
    promotion: string;
    title: string;
    summary: string;
    brands: string[];
    cast: string[];
    people: number[];
    start: string;
    end: string; // '' while the story is still going
    source: string;
    /** kind: 'match', 'title' or 'story'; moment links to the archived segment when there is one */
    chapters: { id: string; date: string; title: string; show: string; moment: string; kind: string; ple: boolean; result: string; context: string; sources: string[]; people: number[] }[];
  }[];
  promotions: { id: string; name: string; color: string; note: string; historical: boolean }[];
}

export interface Relationship {
  name: string;
  promotions?: string;
  period?: string;
  note?: string;
  source?: string;
}

export interface Associate {
  name: string;
  meta?: string;
  note?: string;
}

/** Everything the career explorer shows about one person, loaded when it opens. */
export interface ProfileBundle {
  id: string;
  name: string;
  ringNames: { name: string; from?: string; to?: string; first?: string; last?: string }[];
  intro?: string;
  inBrief?: string;
  promotions?: string[];
  titleSummary?: { name: string; count: number; source?: string }[];
  titleTotal?: number;
  scopes?: { titles?: string; reigns?: string; record?: string };
  awards?: string[];
  externalTotals?: { provider: string; matches?: number; wins?: number; losses?: number; draws?: number; source?: string; crawl?: string; note?: string };
  profile?: {
    intro?: string;
    inBrief?: string;
    trainedBy?: { text: string; links?: { label: string; url: string }[] };
    signatureMoves?: { moves: string[]; note?: string; links?: { label: string; url: string }[] };
    associates?: Associate[];
    guestCornermen?: Associate[];
    links?: { label: string; url: string }[];
  };
  relationships?: { feuds?: Relationship[]; factions?: Relationship[]; teams?: Relationship[] };
  signatureMatches?: { segment?: string; date: string; show: string; title: string; why: string; source?: string }[];
  sources: string[];
}

// ---------- Model (what the app works with) ----------

export interface Person {
  i: number;
  id: string;
  name: string;
  aliases: string[];
  roster: boolean;
  curated: boolean;
  brands: string[];
  search: string; // normalized name and aliases
  sort: string;
}

export interface SeriesRef {
  i: number;
  id: string;
  promotion: string;
  name: string;
  kind: string;
  start: number;
  color: string;
  note: string;
  source: string;
}

export interface ShowRef {
  i: number;
  id: string;
  label: string;
  /** The show's own name, e.g. "WrestleMania III" (label adds the promotion for context). */
  name: string;
  date: string;
  day: number;
  promotion: string;
  series: SeriesRef | null;
  ple: boolean;
  recorded: boolean;
  /** Indexed matches and segments, in running order. */
  moments: Moment[];
}

export interface Moment {
  i: number;
  id: string; // '<show id>#<key>'
  show: ShowRef;
  key: string;
  date: string;
  day: number;
  kind: KindCode;
  title: string;
  people: number[];
  involved: number[];
  outcomes: string;
}

export interface Reign {
  title: TitleRef;
  /** The title's name when this reign began, and a short form for tight spaces. */
  name: string;
  short: string;
  id: string; // reign id within the title, e.g. 'r12'
  people: number[];
  start: string;
  end: string; // '' = ongoing
  holder: string;
  starts: Record<number, string>;
}

export interface TitleRef {
  i: number;
  id: string;
  name: string;
  short: string;
}

export interface Period {
  person: number;
  name: string;
  promotion: string;
  start: string;
  end: string;
  fullName: string;
  note: string;
  sources: string[];
}

export interface Span {
  debut: string;
  precision: string;
  end: string;
  endLabel: string;
  through: string;
  status: string;
}

export interface Model {
  asOf: string;
  first: string;
  promotions: Map<string, { id: string; name: string; fullName: string }>;
  people: Person[];
  byId: Map<string, Person>;
  series: SeriesRef[];
  seriesById: Map<string, SeriesRef>;
  shows: ShowRef[];
  showById: Map<string, ShowRef>;
  /** Shows of each series, by date. */
  showsBySeries: Map<SeriesRef, ShowRef[]>;
  moments: Moment[];
  momentById: Map<string, Moment>;
  /** every moment a person is in (competing or involved), sorted by date */
  byPerson: Moment[][];
  titles: TitleRef[];
  reigns: Reign[];
  reignsByPerson: Reign[][];
  periodsByPerson: Map<number, Period[]>;
  spans: Map<number, Span>;
  totals: Map<number, { matches: number; wins: number; losses: number; draws: number; source: string }>;
}

export const dayNum = (iso: string) => Math.floor(Date.parse(iso.length === 4 ? `${iso}-07-01` : iso.length === 7 ? `${iso}-15` : iso) / DAY);
export const isoDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "The Rock" sorts under R; accents are ignored. */
export function sortKey(name: string): string {
  return normalize(name).replace(/^(the|el|la) /, '');
}

export function decode(b: CoreBundle): Model {
  const promotions = new Map(b.promotions.map(([id, name, fullName]) => [id, { id, name, fullName }]));
  const people: Person[] = b.people.map(([id, name, aliases, flags, brands], i) => {
    const list = aliases ? aliases.split('|') : [];
    return { i, id, name, aliases: list, roster: !!(flags & 1), curated: !!(flags & 2), brands: brands ? brands.split('|') : [], search: normalize([name, ...list].join(' ')), sort: sortKey(name) };
  });
  const promoIds = b.promotions.map((p) => p[0]);
  const series: SeriesRef[] = b.series.map(([id, promotion, name, kind, start, color, note, source], i) => ({ i, id, promotion: promoIds[promotion], name, kind, start, color, note, source }));
  const shows: ShowRef[] = b.shows.map(([id, label, date, promotion, flags, s, name], i) => ({
    i,
    id,
    label,
    name,
    date,
    day: dayNum(date),
    promotion: promoIds[promotion],
    series: s >= 0 ? series[s] : null,
    ple: !!(flags & 1),
    recorded: !!(flags & 2),
    moments: [],
  }));
  const showsBySeries = new Map<SeriesRef, ShowRef[]>();
  for (const sh of shows) {
    if (!sh.series) continue;
    if (!showsBySeries.has(sh.series)) showsBySeries.set(sh.series, []);
    showsBySeries.get(sh.series)!.push(sh);
  }
  const byPerson: Moment[][] = people.map(() => []);
  const moments: Moment[] = b.moments.map(([s, key, kind, title, competitors, involved, outcomes], i) => {
    const show = shows[s];
    const m: Moment = { i, id: `${show.id}#${key}`, show, key, date: show.date, day: show.day, kind, title, people: competitors, involved, outcomes };
    show.moments.push(m);
    for (const p of competitors) byPerson[p].push(m);
    for (const p of involved) byPerson[p].push(m);
    return m;
  });
  for (const list of byPerson) list.sort((a, b) => a.day - b.day || a.i - b.i);
  const titles: TitleRef[] = b.titles.map(([id, name, short], i) => ({ i, id, name, short }));
  const reignsByPerson: Reign[][] = people.map(() => []);
  const reigns: Reign[] = b.reigns.map(([t, id, ps, start, end, holder, starts, name]) => {
    const title = titles[t];
    const era = name || title.name;
    const short = name ? name.replace(/ Championship.*$/, '') : title.short;
    const r: Reign = { title, name: era, short, id, people: ps, start, end, holder, starts: starts || {} };
    for (const p of ps) reignsByPerson[p].push(r);
    return r;
  });
  for (const list of reignsByPerson) list.sort((a, b) => a.start.localeCompare(b.start));
  const periodsByPerson = new Map<number, Period[]>();
  for (const [person, name, promotion, start, end, fullName, note, sources] of b.periods) {
    if (!periodsByPerson.has(person)) periodsByPerson.set(person, []);
    periodsByPerson.get(person)!.push({ person, name, promotion, start, end, fullName, note, sources });
  }
  const spans = new Map<number, Span>(b.spans.map(([p, debut, precision, end, endLabel, through, status]) => [p, { debut, precision, end, endLabel, through, status }]));
  const totals = new Map(b.totals.map(([p, matches, wins, losses, draws, source]) => [p, { matches, wins, losses, draws, source }]));
  return {
    asOf: b.asOf,
    first: b.first,
    promotions,
    people,
    byId: new Map(people.map((p) => [p.id, p])),
    series,
    seriesById: new Map(series.map((x) => [x.id, x])),
    shows,
    showById: new Map(shows.map((s) => [s.id, s])),
    showsBySeries,
    moments,
    momentById: new Map(moments.map((m) => [m.id, m])),
    byPerson,
    titles,
    reigns,
    reignsByPerson,
    periodsByPerson,
    spans,
    totals,
  };
}

/** When a member joined a reign after it began, their own start. */
export const memberStart = (r: Reign, person: number) => r.starts[person] ?? r.start;
