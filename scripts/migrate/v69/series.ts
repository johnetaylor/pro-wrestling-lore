// Promotions and show series for the v69 migration.
import type { Promotion, Series, SeriesKind } from '../../lib/types.ts';
import { slugify } from '../../lib/util.ts';

/** Promotion names as written in v69 records → promotion id. */
const PROMOTION_ALIASES: Record<string, string> = {
  wwwf: 'wwe',
  wwf: 'wwe',
  wwe: 'wwe',
  nxt: 'wwe',
  wcw: 'wcw',
  ecw: 'ecw',
  tna: 'tna',
  impact: 'tna',
  aew: 'aew',
  njpw: 'njpw',
  aaa: 'aaa',
  roh: 'roh',
  cmll: 'cmll',
  stardom: 'stardom',
  awa: 'awa',
  independent: 'indy',
  indy: 'indy',
};

export function promotionFromText(text: string | undefined): string | null {
  if (!text) return null;
  return PROMOTION_ALIASES[text.trim().toLowerCase()] ?? null;
}

/** v69 show families folded into a broader series. Everything else maps one to one. */
const FAMILY_TO_SERIES: Record<string, string> = {
  'money-in-the-bank-18': 'wwe/money-in-the-bank',
  'money-in-the-bank-part-1': 'wwe/money-in-the-bank',
  'tlc-tables-ladders-and-chairs': 'wwe/tlc',
  'tlc-tables-ladders-chairs-and-stairs': 'wwe/tlc',
  'elimination-chamber-perth': 'wwe/elimination-chamber',
  'backlash-france': 'wwe/backlash',
  'clash-at-the-castle-scotland': 'wwe/clash-at-the-castle',
  'survivor-series-wargames': 'wwe/survivor-series',
  'worlds-collide-los-angeles': 'wwe/worlds-collide',
  'worlds-collide-las-vegas': 'wwe/worlds-collide',
  'vengeance-night-of-champions': 'wwe/night-of-champions',
  'ecw-one-night-stand': 'wwe/one-night-stand',
  'nxt-countdown-to-stand-deliver': 'wwe/nxt-stand-deliver',
  'sunday-night-s-main-event': 'wwe/sunday-nights-main-event',
  'sunday-night-s-main-event-countdown': 'wwe/sunday-nights-main-event',
  'new-year-s-revolution': 'wwe/new-years-revolution',
  'aaa-triplemania-34': 'aaa/triplemania',
  'aaa-nxt-worlds-collide': 'aaa/worlds-collide',
  'njpw-wrestle-kingdom-20': 'njpw/wrestle-kingdom',
  'njpw-new-japan-cup-final': 'njpw/new-japan-cup',
  'njpw-g1-climax-36': 'njpw/g1-climax',
  'njpw-g1-climax-final': 'njpw/g1-climax',
  'njpw-54th-anniversary': 'njpw/anniversary',
  'stardom-5-star-gp-final': 'stardom/5-star-grand-prix',
  'cmll-93-aniversario': 'cmll/aniversario',
};

/** Names for series that fold several v69 families together, or that v69 never listed. */
const SERIES_NAMES: Record<string, string> = {
  'wwe/in-your-house': 'In Your House',
  'wwe/money-in-the-bank': 'Money in the Bank',
  'wwe/tlc': 'TLC: Tables, Ladders & Chairs',
  'wwe/worlds-collide': 'Worlds Collide',
  'wwe/one-night-stand': 'One Night Stand',
  'wwe/nxt-stand-deliver': 'NXT Stand & Deliver',
  'wwe/sunday-nights-main-event': 'Sunday Night’s Main Event',
  'wwe/new-years-revolution': 'New Year’s Revolution',
  'wwe/clash-at-the-castle': 'Clash at the Castle',
  'aaa/triplemania': 'Triplemanía',
  'aaa/worlds-collide': 'AAA Worlds Collide',
  'njpw/wrestle-kingdom': 'Wrestle Kingdom',
  'njpw/new-japan-cup': 'New Japan Cup',
  'njpw/g1-climax': 'G1 Climax',
  'njpw/anniversary': 'NJPW Anniversary Show',
  'stardom/5-star-grand-prix': '5★Star Grand Prix',
  'cmll/aniversario': 'CMLL Aniversario',
  'wcw/nitro': 'Monday Nitro',
  'wcw/thunder': 'Thunder',
  'wcw/saturday-night': 'WCW Saturday Night',
  'wcw/main-event': 'WCW Main Event',
  'wwe/championship-wrestling': 'WWF Championship Wrestling',
  'wwe/superstars': 'Superstars of Wrestling',
  'wwe/wrestling-challenge': 'Wrestling Challenge',
  'wwe/all-star-wrestling': 'All Star Wrestling',
  'wwe/prime-time-wrestling': 'Prime Time Wrestling',
  'wwe/tuesday-night-titans': 'Tuesday Night Titans',
  'wwe/the-main-event': 'The Main Event',
  'wwe/wrestling-at-the-chase': 'Wrestling at the Chase',
  'tna/impact': 'Impact',
  'tna/tours': 'TNA tour events',
  'tna/bound-for-glory': 'Bound for Glory',
  'aew/full-gear': 'Full Gear',
  'aew/double-or-nothing': 'Double or Nothing',
  'njpw/iwgp-league': 'IWGP League',
  'wwe/arena-cards': 'Arena cards',
  'awa/arena-cards': 'Arena cards',
};

