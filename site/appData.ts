// Writes the explorer's data bundles from the loaded archive (see site/app/model.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Show, Storyline } from '../scripts/lib/types.ts';
import { nameKey, sha256 } from '../scripts/lib/util.ts';
import type { SiteData } from './lib/load.ts';
import { isPle } from './lib/format.ts';
import { displayTitle, showLabel, titleNameAt, titlePromotion } from './components/bits.ts';
import { coverageNote, runningOrder } from './pages/show.ts';
import { promotionIdFor } from './components/careerStrip.ts';
import { isBoilerplate } from './pages/person.ts';
import type { CoreBundle, DetailBundle, KindCode, ProfileBundle, ShowDetailBundle, StorylineBundle, TitleBundle } from './app/model.ts';

const OUTCOME: Record<string, string> = { win: 'w', loss: 'l', dq: 'q', countout: 'c', no_contest: 'n', 'no-contest': 'n', draw: 'd' };

/** Storyline collections, in the order the tabs show them (from v69). */
export const STORY_PROMOTIONS: StorylineBundle['promotions'] = [
  { id: 'wwe', name: 'WWE', color: '#f45a64', note: 'WWE history, including WWF and WWWF.', historical: false },
  { id: 'aew', name: 'AEW', color: '#dfbd65', note: 'Major AEW storylines from its 2019 launch onward.', historical: false },
  { id: 'tna', name: 'TNA', color: '#ed635d', note: 'Major TNA and Impact storylines from the 2002 launch onward.', historical: false },
  { id: 'njpw', name: 'NJPW', color: '#dfbd65', note: 'Major New Japan Pro-Wrestling stories from its 1972 founding onward.', historical: false },
  { id: 'wcw', name: 'WCW', color: '#ac91db', note: 'Major WCW stories through March 2001, with explicitly labeled Jim Crockett Promotions roots.', historical: true },
  { id: 'ecw', name: 'ECW', color: '#e58e70', note: 'Original Eastern and Extreme Championship Wrestling stories, 1992 to 2001; separate from WWE’s later ECW brand.', historical: true },
];

/** Pay-per-view and premium live event names, for chapters that don't link to an archived show (from v69). */
const PLE_NAMES = /royal rumble|elimination chamber|wrestlemania|summerslam|backlash|money in the bank|night of champions|clash (?:in|at|of)|crown jewel|survivor series|wrestlepalooza|bash in berlin|bad blood|king and queen|payback|hell in a cell|takeover|vengeance day|stand.*deliver|battleground|great american bash|heatwave|no mercy|halloween havoc|deadline|tripleman[ií]a/i;

