// Storylines, families, the calendar, ratings method and v69 reports.
import type { Chapter, Family, Show, Storyline } from '../../lib/types.ts';
import { compact, nameKey, slugify, unique } from '../../lib/util.ts';
import type { LegacyIdMaps, MigrationLog } from './context.ts';
import type { Identity } from './identity.ts';

export function buildStorylines(d: any, identity: Identity, shows: Map<string, Show>, maps: LegacyIdMaps, log: MigrationLog): Map<string, Storyline> {
  const out = new Map<string, Storyline>();
  const chaptersByStory = new Map<string, any[]>();
  for (const m of d.storyMoments as any[]) {
    if (!chaptersByStory.has(m.story)) chaptersByStory.set(m.story, []);
    chaptersByStory.get(m.story)!.push(m);
  }
  // Shows by date, to link a chapter to its show when the name matches.
  const showsByDate = new Map<string, Show[]>();
  for (const s of shows.values()) {
    if (!showsByDate.has(s.date)) showsByDate.set(s.date, []);
    showsByDate.get(s.date)!.push(s);
  }
  const findShow = (date: string, name: string | undefined): string | undefined => {
    if (!name) return undefined;
    const k = nameKey(name);
    const hit = (showsByDate.get(date) ?? []).find((s) => nameKey(s.name) === k || nameKey(s.name).startsWith(k) || k.startsWith(nameKey(s.name)));
    return hit?.id;
  };
  const momentsById = new Map<string, any>((d.moments as any[]).map((m) => [m.id, m]));
  let linkedChapters = 0;

  for (const s of d.stories as any[]) {
    const promotion = s.promotion ?? 'wwe';
    const id = slugify(s.id);
    const chapters: Chapter[] = [];
    // Contemporary storylines list archived moments as their chapters.
    for (const eventId of s.events ?? []) {
      const ref = maps.segments[eventId];
      const m = momentsById.get(eventId);
      if (!ref || !m) {
        log.queue({ kind: 'storyline', title: `Chapter points at a missing moment`, records: [`${s.id}: ${eventId}`] });
        continue;
      }
      const [showId] = ref.split('#');
      chapters.push(
        compact({
          id: `c${chapters.length + 1}`,
          date: m.date,
          title: m.title ?? m.result,
          show: m.show,
          showId,
          segment: ref,
          kind: m.kind,
          result: m.result,
          sources: unique<string>([m.source, m.recap]),
          legacyMoment: eventId,
        }) as Chapter,
      );
    }
    // Curated milestones.
    for (const c of chaptersByStory.get(s.id) ?? []) {
      const showId = findShow(c.date, c.show);
      if (showId) linkedChapters++;
      const chapter = compact({
        id: `c${chapters.length + 1}`,
        date: c.date,
        title: c.title,
        show: c.show,
        showId,
        kind: c.kind,
        result: c.result,
        context: c.context,
        showCategory: c.showCategory,
        people: unique<string>((c.people ?? []).map((l: string) => identity.pid(l) ?? l)),
        historical: c.historicalStory || undefined,
        sources: unique<string>([c.source, c.extraSource]),
        legacyId: c.id,
      }) as Chapter;
      chapter.sources ??= [];
      chapters.push(chapter);
      maps.chapters[c.id] = `${id}#${chapter.id}`;
    }
    chapters.sort((a, b) => a.date.localeCompare(b.date));
    chapters.forEach((c, i) => {
      const newId = `c${i + 1}`;
      if (c.id !== newId) {
        const legacy = (c as any).legacyId;
        if (legacy) maps.chapters[legacy] = `${id}#${newId}`;
        c.id = newId;
      }
    });
    out.set(
      id,
      compact({
        id,
        promotion,
        title: s.title,
        summary: s.summary,
        brands: s.brands,
        cast: s.cast,
        people: unique<string>((s.people ?? []).map((l: string) => identity.pid(l) ?? l)),
        // Researched histories run from their first to their last milestone; the others are
        // still going, so they have a start but no end.
        start: s.start ?? chapters[0]?.date,
        end: s.end,
        source: s.source,
        chapters,
        legacyId: s.id,
      }) as Storyline,
    );
    maps.storylines[s.id] = id;
  }
  log.count('storyline chapters linked to a show', linkedChapters);
  return out;
}