const WEEKLY = new Set([
  'wwe/raw',
  'wwe/smackdown',
  'wwe/nxt',
  'aew/dynamite',
  'aew/collision',
  'aaa/lucha-libre-aaa',
  'wcw/nitro',
  'wcw/thunder',
  'wcw/saturday-night',
  'wcw/main-event',
  'wwe/championship-wrestling',
  'wwe/superstars',
  'wwe/wrestling-challenge',
  'wwe/all-star-wrestling',
  'wwe/prime-time-wrestling',
  'wwe/tuesday-night-titans',
  'wwe/wrestling-at-the-chase',
  'wwe/all-american-wrestling',
  'tna/impact',
  'aew/rampage',
]);
const SPECIAL = new Set([
  'wwe/snme',
  'wwe/sunday-nights-main-event',
  'wwe/the-main-event',
  'wwe/the-wrestling-classic',
  'wwe/the-war-to-settle-the-score',
  'aew/fyter-fest',
  'aew/fight-for-the-fallen',
]);

export function seriesKind(id: string, fallback: SeriesKind = 'ple'): SeriesKind {
  if (WEEKLY.has(id)) return 'weekly';
  if (SPECIAL.has(id)) return 'special';
  if (id.endsWith('/arena-cards')) return 'arena';
  return fallback;
}

/** Series id for a v69 show family. */
export function seriesForFamily(family: string, promotion: string): string {
  if (FAMILY_TO_SERIES[family]) return FAMILY_TO_SERIES[family];
  if (family.startsWith('in-your-house')) return 'wwe/in-your-house';
  const prefix = `${promotion}-`;
  const slug = family.startsWith(prefix) ? family.slice(prefix.length) : family;
  return `${promotion}/${slug}`;
}

interface LegacyCatalogEntry {
  id: string;
  name: string;
  start?: number;
  source?: string;
  note?: string;
  color?: string;
  promotion: string;
}

export interface SeriesRegistry {
  promotions: Map<string, Promotion>;
  series: Map<string, Series>;
  ensure(id: string, opts?: { name?: string; kind?: SeriesKind }): Series;
}

export function buildRegistry(d: any): SeriesRegistry {
  const promotions = new Map<string, Promotion>();
  for (const p of d.showsUI.promotions as any[]) {
    promotions.set(p.id, { id: p.id, name: p.name, color: p.color, historical: p.historical || undefined });
  }
  const extra: Promotion[] = [
    { id: 'awa', name: 'AWA', fullName: 'American Wrestling Association', historical: true },
    { id: 'indy', name: 'Independent', fullName: 'Independent promotions' },
  ];
  for (const p of extra) if (!promotions.has(p.id)) promotions.set(p.id, p);
  const aliases: Record<string, string[]> = { wwe: ['WWWF', 'WWF', 'WWE'], tna: ['TNA', 'Impact Wrestling'] };
  for (const [id, list] of Object.entries(aliases)) {
    const p = promotions.get(id);
    if (p) p.aliases = list;
  }
  for (const p of d.calendarData.promotions as any[]) {
    const target = promotions.get(promotionFromText(p.id) ?? p.id);
    if (!target) continue;
    if (p.id === 'nxt') continue; // NXT is a WWE brand; its calendar links stay in the calendar file
    target.fullName ??= p.fullName;
    target.schedule ??= p.schedule;
    target.watch ??= p.watch;
  }
  for (const p of d.storyPromotions as any[]) {
    const target = promotions.get(p.id);
    if (!target) continue;
    target.storylineNote = p.note;
    target.storylineColor = p.color;
  }

  const series = new Map<string, Series>();
  const ensure = (id: string, opts: { name?: string; kind?: SeriesKind } = {}): Series => {
    let s = series.get(id);
    if (!s) {
      const promotion = id.split('/')[0];
      s = {
        id,
        promotion,
        name: opts.name ?? SERIES_NAMES[id] ?? id.split('/')[1],
        kind: opts.kind ?? seriesKind(id),
      };
      series.set(id, s);
    }
    return s;
  };

  for (const entry of d.showsUI.catalog as LegacyCatalogEntry[]) {
    const id = seriesForFamily(entry.id, entry.promotion);
    const folded = id !== `${entry.promotion}/${entry.id.replace(`${entry.promotion}-`, '')}` || Boolean(SERIES_NAMES[id]);
    const s = ensure(id, { name: folded ? SERIES_NAMES[id] ?? entry.name : entry.name });
    s.legacyFamilies = [...(s.legacyFamilies ?? []), entry.id];
    if (!folded) {
      s.start ??= entry.start;
      s.color ??= entry.color;
      s.note ??= entry.note;
      if (entry.source) s.sources = [...(s.sources ?? []), entry.source];
    } else {
      if (entry.start && (!s.start || entry.start < s.start)) s.start = entry.start;
      s.color ??= entry.color;
    }
  }
  return { promotions, series, ensure };
}

