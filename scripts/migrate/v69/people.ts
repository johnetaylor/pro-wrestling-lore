// Person records: one per canonical ID, built from every v69 record that maps to it.
import type { Person, RingName, Show } from '../../lib/types.ts';
import { compact, isoDate, nameKey, unique } from '../../lib/util.ts';
import type { LegacyIdMaps, MigrationLog } from './context.ts';
import { DATED_RING_NAMES, NAMES, type Identity } from './identity.ts';
import { parseLegacyProfile } from './profile.ts';

/** Splits display labels like "Chad Gable / El Grande Americano" and strips quotes. */
function splitNames(label: string | undefined): string[] {
  if (!label) return [];
  return label
    .split(/\s+\/\s+/)
    .map((s) => s.replace(/["“”]/g, '').trim())
    .filter(Boolean);
}

export function buildPeople(
  d: any,
  rendered: any,
  identity: Identity,
  shows: Map<string, Show>,
  appearances: Map<string, Set<string>>,
  maps: LegacyIdMaps,
  log: MigrationLog,
): Map<string, Person> {
  const rosterById = new Map<string, any>((d.roster as any[]).map((p) => [p.id, p]));
  const presentation: Record<string, any> = d.careerPresentation?.members ?? {};
  const year2025: Record<string, any> = d.yearRosters?.['2025'] ?? {};
  const imported: Record<string, string> = d.importedEventNames ?? {};
  const archiveBrands: Record<string, string[]> = d.archiveBrands ?? {};
  const people = new Map<string, Person>();

  // Every name each person goes by, gathered from all their v69 records.
  const candidatesById = new Map<string, string[]>();
  for (const [id, legacyIds] of identity.members) {
    candidatesById.set(
      id,
      unique<string>(
        legacyIds.flatMap((l) => {
          const roster = rosterById.get(l);
          return [
            roster?.name,
            ...(roster?.aliases ?? []).flatMap(splitNames),
            ...(d.profiles[l]?.aliases ?? []).flatMap(splitNames),
            imported[l],
            ...splitNames(year2025[l]?.name),
          ];
        }),
      ),
    );
  }
  const keysById = new Map<string, Set<string>>([...candidatesById].map(([id, names]) => [id, new Set(names.map(nameKey))]));

  // When was each person billed under each name? A billed name counts only when exactly one
  // participant of that segment goes by it, so a shared name (El Grande Americano) in a match
  // with both men is not credited to either.
  const billedRange = new Map<string, Map<string, { from: string; to: string }>>();
  for (const show of shows.values()) {
    for (const seg of show.segments) {
      for (const billed of seg.billing ?? []) {
        const k = nameKey(billed);
        const owners = seg.participants.map((p) => p.person).filter((pid, i, all) => all.indexOf(pid) === i && keysById.get(pid)?.has(k));
        if (owners.length !== 1) continue;
        const pid = owners[0];
        if (!billedRange.has(pid)) billedRange.set(pid, new Map());
        const ranges = billedRange.get(pid)!;
        const cur = ranges.get(k);
        if (!cur) ranges.set(k, { from: show.date, to: show.date });
        else {
          if (show.date < cur.from) cur.from = show.date;
          if (show.date > cur.to) cur.to = show.date;
        }
      }
    }
  }

  // Names people were billed under that none of their records list ("Rocky Maivia", "The
  // Giant"). Billing lists competitors in card order, so a name is paired with the competitor
  // in the same position. It is kept only when it is nobody else's name, is not a team name on
  // that card ("BirthRight (Channing Lorenzo, …)"), is not part of a name they already have
  // ("Hogan"), is credited to one person only, and turns up at least twice.
  const ownerOf = new Map<string, Set<string>>();
  for (const [pid, keys] of keysById) for (const k of keys) (ownerOf.get(k) ?? ownerOf.set(k, new Set()).get(k)!).add(pid);
  const billedOnly = new Map<string, { name: string; people: Map<string, { from: string; to: string; n: number }> }>();
  for (const show of shows.values()) {
    for (const seg of show.segments) {
      const comps = seg.participants.filter((x) => x.role === 'competitor');
      if (!seg.billing || seg.billing.length !== comps.length) continue;
      seg.billing.forEach((billed, i) => {
        const pid = comps[i].person;
        const k = nameKey(billed);
        if (!k || ownerOf.has(k) || seg.title.includes(`${billed} (`)) return;
        const words = new Set((candidatesById.get(pid) ?? []).flatMap((n) => n.toLowerCase().split(/\s+/)));
        if (billed.toLowerCase().split(/\s+/).every((w) => words.has(w))) return;
        const entry = billedOnly.get(k) ?? billedOnly.set(k, { name: billed, people: new Map() }).get(k)!;
        const cur = entry.people.get(pid);
        if (!cur) entry.people.set(pid, { from: show.date, to: show.date, n: 1 });
        else {
          cur.n++;
          if (show.date < cur.from) cur.from = show.date;
          if (show.date > cur.to) cur.to = show.date;
        }
      });
    }
  }
  const extraNames = new Map<string, RingName[]>();
  const singles: string[] = [];
  for (const { name: billed, people: credited } of billedOnly.values()) {
    if (credited.size !== 1) continue;
    const [[pid, ev]] = [...credited];
    if (ev.n < 2) {
      singles.push(`${pid}: "${billed}" (${ev.from})`);
      continue;
    }
    const list = extraNames.get(pid) ?? extraNames.set(pid, []).get(pid)!;
    list.push({ name: billed, note: 'Billed under this name in indexed matches.', billed: { first: ev.from, last: ev.to } });
  }
  const added = [...extraNames.values()].reduce((n, l) => n + l.length, 0);
  if (added) log.count('ring names added from billing evidence', added);
  if (singles.length) log.queue({ kind: 'identity', title: 'Names billed once that no record lists (confirm before adding as ring names)', records: singles.sort() });

  for (const [id, legacyIds] of identity.members) {
    const records = legacyIds.map((l) => ({ legacy: l, roster: rosterById.get(l), profile: d.profiles[l] ?? {} }));
    const primary = records[0];
    const r = primary.roster;
    const p = primary.profile;
    for (const l of legacyIds) maps.people[l] = id;

    const name = NAMES[id] ?? r.name;
    const nameCandidates = candidatesById.get(id) ?? [];
    const firstLast = billedRange.get(id) ?? new Map<string, { from: string; to: string }>();
    const dated = DATED_RING_NAMES[id] ?? [];
    const ringNames: RingName[] = [];
    const seenKeys = new Set<string>();
    for (const n of [name, ...nameCandidates]) {
      const k = nameKey(n);
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      const fixed = dated.find((x) => nameKey(x.name) === k);
      const evidence = firstLast.get(k);
      ringNames.push(
        compact({
          name: n,
          from: fixed?.from,
          to: fixed?.to,
          note: fixed?.note,
          sources: fixed?.sources,
          billed: evidence ? { first: evidence.from, last: evidence.to } : undefined,
        }) as RingName,
      );
    }
    for (const x of dated) {
      if (seenKeys.has(nameKey(x.name))) continue;
      ringNames.push(compact({ ...x }) as RingName);
    }
    for (const x of extraNames.get(id) ?? []) if (!seenKeys.has(nameKey(x.name))) ringNames.push(x);

    const pres = records.map((rec) => presentation[rec.legacy]).find(Boolean) ?? {};
    const placeholder = r.placeholder ?? pres.placeholder;
    const rosters = compact([
      { asOf: d.asOf, brands: unique<string>(records.flatMap((rec) => rec.roster?.brands ?? (rec.roster?.brand ? [rec.roster.brand] : []))) },
      ...records
        .map((rec) => year2025[rec.legacy])
        .filter(Boolean)
        .map((y: any) => ({ asOf: '2025', brands: y.brands, name: y.name !== name ? y.name : undefined })),
      ...records
        .map((rec) => archiveBrands[rec.legacy])
        .filter(Boolean)
        .map((brands: string[]) => ({ asOf: 'archive', brands })),
    ]);

    const merged = records.length > 1 ? Object.assign({}, ...records.slice(1).map((x) => x.profile), p) : p;
    const person: Person = compact({
      id,
      name,
      gender: placeholder === 'female' || placeholder === 'male' ? placeholder : undefined,
      genderBasis: placeholder ? 'legacy-placeholder' : undefined,
      ringNames,
      debut: merged.debut ? { date: isoDate(merged.debut), precision: merged.debutPrecision ?? undefined, source: merged.debutSource } : undefined,
      careerEnd: merged.careerEnd
        ? { date: isoDate(merged.careerEnd), label: merged.careerEndLabel, source: merged.careerEndSource }
        : undefined,
      displayThrough: merged.displayThrough,
      status: merged.careerStatus ? { value: merged.careerStatus, source: merged.careerStatusSource } : undefined,
      promotions: merged.promotions,
      titleSummary: merged.titles?.map((t: any) => compact({ name: t.name, count: t.count, source: t.source })),
      titleTotal: merged.titleTotal,
      awards: merged.awards,
      externalTotals: merged.stats
        ? compact({ provider: 'cagematch', ...merged.stats, source: merged.statsSource, crawl: merged.statsCrawl })
        : undefined,
      summary: merged.summary,
      affiliation: pres.affiliation,
      rosters,
      partial: merged.partial || undefined,
      scopes: compact({ titles: merged.titleScope, reigns: merged.reignScope, record: merged.recordScope }),
      archiveFirst: merged.archiveFirst,
      archiveLast: merged.archiveLast,
      checked: merged.checked,
      spanChecked: merged.careerSpanChecked,
      sources: unique<string>(
        records.flatMap((rec) => [
          rec.profile?.source,
          rec.profile?.debutSource,
          rec.profile?.careerEndSource,
          rec.profile?.careerStatusSource,
          rec.profile?.statsSource,
          rec.roster?.source,
          presentation[rec.legacy]?.affiliation?.source,
        ]),
      ),
      legacyIds,
      legacyFlags: compact({
        yearRoster: r.yearRoster,
        archiveOnly: r.archiveOnly,
        archiveProfile: r.archiveProfile,
        hadPortrait: records.some((rec) => rec.roster?.portrait) || undefined,
      }),
    }) as Person;
    person.ringNames ??= [];
    person.sources ??= [];
    people.set(id, person);
  }

  // Curated career content for Cody Rhodes and Hulk Hogan.
  const segRef = (legacyMomentId: string | undefined) => (legacyMomentId ? maps.segments[legacyMomentId] : undefined);
  for (const legacy of Object.keys(d.careerExplorers ?? {})) {
    const id = identity.pid(legacy);
    const person = id ? people.get(id) : undefined;
    if (!person) continue;
    const periods = (d.careerPromotions?.periods ?? []).filter((x: any) => x.person === legacy);
    const relationships = d.careerRelationshipData?.[legacy];
    const signature = legacy === 'cody-rhodes' ? d.codyExplorer?.signatureMatches : d.hoganCareer?.person === legacy ? d.hoganCareer.signatureMatches : [];
    const html = { ...(rendered.careerExplorers?.[legacy] ?? {}) };
    if (rendered.careerRelationships?.[legacy]) html.relationships = rendered.careerRelationships[legacy];
    person.curated = compact({
      promotionPeriods: periods.map((x: any) =>
        compact({ id: x.id, name: x.name, fullName: x.full, start: x.start, end: x.end, note: x.note, sources: unique([...(x.sources ?? []), x.source]) }),
      ),
      relationships,
      signatureMatches: (signature ?? []).map((m: any) =>
        compact({ segment: segRef(m.id), date: m.date, show: m.show, title: m.title, why: m.why, source: m.source }),
      ),
      profile: parseLegacyProfile(html.biography, html.details),
      legacyHtml: html,
      sources: legacy === 'cody-rhodes' ? d.codyExplorer?.sources : undefined,
    });
    if (legacy === d.hoganCareer?.person && d.hoganCareer.profile) {
      const hp = d.hoganCareer.profile;
      person.debut = compact({ date: isoDate(hp.debut) ?? undefined, precision: hp.debutPrecision, source: hp.debutSource }) as any;
      person.careerEnd = compact({ date: isoDate(hp.careerEnd) ?? undefined, label: hp.careerEndLabel, source: hp.careerEndSource }) as any;
      (person as any).displayThrough = hp.displayThrough ?? (person as any).displayThrough;
      (person as any).hoganProfile = hp;
    }
    const missing = (signature ?? []).filter((m: any) => !segRef(m.id));
    if (missing.length) log.queue({ kind: 'curated', title: `Signature matches without an archived segment (${person.name})`, records: missing.map((m: any) => m.id) });
  }
  return people;
}