export function buildFamilies(d: any, identity: Identity, maps: LegacyIdMaps): Map<string, Family> {
  const out = new Map<string, Family>();
  const sourceIndex: Record<string, [string, string]> = d.dynastySources ?? {};
  for (const f of d.dynasties as any[]) {
    const id = slugify(f.id);
    const usedSources = unique<string>([...(f.nodes ?? []).map((n: any) => n.source), ...(f.edges ?? []).map((e: any) => e.source)]);
    out.set(
      id,
      compact({
        id,
        name: f.name,
        description: f.description,
        branches: f.branches ?? [],
        members: (f.nodes ?? []).map((n: any) =>
          compact({
            id: n.id,
            name: n.name,
            person: n.careerId ? identity.pid(n.careerId) ?? n.careerId : undefined,
            branch: n.branch,
            note: n.note,
            aliases: n.aliases,
            source: n.source,
            layout: typeof n.x === 'number' ? { x: n.x, y: n.y } : undefined,
          }),
        ),
        links: (f.edges ?? []).map((e: any) => compact({ a: e.a, b: e.b, type: e.type, label: e.label, source: e.source })),
        sources: Object.fromEntries(
          usedSources.filter((k) => sourceIndex[k]).map((k) => [k, { label: sourceIndex[k][0], url: sourceIndex[k][1] }]),
        ),
      }) as Family,
    );
    maps.families[f.id] = id;
  }
  return out;
}

export function buildCalendar(d: any, shows: Map<string, Show>, maps: LegacyIdMaps): any {
  const c = d.calendarData;
  const byDate = new Map<string, Show[]>();
  for (const s of shows.values()) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  // Link a calendar entry to the show it became: same date, same promotion, matching name.
  const link = (e: any) => {
    const promotion = e.promotion === 'nxt' ? 'wwe' : e.promotion;
    const k = nameKey(e.name);
    const candidates = (byDate.get(e.date) ?? []).filter((s) => s.promotion === promotion);
    const named = candidates.filter((s) => {
      const sk = nameKey(s.name);
      return sk === k || sk.startsWith(k) || k.startsWith(sk) || sk.includes(k) || k.includes(sk);
    });
    const hit = named.length === 1 ? named[0] : candidates.length === 1 ? candidates[0] : undefined;
    // Event logos were copied from promotions' sites; images must be free-licensed, so they are dropped.
    return compact({ ...e, logo: undefined, logoKey: undefined, show: hit?.id ?? maps.shows[e.id] });
  };
  return compact({
    year: c.year,
    checked: c.checked,
    promotions: c.promotions,
    events: (c.events ?? []).map(link),
    weeklyEvents: (c.weeklyEvents ?? []).map(link),
    viewing: c.viewing,
    viewingGuide: c.viewingGuide,
  });
}

export function buildRatingsMethod(d: any): any {
  const r = d.matchRatings ?? {};
  return compact({ version: r.version, checked: r.checked, methodVersion: r.methodVersion, method: r.method, providers: r.sources, coverage: r.coverage });
}

/** v69 import and coverage reports, kept as the provenance record of the legacy data. */
export function legacyReports(d: any): Record<string, unknown> {
  return {
    'full-archive': d.fullArchive,
    'ringside-import': d.ringsideImport,
    'raw-backfill': d.rawBackfill?.report,
    'january-2025-audit': d.audit,
    'broadcast-coverage': { current: d.broadcastCoverage, byYear: d.coverageByYear },
    'career-reigns': d.careerReignCoverage,
    'cody-matches': d.codyMatchCoverage,
    'hogan-review': { matchReview: d.hoganMatchReview, workbook: d.hoganWorkbook },
    statistics: d.statisticsQuality,
    'storyline-catalog': d.storyCatalogResearch,
    'show-history': { checked: d.showHistory?.checked, coverage: d.showHistory?.coverage },
    'career-presentation': { checked: d.careerPresentation?.checked, note: d.careerPresentation?.note },
  };
}

export function legacySourceLedger(d: any): any {
  return {
    note: 'Site-wide source lists from v69 (Coverage & sources panel).',
    roster: d.rosterSources,
    events: Object.entries(d.sources ?? {}).map(([key, url]) => ({ key, url })),
  };
}