export function writeAppData(site: SiteData, outDir: string, asOf: string): { dir: string; files: number } {
  const promotions = [...site.promotions.values()].sort((a, b) => a.id.localeCompare(b.id));
  const promoIndex = new Map(promotions.map((p, i) => [p.id, i]));
  const people = [...site.people.values()].sort((a, b) => a.id.localeCompare(b.id));
  const personIndex = new Map(people.map((p, i) => [p.id, i]));
  // Every show, cards or not: the Shows grid lists dates whose cards aren't indexed yet.
  const shows = [...site.shows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const seriesList = [...site.series.values()].filter((x) => site.showsBySeries.get(x.id)?.length).sort((a, b) => a.id.localeCompare(b.id));
  const seriesIndex = new Map(seriesList.map((x, i) => [x.id, i]));
  const showIndex = new Map(shows.map((s, i) => [s.id, i]));
  const titles = [...site.titles.values()].sort((a, b) => a.id.localeCompare(b.id));
  const titleIndex = new Map(titles.map((t, i) => [t.id, i]));

  /** Named people on screen who aren't already linked participants. */
  const otherGuests = (seg: Show['segments'][number]): string => {
    if (!seg.guests) return '';
    const linked = new Set(seg.participants.flatMap((p) => [site.people.get(p.person)?.name, ...(site.people.get(p.person)?.ringNames ?? []).map((r) => r.name)]).filter((n): n is string => !!n).map(nameKey));
    for (const n of seg.billing ?? []) linked.add(nameKey(n));
    return seg.guests
      .split(/,\s*/)
      .filter((n) => n.trim() && !linked.has(nameKey(n)))
      .join(', ');
  };
  const kindOf = (seg: Show['segments'][number]): KindCode =>
    seg.type === 'match' ? (seg.titleMatch ? 1 : 0) : seg.type === 'promo' ? 2 : 3;

  const moments: CoreBundle['moments'] = [];
  const details = new Map<string, DetailBundle>();
  const showDetails = new Map<string, ShowDetailBundle>();
  for (const show of shows) {
    const year = show.date.slice(0, 4);
    if (!details.has(year)) details.set(year, {});
    if (!showDetails.has(year)) showDetails.set(year, {});
    // Moments go in running order, so a show's card reads top to bottom.
    const order = runningOrder(show);
    const numbered = order.length > 0 && order.every((g) => g.order !== undefined);
    showDetails.get(year)![show.id] = [show.recordedDate ?? '', coverageNote(show, numbered, order), show.watch?.url ?? '', show.watch?.label ?? '', show.notes ?? [], show.sources, numbered ? 1 : 0];
    for (const seg of order) {
      const competitors = seg.participants.filter((p) => p.role === 'competitor');
      const involved = seg.participants.filter((p) => p.role === 'involved');
      moments.push([
        showIndex.get(show.id)!,
        seg.key,
        kindOf(seg),
        displayTitle(seg, site.people),
        competitors.map((p) => personIndex.get(p.person)!),
        involved.map((p) => personIndex.get(p.person)!),
        competitors.map((p) => OUTCOME[p.outcome ?? ''] ?? '-').join(''),
      ]);
      details.get(year)![`${show.id}#${seg.key}`] = [
        seg.result ?? '',
        seg.context ?? '',
        seg.matchType ?? '',
        typeof seg.duration === 'number' ? `${Math.floor(seg.duration / 60)}:${String(Math.round(seg.duration % 60)).padStart(2, '0')}` : seg.duration ?? '',
        [...new Set([...seg.sources, ...show.sources])],
        (seg.rating?.sources ?? []).map((r) => [r.provider, r.value, r.unit, r.url ?? '', r.votes ?? 0]),
        seg.order ?? 0,
        otherGuests(seg),
      ];
    }
  }

  const firstDates = [shows[0]?.date ?? asOf, ...titles.flatMap((t) => t.reigns.map((r) => r.start))];
  for (const p of people) for (const per of p.curated?.promotionPeriods ?? []) if (per.start) firstDates.push(per.start);
  const first = firstDates.sort()[0];

  const core: CoreBundle = {
    v: 1,
    asOf,
    first,
    promotions: promotions.map((p) => [p.id, p.name, p.fullName ?? p.name]),
    people: people.map((p) => {
      const aliases = p.ringNames.map((r) => r.name).filter((n) => n !== p.name);
      const flags = (p.legacyFlags?.archiveOnly ? 0 : 1) | (p.curated ? 2 : 0);
      const brands = p.rosters?.find((r) => r.asOf === 'archive')?.brands ?? [];
      return [p.id, p.name, aliases.join('|'), flags, brands.join('|')];
    }),
    series: seriesList.map((x) => [x.id, promoIndex.get(x.promotion) ?? 0, x.name, x.kind, x.start ?? 0, x.color ?? '', x.note ?? '', x.sources?.[0] ?? '']),
    shows: shows.map((s) => {
      const kind = site.series.get(s.series)?.kind;
      return [s.id, showLabel(s, site), s.date, promoIndex.get(s.promotion) ?? 0, (isPle(s, kind) ? 1 : 0) | (s.dateBasis === 'recorded' ? 2 : 0), seriesIndex.get(s.series) ?? -1, s.name];
    }),
    moments,
    titles: titles.map((t) => [t.id, t.name, t.short ?? t.name.replace(/ Championship.*$/, '')]),
    reigns: titles.flatMap((t) =>
      t.reigns.map((r) => {
        const starts: Record<number, string> = {};
        for (const [pid, d] of Object.entries(r.memberStarts ?? {})) if (personIndex.has(pid)) starts[personIndex.get(pid)!] = d;
        const era = titleNameAt(t, r.start);
        return [titleIndex.get(t.id)!, r.id, r.people.map((p) => personIndex.get(p)!).filter((x) => x !== undefined), r.start, r.end ?? '', r.holder, Object.keys(starts).length ? starts : 0, era === t.name ? '' : era] as CoreBundle['reigns'][number];
      }),
    ),
    periods: people.flatMap((p) =>
      (p.curated?.promotionPeriods ?? [])
        .filter((x) => x.start)
        .map((x) => [personIndex.get(p.id)!, x.name, promotionIdFor(x.name, site.promotions) ?? '', x.start!, x.end ?? '', x.fullName ?? x.name, x.note ?? '', x.sources ?? []] as CoreBundle['periods'][number]),
    ),
    spans: people
      .filter((p) => p.debut || p.careerEnd || p.status || p.displayThrough)
      .map((p) => [personIndex.get(p.id)!, p.debut?.date ?? '', p.debut?.precision ?? 'day', p.careerEnd?.date ?? '', p.careerEnd?.label ?? '', p.displayThrough ?? '', p.status?.value ?? '']),
    totals: people
      .filter((p) => p.externalTotals?.matches)
      .map((p) => {
        const t = p.externalTotals!;
        return [personIndex.get(p.id)!, t.matches ?? 0, t.wins ?? 0, t.losses ?? 0, t.draws ?? 0, t.source ?? ''];
      }),
  };

  // A chapter is a pay-per-view moment when its archived show is one, when its source calls it
  // one, or when its show carries the name of an event series in the archive.
  const pleSeries = [...site.series.values()].filter((x) => (x.kind === 'ple' || x.kind === 'special') && site.showsBySeries.get(x.id)?.length).map((x) => x.name.toLowerCase());
  const chapterPle = (c: Storyline['chapters'][number]): boolean => {
    if (c.kind === 'story') return false;
    if (/^(ppv|ple)$/i.test(c.showCategory ?? '')) return true;
    const show = c.segment ? site.shows.get(c.segment.split('#')[0]) : c.showId ? site.shows.get(c.showId) : undefined;
    if (show) return isPle(show, site.series.get(show.series)?.kind);
    const name = (c.show ?? '').toLowerCase();
    return PLE_NAMES.test(name) || pleSeries.some((n) => name.startsWith(n));
  };

  const storylines: StorylineBundle = {
    v: 1,
    storylines: [...site.storylines.values()].map((s) => ({
      id: s.id,
      promotion: s.promotion,
      title: s.title,
      summary: s.summary ?? '',
      brands: s.brands ?? [],
      cast: s.cast ?? [],
      people: (s.people ?? []).map((p) => personIndex.get(p)).filter((x): x is number => x !== undefined),
      start: s.start ?? [...s.chapters].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? asOf,
      end: s.end ?? '',
      source: s.source ?? '',
      chapters: [...s.chapters]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => ({
          id: c.id,
          date: c.date,
          title: c.title,
          show: c.show ?? '',
          moment: c.segment ?? '',
          kind: c.kind ?? '',
          ple: chapterPle(c),
          result: c.result ?? '',
          context: c.context ?? '',
          sources: c.sources,
          people: (c.people ?? []).map((p) => personIndex.get(p)).filter((x): x is number => x !== undefined),
        })),
    })),
    promotions: STORY_PROMOTIONS,
  };

  // Profiles ship as one file: most are a few hundred bytes, and the whole set gzips to about 90 KB.
  const profiles: Record<string, ProfileBundle> = {};
  for (const p of people) {
    profiles[p.id] = {
      id: p.id,
      name: p.name,
      ringNames: p.ringNames.map((r) => ({ name: r.name, from: r.from, to: r.to, first: r.billed?.first, last: r.billed?.last })),
      intro: p.curated?.profile?.intro ?? (isBoilerplate(p.summary) ? undefined : p.summary),
      inBrief: p.curated?.profile?.inBrief,
      promotions: p.promotions,
      titleSummary: p.titleSummary,
      titleTotal: p.titleTotal,
      scopes: p.scopes,
      awards: p.awards,
      externalTotals: p.externalTotals,
      profile: p.curated?.profile,
      relationships: p.curated?.relationships,
      signatureMatches: p.curated?.signatureMatches,
      sources: [...new Set([...p.sources, ...Object.values(p.curated?.sources ?? {})])],
    };
  }

  // Championships: what the core bundle doesn't carry, and the title-history trees.
  const titleBundle: TitleBundle = {
    v: 1,
    titles: Object.fromEntries(titles.map((t) => [t.id, [titlePromotion(t) ?? '', t.featured ? 1 : 0, t.sources, (t.names ?? []).filter((n) => n !== t.name)]])),
    lineage: site.lineages,
  };

  // Content-addressed folder: a build with different data gets a new path, so files can cache forever.
  const texts = new Map<string, string>([
    ['core.json', JSON.stringify(core)],
    ['storylines.json', JSON.stringify(storylines)],
    ['profiles.json', JSON.stringify(profiles)],
    ['titles.json', JSON.stringify(titleBundle)],
    ['families.json', JSON.stringify({ v: 1, families: [...site.families.values()].sort((a, b) => a.name.localeCompare(b.name)) })],
    ['calendar.json', JSON.stringify({ v: 1, ...site.calendar })],
    ...[...details].map(([year, rows]) => [`details/${year}.json`, JSON.stringify(rows)] as [string, string]),
    ...[...showDetails].map(([year, rows]) => [`shows/${year}.json`, JSON.stringify(rows)] as [string, string]),
  ]);
  const version = sha256([...texts.values()].join('\n')).slice(0, 10);
  const dir = join(outDir, 'data', version);
  mkdirSync(join(dir, 'details'), { recursive: true });
  mkdirSync(join(dir, 'shows'), { recursive: true });
  for (const [name, text] of texts) writeFileSync(join(dir, name), text);
  const files = texts.size;
  return { dir: `data/${version}`, files };
}