interface Resolved {
  series: string;
  name?: string;
  kind?: SeriesKind;
}

/** Series for a show named only in a career record (no v69 show record). */
export function resolveSeriesFromText(showText: string, promotion: string, categoryHint?: string): Resolved {
  const t = showText.toLowerCase();
  const rules: [RegExp, string, SeriesKind?][] = [
    [/nitro/, 'wcw/nitro'],
    [/thunder/, 'wcw/thunder'],
    [/wcw saturday night/, 'wcw/saturday-night'],
    [/wcw main event/, 'wcw/main-event'],
    [/saturday night'?s main event|saturday night’s main event/, 'wwe/snme'],
    [/the main event/, 'wwe/the-main-event'],
    [/championship wrestling/, 'wwe/championship-wrestling'],
    [/superstars/, 'wwe/superstars'],
    [/wrestling challenge/, 'wwe/wrestling-challenge'],
    [/all star wrestling/, 'wwe/all-star-wrestling'],
    [/prime time wrestling/, 'wwe/prime-time-wrestling'],
    [/tuesday night titans/, 'wwe/tuesday-night-titans'],
    [/wrestling at the chase/, 'wwe/wrestling-at-the-chase'],
    [/maximum impact tour/, 'tna/tours', 'event'],
    [/impact/, 'tna/impact'],
    [/bound for glory/, 'tna/bound-for-glory', 'ple'],
    [/wrestlemania/, 'wwe/wrestlemania'],
    [/royal rumble/, 'wwe/royal-rumble'],
    [/survivor series/, 'wwe/survivor-series'],
    [/summerslam/, 'wwe/summerslam'],
    [/\braw\b/, 'wwe/raw'],
    [/smackdown/, 'wwe/smackdown'],
    [/\bnxt\b/, 'wwe/nxt'],
    [/double or nothing/, 'aew/double-or-nothing', 'ple'],
    [/full gear/, 'aew/full-gear', 'ple'],
    [/dynamite/, 'aew/dynamite'],
    [/iwgp league/, 'njpw/iwgp-league', 'event'],
    [/\bcard\b|madison square garden/, `${promotion}/arena-cards`, 'arena'],
  ];
  for (const [re, series, kind] of rules) {
    if (!re.test(t)) continue;
    // WCW pay-per-views that share a name with later WWE events stay with WCW.
    if (series.startsWith('wwe/') && promotion !== 'wwe' && !/raw|smackdown|nxt|wrestlemania|royal rumble|survivor series|summerslam|saturday night/.test(t)) continue;
    return { series, kind };
  }
  const base = showText
    .replace(/^(wwf|wwe|wcw|tna|aew|njpw|roh|ecw|awa)\s+/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+·.*$/, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b[ivx]+\b$/i, '')
    .trim();
  const slug = slugify(base) || 'events';
  const id = `${promotion}/${slug}`;
  const kind: SeriesKind = WEEKLY.has(id) ? 'weekly' : SPECIAL.has(id) ? 'special' : PPV_SLUGS.has(slug) || categoryHint === 'ple' ? 'ple' : 'event';
  return { series: `${promotion}/${slug}`, name: base || showText, kind };
}

/** Pay-per-view names that appear in career records without a show record. */
const PPV_SLUGS = new Set([
  'halloween-havoc',
  'uncensored',
  'bash-at-the-beach',
  'fall-brawl',
  'road-wild',
  'starrcade',
  'slamboree',
  'superbrawl',
  'souled-out',
  'spring-stampede',
  'great-american-bash',
  'world-war-3',
  'clash-of-the-champions',
  'bound-for-glory',
  'full-gear',
  'double-or-nothing',
  'the-great-american-bash',
  'hog-wild',
  'against-all-odds',
  'this-tuesday-in-texas',
  'no-holds-barred-the-match-the-movie',
]);
