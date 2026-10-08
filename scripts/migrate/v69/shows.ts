// Shows and their segments. One show per series and date; every v69 match, segment
// and career moment lands in exactly one show.
import type { Participant, RatingSource, Segment, Show } from '../../lib/types.ts';
import { compact, isoDate, unique } from '../../lib/util.ts';
import type { LegacyIdMaps, MigrationLog } from './context.ts';
import type { Identity } from './identity.ts';
import type { SeriesRegistry } from './series.ts';
import { promotionFromText, resolveSeriesFromText, seriesForFamily, seriesKind } from './series.ts';

const MATCH_KINDS = new Set(['match', 'title']);

function isMatch(r: any): boolean {
  return r.segmentType === 'match' || MATCH_KINDS.has(r.kind);
}

function cardCoverage(L: any): Show['coverage']['card'] {
  if (L.calendarOnly) return 'listed';
  if (L.rawBackfill) return 'unlinked';
  return 'indexed';
}

function segmentCoverage(text: string | undefined): Show['coverage']['segments'] {
  const t = (text ?? '').toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('reviewed') || t.includes('partial')) return 'reviewed-partial';
  if (t.includes('not yet') || t.includes('pending')) return 'not-indexed';
  return 'unknown';
}

export interface ShowBuild {
  shows: Map<string, Show>;
  /** canonical person id -> segment refs they appear in */
  appearances: Map<string, Set<string>>;
}

export function buildShows(d: any, identity: Identity, registry: SeriesRegistry, maps: LegacyIdMaps, log: MigrationLog): ShowBuild {
  const shows = new Map<string, Show>();
  const momentsById = new Map<string, any>((d.moments as any[]).map((m) => [m.id, m]));
  const broadcastsById = new Map<string, any>((d.broadcasts as any[]).map((b) => [b.id, b]));
  const catalogByFamily = new Map<string, any>((d.showsUI.catalog as any[]).map((c) => [c.id, c]));
  const ratings: Record<string, any> = d.matchRatings?.matches ?? {};
  const placed = new Set<string>(); // legacy record ids already turned into segments

  const mapPerson = (legacy: string): string => {
    const id = identity.pid(legacy);
    if (!id) throw new Error(`Unknown person ${legacy}`);
    return id;
  };

  const newShow = (id: string, base: Partial<Show> & { promotion: string; series: string; name: string; date: string }): Show => {
    const show: Show = {
      id,
      promotion: base.promotion,
      series: base.series,
      name: base.name,
      date: base.date,
      dateBasis: base.dateBasis,
      recordedDate: base.recordedDate,
      category: base.category,
      coverage: base.coverage ?? { card: 'indexed', segments: 'unknown' },
      watch: base.watch,
      notes: base.notes,
      sources: base.sources ?? [],
      segments: [],
      legacyIds: [],
      legacy: base.legacy,
    };
    shows.set(id, show);
    return show;
  };

  const toSegment = (r: any, show: Show): Segment => {
    const matchRecord = isMatch(r);
    const people: string[] = r.people ?? [];
    const outcomes: string[] | undefined = Array.isArray(r.outcomes) && r.outcomes.length === people.length ? r.outcomes : undefined;
    const participants: Participant[] = [];
    const seen = new Set<string>();
    people.forEach((legacy, i) => {
      const person = mapPerson(legacy);
      if (seen.has(`c:${person}`)) return;
      seen.add(`c:${person}`);
      participants.push(compact({ person, role: 'competitor', outcome: outcomes?.[i] }) as Participant);
    });
    for (const legacy of r.involved ?? []) {
      const person = mapPerson(legacy);
      if (seen.has(`i:${person}`) || seen.has(`c:${person}`)) continue;
      seen.add(`i:${person}`);
      participants.push({ person, role: 'involved' });
    }
    const rating = ratings[r.id];
    const ratingSources: RatingSource[] | undefined = rating?.sources?.map((s: any) =>
      compact({ provider: s.provider, value: s.value, unit: s.unit, url: s.url, checked: s.checked, votes: s.votes, reviewer: s.reviewer }),
    );
    const legacyExtra = compact({
      date: r.date && r.date !== show.date ? r.date : undefined,
      show: r.show && r.show !== show.name ? r.show : undefined,
      kind: r.kind,
      hoganReview: r.hoganReview,
      workbookReference: r.workbookReference,
      auditIssue: r.auditIssue,
      recordedDate: r.recordedDate,
      bulkArchive: r.bulkArchive,
    });
    const body = compact({
      order: typeof r.order === 'number' ? r.order : undefined,
      type: matchRecord ? 'match' : r.segmentType === 'promo' ? 'promo' : 'appearance',
      title: r.title || r.result || 'Untitled segment',
      result: r.result,
      context: r.context,
      matchType: r.matchType,
      duration: r.duration,
      titleMatch: r.kind === 'title' ? true : undefined,
      participants,
      billing: Array.isArray(r.competitors) && r.competitors.length ? r.competitors : undefined,
      guests: r.guest,
      unlinked: matchRecord && people.length === 0 ? true : undefined,
      showCategory: r.showCategory,
      promotionLabel: r.promotion,
      dateBasis: r.dateBasis,
      rating: rating ? { sources: ratingSources ?? [], matchCheck: rating.matchCheck } : undefined,
      verification: r.verification,
      evidence: r.evidence,
      sources: unique<string>([r.source, r.recap, r.highlight, r.extraSource, r.verification?.source]),
      provenance: r.provenance,
      legacyId: r.id,
      legacy: legacyExtra,
    }) as Omit<Segment, 'key'>;
    // compact() drops empty lists; these two are always present.
    return { key: '', ...body, participants: body.participants ?? [], sources: body.sources ?? [] } as Segment;
  };

  const addSegment = (show: Show, record: any) => {
    if (placed.has(record.id)) return;
    placed.add(record.id);
    // Prefer the career record (it carries outcomes and links); fall back to the card entry.
    const r = momentsById.get(record.id) ?? record;
    const seg = toSegment(r, show);
    if (!seg.sources.length) seg.sources = [...show.sources];
    const prefix = seg.type === 'match' ? 'm' : 's';
    const n = show.segments.filter((s) => s.key.startsWith(prefix)).length + 1;
    seg.key = `${prefix}${n}`;
    show.segments.push(seg);
    maps.segments[record.id] = `${show.id}#${seg.key}`;
  };

  // 1. Every show in the v69 Shows tab (a superset of the career show list).
  const legacyShows: any[] = [...(d.showsUI.archive as any[])];
  const archiveIds = new Set(legacyShows.map((s) => s.id));
  for (const b of d.broadcasts as any[]) if (!archiveIds.has(b.id)) legacyShows.push(b);

  const seenLegacy = new Set<string>();
  for (const L0 of legacyShows) {
    // Some listings repeat an id. Same id and date: the same show listed twice. Same id,
    // different date: one taping split into several aired episodes (v69 reused the id).
    const listingKey = `${L0.id}|${L0.date}`;
    if (seenLegacy.has(listingKey)) {
      log.count('duplicate Shows-tab listings skipped');
      continue;
    }
    const splitEpisode = [...seenLegacy].some((k) => k.startsWith(`${L0.id}|`));
    seenLegacy.add(listingKey);
    const B0 = broadcastsById.get(L0.id);
    const B = B0 && B0.date === L0.date ? B0 : undefined;
    if (splitEpisode) log.count('episodes split from a shared taping id');
    const L = { ...L0, ...(B ?? {}) };
    const family = L.showFamily;
    const catalog = catalogByFamily.get(family);
    const promotion = catalog?.promotion ?? 'wwe';
    const seriesId = seriesForFamily(family, promotion);
    registry.ensure(seriesId);
    maps.series[family] = seriesId;
    const date = isoDate(L.date);
    if (!date) throw new Error(`Show ${L.id} has no usable date`);
    const id = `${seriesId}/${date}`;
    let show = shows.get(id);
    const sources = unique<string>([L.source, L.recap, ...((L.recaps ?? []) as any[]).map((r) => r.url)]);
    if (show) {
      const before = show.name;
      const preShow = /countdown|kickoff|pre-?show/i;
      if (preShow.test(show.name) && !preShow.test(L.show)) {
        // The pre-show was filed first; the event itself names the show.
        for (const seg of show.segments) seg.legacy = { ...(seg.legacy ?? {}), show: (seg.legacy as any)?.show ?? show.name };
        show.name = L.show;
      }
      log.count('shows merged on same series and date');
      log.queue({
        kind: 'show-merge',
        title: `${before} and ${L.show} share one show (${date})`,
        detail: 'Two v69 records for one series on one date, usually a televised pre-show and its event. Pre-show segments keep their original show name.',
        records: [...show.legacyIds, L.id],
      });
      show.sources = unique([...show.sources, ...sources]);
    } else {
      show = newShow(id, {
        promotion: seriesId.split('/')[0],
        series: seriesId,
        name: L.show,
        date,
        dateBasis: L.dateBasis === 'recorded' ? 'recorded' : L.dateBasis === 'broadcast' ? 'aired' : undefined,
        recordedDate: isoDate(L.recordedDate) ?? undefined,
        category: L.category,
        coverage: compact({
          card: cardCoverage(L),
          segments: segmentCoverage(L.segmentStatus),
          note: L.note,
          legacyCardStatus: L.matchStatus,
          legacySegmentStatus: L.segmentStatus,
        }) as Show['coverage'],
        watch: L.watch ? compact({ url: L.watch, label: L.watchLabel }) : undefined,
        sources,
        legacy: compact({
          showFamily: family,
          bulkArchive: L.bulkArchive,
          rawBackfill: L.rawBackfill,
          calendarOnly: L.calendarOnly,
          sourceEventIds: L.sourceEventIds,
          importBatch: L.importBatch,
          audit: L.audit,
        }),
      });
    }
    show.legacyIds.push(L.id);
    maps.shows[`${L.id}@${date}`] = show.id;
    if (!maps.shows[L.id] || B) maps.shows[L.id] = show.id;
    const cardEntries = new Map<string, any>();
    for (const m of [...(L0.matches ?? []), ...(B?.matches ?? [])]) if (!cardEntries.has(m.id)) cardEntries.set(m.id, m);
    for (const m of cardEntries.values()) addSegment(show, m);
    const segEntries = new Map<string, any>();
    for (const s of [...(L0.segments ?? []), ...(B?.segments ?? [])]) if (!segEntries.has(s.id)) segEntries.set(s.id, s);
    for (const s of segEntries.values()) addSegment(show, s);
  }

  // 2. Career moments that point at a show record but sit on no card.
  for (const m of d.moments as any[]) {
    if (placed.has(m.id) || !m.broadcastId) continue;
    const showId = maps.shows[`${m.broadcastId}@${m.date}`] ?? maps.shows[m.broadcastId];
    if (!showId) continue;
    addSegment(shows.get(showId)!, m);
    log.count('moments attached to their show record');
  }

  // 3. Career moments with no show record: file them under a series by show name.
  for (const m of d.moments as any[]) {
    if (placed.has(m.id)) continue;
    const promotion = promotionFromText(m.promotion) ?? 'wwe';
    const date = isoDate(m.date);
    if (!date) throw new Error(`Moment ${m.id} has no usable date`);
    const hint = /ple|ppv|pay-per-view/i.test(m.showCategory ?? '') ? 'ple' : undefined;
    const resolved = resolveSeriesFromText(m.show ?? 'Event', promotion, hint);
    registry.ensure(resolved.series, { name: resolved.name, kind: resolved.kind ?? seriesKind(resolved.series, 'event') });
    const id = `${resolved.series}/${date}`;
    let show = shows.get(id);
    if (!show) {
      show = newShow(id, {
        promotion: resolved.series.split('/')[0],
        series: resolved.series,
        name: m.show ?? 'Event',
        date,
        category: m.showCategory,
        coverage: { card: 'career-only', segments: 'unknown', note: 'Known only from career records; the full card is not indexed yet.' },
        sources: [],
      });
      log.count('shows created from career records');
    }
    addSegment(show, m);
    show.sources = unique([...show.sources, m.source, m.recap]);
    log.count('career moments filed by show name');
  }

  // Arena cards: kept because v69 published them, but they must be confirmed as televised.
  const arena = [...shows.values()].filter((s) => s.series.endsWith('/arena-cards') || /maximum impact tour/i.test(s.name));
  if (arena.length) {
    log.queue({
      kind: 'scope',
      title: 'Confirm these arena shows aired',
      detail: 'House shows are out of scope. These cards came from career research and need evidence of a TV or network broadcast (for example MSG Network, PRISM or a home-video release counts only if it aired).',
      records: arena.map((s) => s.id),
    });
  }

  const offDate = [...shows.values()].flatMap((s) => s.segments.filter((g) => (g.legacy as any)?.date).map((g) => `${s.id}#${g.key} dated ${(g.legacy as any).date}`));
  if (offDate.length) {
    log.queue({
      kind: 'dates',
      title: 'Segments dated differently from their show',
      detail: 'v69 filed these on a card with another date: mostly taping versus air dates (2002 SmackDown cards dated on Tuesday tapings; career records dated by air date). Each keeps its own date until the show date is confirmed.',
      records: offDate,
    });
  }

  // Same show, same participants: usually one bout recorded twice.
  const doubled: string[] = [];
  for (const show of shows.values()) {
    const seen = new Map<string, string>();
    for (const seg of show.segments) {
      if (seg.type !== 'match') continue;
      const who = seg.participants.filter((p) => p.role === 'competitor').map((p) => p.person).sort();
      if (who.length < 2) continue;
      const k = who.join('+');
      if (seen.has(k)) doubled.push(`${show.id}: ${seen.get(k)} + ${seg.key} (${seg.title})`);
      else seen.set(k, seg.key);
    }
  }
  if (doubled.length)
    log.queue({
      kind: 'duplicates',
      title: 'Likely double-counted matches',
      detail: 'Two matches with the same competitors on one show. Usually one bout recorded twice (mirrored names, a generic title next to a named one); sometimes a real second bout (a restart, a two-fall match). Both stay until reviewed; v69 already left 106 matches out of its statistics.',
      records: doubled,
    });
  const unlinked = [...shows.values()].flatMap((s) => (s.legacy as any)?.rawBackfill ? [] : s.segments.filter((g) => g.unlinked).map((g) => `${s.id}#${g.key}: ${g.title}`));
  if (unlinked.length)
    log.queue({
      kind: 'links',
      title: 'Matches with no linked wrestlers (outside the Raw backfill)',
      detail: 'Mostly 2025 women\'s title matches whose title field holds one name. They need their participants linked before they show on career pages.',
      records: unlinked,
    });

  // Index appearances for people.
  const appearances = new Map<string, Set<string>>();
  for (const show of shows.values()) {
    show.segments.sort((a, b) => {
      const ka = a.key[0] === 'm' ? 0 : 1;
      const kb = b.key[0] === 'm' ? 0 : 1;
      return ka - kb || Number(a.key.slice(1)) - Number(b.key.slice(1));
    });
    for (const seg of show.segments) {
      for (const p of seg.participants) {
        if (!appearances.has(p.person)) appearances.set(p.person, new Set());
        appearances.get(p.person)!.add(`${show.id}#${seg.key}`);
      }
    }
  }
  return { shows, appearances };
}
