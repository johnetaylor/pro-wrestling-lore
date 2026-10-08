// Audits the v69 reference snapshot: identity collisions, orphaned references,
// likely duplicates, missing sources and coverage gaps.
// Usage: node scripts/reference/audit.mjs reference/v69
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const dir = process.argv[2] ?? 'reference/v69';
const snap = JSON.parse(zlib.gunzipSync(readFileSync(join(dir, 'snapshot.json.gz'))));
const d = snap.data;
const SNAPSHOT_DATE = '2026-10-07';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const scheme = (id) =>
  id.startsWith('archive-person-') ? 'archive-person-*' : id.startsWith('hf-person-') ? 'hf-person-*' : id.startsWith('show-archive-') ? 'show-archive-*' : 'curated slug';
const tally = (items, key) => {
  const out = {};
  for (const item of items) {
    const k = key(item) ?? '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
};
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '(invalid url)';
  }
};
const validDate = (s) => typeof s === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s);
const year = (s) => (validDate(s) ? s.slice(0, 4) : '(no date)');

const findings = [];
const finding = (severity, area, title, count, detail, sample = []) => findings.push({ severity, area, title, count, detail, sample });

// ---------- People ----------
const roster = d.roster;
const rosterIds = new Map();
const duplicateRosterIds = [];
for (const p of roster) {
  if (rosterIds.has(p.id)) duplicateRosterIds.push(p.id);
  rosterIds.set(p.id, p);
}
const profiles = d.profiles;
const rosterWithoutProfile = roster.filter((p) => !profiles[p.id]).map((p) => p.id);
const profileWithoutRoster = Object.keys(profiles).filter((id) => !rosterIds.has(id));
const placeholder = (p) => p.placeholder ?? d.careerPresentation?.members?.[p.id]?.placeholder ?? 'unknown';
const genderByScheme = {};
for (const p of roster) {
  const s = scheme(p.id);
  genderByScheme[s] ??= {};
  genderByScheme[s][placeholder(p)] = (genderByScheme[s][placeholder(p)] ?? 0) + 1;
}

// Names and aliases that point at more than one ID.
const nameIndex = new Map();
const addName = (name, id) => {
  const k = norm(name);
  if (!k) return;
  if (!nameIndex.has(k)) nameIndex.set(k, { names: new Set(), ids: new Set() });
  nameIndex.get(k).names.add(name);
  nameIndex.get(k).ids.add(id);
};
for (const p of roster) {
  addName(p.name, p.id);
  for (const a of p.aliases ?? []) addName(a, p.id);
  for (const a of profiles[p.id]?.aliases ?? []) addName(a, p.id);
}
for (const [id, name] of Object.entries(d.importedEventNames ?? {})) addName(name, id);
const nameCollisions = [...nameIndex.values()]
  .filter((v) => v.ids.size > 1)
  .map((v) => ({ names: [...v.names], ids: [...v.ids], schemes: [...new Set([...v.ids].map(scheme))] }))
  .sort((a, b) => b.ids.length - a.ids.length);
const crossSchemeCollisions = nameCollisions.filter((c) => c.schemes.length > 1);

if (duplicateRosterIds.length) finding('high', 'People', 'Duplicate roster IDs', duplicateRosterIds.length, 'The same ID appears twice in the roster.', duplicateRosterIds.slice(0, 10));
finding(
  crossSchemeCollisions.length ? 'high' : 'info',
  'People',
  'Same name under different ID schemes',
  crossSchemeCollisions.length,
  'A name or alias maps to IDs from different schemes (curated, archive-person, hf-person). Each needs a merge decision before one-ID-per-person.',
  crossSchemeCollisions.slice(0, 12).map((c) => `${c.names.join(' / ')} → ${c.ids.join(', ')}`),
);
finding(
  'medium',
  'People',
  'Same name under different IDs within one scheme',
  nameCollisions.length - crossSchemeCollisions.length,
  'Usually different people who share a ring name, sometimes one person split in two. Review case by case.',
  nameCollisions.filter((c) => c.schemes.length === 1).slice(0, 12).map((c) => `${c.names.join(' / ')} → ${c.ids.join(', ')}`),
);
if (rosterWithoutProfile.length || profileWithoutRoster.length)
  finding('medium', 'People', 'Roster and profiles out of step', rosterWithoutProfile.length + profileWithoutRoster.length, 'Roster entries without a profile, or profiles without a roster entry.', [...rosterWithoutProfile, ...profileWithoutRoster].slice(0, 10));
const unknownGender = roster.filter((p) => placeholder(p) === 'unknown').length;
finding(
  'medium',
  'People',
  'Gender comes from portrait placeholders',
  roster.length,
  `Gender is only recorded as a placeholder image choice (${Object.entries(tally(roster, placeholder)).map(([k, v]) => `${k}: ${v}`).join(', ')}). The bulk source defaults most people to male, so this needs verification before women's divisions launch.${unknownGender ? ` ${unknownGender} have none.` : ''}`,
);

// ---------- Moments ----------
const moments = d.moments;
const momentIds = new Map();
const duplicateMomentIds = [];
for (const m of moments) {
  if (momentIds.has(m.id)) duplicateMomentIds.push(m.id);
  momentIds.set(m.id, m);
}
const orphanPeople = {};
for (const m of moments) {
  for (const id of [...(m.people ?? []), ...(m.involved ?? [])]) {
    if (!rosterIds.has(id)) orphanPeople[id] = (orphanPeople[id] ?? 0) + 1;
  }
}
const noPeople = moments.filter((m) => !(m.people ?? []).length);
const badDates = moments.filter((m) => !validDate(m.date));
const futureDates = moments.filter((m) => validDate(m.date) && m.date > SNAPSHOT_DATE);
const noSource = moments.filter((m) => !m.source);
const broadcastIds = new Set(d.broadcasts.map((b) => b.id));
const archiveIds = new Set((d.showsUI?.archive ?? []).map((b) => b.id));
const danglingBroadcast = moments.filter((m) => m.broadcastId && !broadcastIds.has(m.broadcastId) && !archiveIds.has(m.broadcastId));
const unresolvedCompetitors = moments.filter((m) => (m.competitors?.length ?? 0) > (m.people?.length ?? 0));

// Likely double-counted matches: same date, same participants, different IDs.
const matchGroups = new Map();
for (const m of moments) {
  if (m.segmentType !== 'match' && m.kind === 'story') continue;
  if ((m.people ?? []).length < 2) continue;
  const key = `${m.date}|${[...m.people].sort().join('+')}`;
  if (!matchGroups.has(key)) matchGroups.set(key, []);
  matchGroups.get(key).push(m);
}
const likelyDuplicateMatches = [...matchGroups.values()].filter((g) => g.length > 1);

if (duplicateMomentIds.length) finding('high', 'Moments', 'Duplicate moment IDs', duplicateMomentIds.length, 'Two records share one ID.', duplicateMomentIds.slice(0, 10));
if (Object.keys(orphanPeople).length)
  finding('high', 'Moments', 'Participants that are not in the roster', Object.keys(orphanPeople).length, 'Moment participant IDs with no person record.', Object.entries(orphanPeople).slice(0, 10).map(([k, v]) => `${k} (${v})`));
finding(
  likelyDuplicateMatches.length ? 'high' : 'info',
  'Moments',
  'Likely double-counted matches',
  likelyDuplicateMatches.length,
  `Same date and same participants under different IDs. Usually one bout recorded twice (mirrored names, a generic title next to a named one); sometimes a real second bout (a restart, a two-fall match). The old site already leaves ${d.statisticsQuality?.excluded ?? 'some'} matches out of its statistics; each group needs a merge-or-keep decision.`,
  likelyDuplicateMatches.slice(0, 10).map((g) => `${g[0].date} ${g[0].title ?? ''} → ${g.map((m) => m.id).join(', ')}`),
);
if (unresolvedCompetitors.length)
  finding('medium', 'Moments', 'Competitor lists mix teams, members and guests', unresolvedCompetitors.length, 'More competitor names than linked people: team names sit next to their members ("The MFTs", "Solo Sikoa", ...) and some guests have no profile. The new model stores teams as their own records.', unresolvedCompetitors.slice(0, 6).map((m) => `${m.id}: ${(m.competitors ?? []).join(' vs ')}`));
if (noPeople.length) finding('low', 'Moments', 'Moments with no linked people', noPeople.length, 'Mostly non-match segments; they cannot appear on any career strip.', noPeople.slice(0, 8).map((m) => `${m.id}: ${m.title ?? ''}`));
if (badDates.length || futureDates.length) finding('high', 'Moments', 'Missing, malformed or future dates', badDates.length + futureDates.length, `Valid dates are YYYY, YYYY-MM or YYYY-MM-DD on or before ${SNAPSHOT_DATE}.`, [...badDates, ...futureDates].slice(0, 10).map((m) => `${m.id}: ${m.date}`));
if (noSource.length) finding('high', 'Moments', 'Moments without a source', noSource.length, 'Every record needs at least one source.', noSource.slice(0, 10).map((m) => m.id));
if (danglingBroadcast.length) finding('medium', 'Moments', 'Moments pointing at a show that does not exist', danglingBroadcast.length, 'broadcastId has no matching show record.', danglingBroadcast.slice(0, 10).map((m) => `${m.id} → ${m.broadcastId}`));

// ---------- Shows ----------
const broadcasts = d.broadcasts;
const showKey = (b) => `${norm(b.show)}|${b.date}`;
const sameShowSameDate = Object.entries(tally(broadcasts, showKey)).filter(([, n]) => n > 1);
const cardEntries = broadcasts.flatMap((b) => (b.matches ?? []).map((m) => ({ b, m })));
const cardEntriesNotInMoments = cardEntries.filter(({ m }) => !momentIds.has(m.id));
const broadcastsNoSource = broadcasts.filter((b) => !b.source && !b.recap);
const archive = d.showsUI?.archive ?? [];
const archiveOnly = archive.filter((b) => !broadcastIds.has(b.id));

if (sameShowSameDate.length) finding('medium', 'Shows', 'Same show listed twice on one date', sameShowSameDate.length, 'Possible duplicate episode records (or two-night events sharing a name).', sameShowSameDate.slice(0, 10).map(([k, n]) => `${k} ×${n}`));
if (cardEntriesNotInMoments.length) {
  const unlinked = cardEntriesNotInMoments.filter(({ m }) => !(m.people ?? []).length).length;
  finding(
    'medium',
    'Shows',
    'Card matches missing from career data',
    cardEntriesNotInMoments.length,
    `Matches on show cards that no career strip shows; ${unlinked} have no linked participants at all (for example 2025 women's title matches whose title field holds a single name).`,
    cardEntriesNotInMoments.slice(0, 6).map(({ b, m }) => `${b.id}: "${m.title}"`),
  );
}
if (broadcastsNoSource.length) finding('high', 'Shows', 'Shows without a source', broadcastsNoSource.length, 'No card source or recap link.', broadcastsNoSource.slice(0, 10).map((b) => b.id));
finding('info', 'Shows', 'Shows tab lists more episodes than the career data', archiveOnly.length, 'Episodes in the Shows archive with no record in the main show list (listed without indexed cards). They migrate as shows with coverage "listed only".', Object.entries(tally(archiveOnly, (b) => b.category ?? b.show)).slice(0, 8).map(([k, v]) => `${k}: ${v}`));

// Weekly coverage by series and year: episodes with an indexed card, and episodes listed in the Shows tab.
const series = (b) => {
  const s = norm(b.show);
  if (/^(monday night )?raw|^wweraw|^raw/.test(s) || s.startsWith('mondaynightraw') || s === 'raw' || s.startsWith('rawis')) return 'Raw';
  if (s.includes('smackdown')) return 'SmackDown';
  if (s.startsWith('nxt') && !s.includes('takeover') && !s.includes('standanddeliver') && !s.includes('deadline') && !s.includes('vengeance') && !s.includes('battleground') && !s.includes('heatwave') && !s.includes('nomercy') && !s.includes('halloweenhavoc')) return 'NXT';
  return null;
};
const SERIES_START = { Raw: 1993, SmackDown: 1999, NXT: 2010 };
const countBySeriesYear = (list) => {
  const out = {};
  for (const b of list) {
    const s = series(b);
    if (!s || !validDate(b.date)) continue;
    out[s] ??= {};
    const y = b.date.slice(0, 4);
    out[s][y] = (out[s][y] ?? 0) + 1;
  }
  return out;
};
const weekly = countBySeriesYear(broadcasts.filter((b) => (b.matches ?? []).length));
const weeklyListed = countBySeriesYear(archive);
const gaps = [];
for (const [s, start] of Object.entries(SERIES_START)) {
  for (let y = start + 1; y <= 2025; y++) {
    const n = weekly[s]?.[String(y)] ?? 0;
    if (n < 45) gaps.push({ series: s, year: y, episodes: n, listed: weeklyListed[s]?.[String(y)] ?? 0 });
  }
}
finding('high', 'Coverage', 'Weekly-show years with fewer than 45 indexed cards', gaps.length, 'Full years (Raw from 1994, SmackDown from 2000, NXT from 2011, through 2025) where fewer than 45 of roughly 52 episodes have an indexed card. Wave 1 fills these.', gaps.slice(0, 14).map((g) => `${g.series} ${g.year}: ${g.episodes} with cards, ${g.listed} listed`));


// ---------- Titles ----------
const careerReigns = d.careerReigns ?? [];
const reignOrphans = careerReigns.filter((r) => (r.people ?? []).some((id) => !rosterIds.has(id)));
const reignBadDates = careerReigns.filter((r) => !validDate(r.start) || (r.end && validDate(r.end) && r.end < r.start));
// One team reign is often stored once per member (it came from each member's
// profile). Collapse records with the same title, start date and a shared
// holder into one reign before looking for overlaps.
const byTitle = new Map();
for (const r of careerReigns) {
  if (!validDate(r.start)) continue;
  const k = norm(r.title ?? r.belt);
  if (!byTitle.has(k)) byTitle.set(k, []);
  byTitle.get(k).push(r);
}
const shareHolder = (a, b) => (a.people ?? []).some((id) => (b.people ?? []).includes(id)) || norm(a.holder) === norm(b.holder);
const duplicateReignRecords = [];
const overlapsSameHolder = [];
const overlaps = [];
for (const list of byTitle.values()) {
  list.sort((a, b) => a.start.localeCompare(b.start) || String(a.end ?? '9999').localeCompare(String(b.end ?? '9999')));
  const merged = [];
  for (const r of list) {
    const twin = merged.find((m) => m.start === r.start && shareHolder(m, r));
    if (twin) {
      duplicateReignRecords.push(`${r.title ?? r.belt}: ${r.holder} from ${r.start} (${twin.id} + ${r.id})`);
      twin.people = [...new Set([...(twin.people ?? []), ...(r.people ?? [])])];
      continue;
    }
    merged.push({ ...r });
  }
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1];
    const cur = merged[i];
    if (!prev.end || !(cur.start < prev.end)) continue;
    const line = `${cur.title ?? cur.belt}: ${prev.holder} (${prev.start} to ${prev.end}) overlaps ${cur.holder} (from ${cur.start})`;
    if (shareHolder(prev, cur)) overlapsSameHolder.push(line);
    else overlaps.push(line);
  }
}
if (reignOrphans.length) finding('high', 'Titles', 'Reigns held by people not in the roster', reignOrphans.length, 'Reign holder IDs with no person record.', reignOrphans.slice(0, 8).map((r) => `${r.id}`));
if (reignBadDates.length) finding('high', 'Titles', 'Reigns with missing or reversed dates', reignBadDates.length, 'Start missing, or end before start.', reignBadDates.slice(0, 8).map((r) => `${r.id}: ${r.start} → ${r.end}`));
finding('low', 'Titles', 'One team reign stored once per member', duplicateReignRecords.length, 'Same title, same start, shared holder. Migration merges each set into one reign with its members.', duplicateReignRecords.slice(0, 6));
finding(overlapsSameHolder.length ? 'medium' : 'info', 'Titles', 'Same holder, conflicting reign dates', overlapsSameHolder.length, 'Two records of one holder overlap with different start dates; one of the dates is wrong.', overlapsSameHolder.slice(0, 8));
finding(overlaps.length ? 'medium' : 'info', 'Titles', 'Different holders overlapping on one title', overlaps.length, 'Two holders at once. A few are real (unrecognized champions, brand splits), most are date errors.', overlaps.slice(0, 10));

// Championship names: the same title appears under several spellings.
const titleNames = [...new Set(careerReigns.map((r) => r.title ?? r.belt).filter(Boolean))];
const malformedTitleNames = titleNames.filter((t) => /^[^A-Za-z0-9]|[^A-Za-z0-9.)]$/.test(t.trim()) || t !== t.trim());
const wweChampionshipNames = titleNames.filter(
  (t) =>
    /\b(wwe|wwf)\b.*\bchampionship\b/i.test(t) &&
    !/tag|intercontinental|united states|united kingdom|women|cruiserweight|hardcore|european|light heavyweight|speed|nxt|north american|heritage|evolve|24\/7|divas|universal|world heavyweight championship$/i.test(t),
);
finding(
  'medium',
  'Titles',
  'Championship names need one registry',
  titleNames.length,
  `Reigns name ${titleNames.length} distinct titles, but one championship often appears under several spellings; the WWE Championship alone appears as ${wweChampionshipNames.map((t) => `"${t}"`).join(', ')}. ${malformedTitleNames.length === 1 ? '1 name is' : `${malformedTitleNames.length} names are`} malformed (stray punctuation). Migration maps every spelling to one title record with its lineage.`,
  malformedTitleNames.slice(0, 6),
);

// ---------- Storylines, families, ratings ----------
const storyEventRefs = d.stories.flatMap((s) => (s.events ?? []).map((e) => ({ s, e })));
const storyDangling = storyEventRefs.filter(({ e }) => !momentIds.has(e));
const storyPeopleOrphans = [...d.stories.flatMap((s) => s.people ?? []), ...d.storyMoments.flatMap((m) => m.people ?? [])].filter((id) => !rosterIds.has(id));
if (storyDangling.length) finding('medium', 'Storylines', 'Storyline chapters pointing at missing moments', storyDangling.length, '', storyDangling.slice(0, 8).map(({ s, e }) => `${s.id}: ${e}`));
if (storyPeopleOrphans.length) finding('medium', 'Storylines', 'Storyline people not in the roster', new Set(storyPeopleOrphans).size, 'Expected for historical figures without profiles; each becomes a person record.', [...new Set(storyPeopleOrphans)].slice(0, 10));
const familyNodes = d.dynasties.flatMap((f) => (f.nodes ?? []).map((n) => ({ f, n })));
const familyLinkOrphans = familyNodes.filter(({ n }) => n.careerId && !rosterIds.has(n.careerId));
const familyEdgeOrphans = d.dynasties.flatMap((f) => {
  const ids = new Set((f.nodes ?? []).map((n) => n.id));
  return (f.edges ?? []).filter((e) => !ids.has(e.a) || !ids.has(e.b)).map((e) => `${f.id}: ${e.a} → ${e.b}`);
});
const familyUnlinked = familyNodes.filter(({ n }) => !n.careerId).length;
if (familyLinkOrphans.length) finding('medium', 'Families', 'Family members linked to missing careers', familyLinkOrphans.length, '', familyLinkOrphans.slice(0, 8).map(({ f, n }) => `${f.id}: ${n.name} → ${n.careerId}`));
if (familyEdgeOrphans.length) finding('high', 'Families', 'Family links to missing members', familyEdgeOrphans.length, '', familyEdgeOrphans.slice(0, 8));
finding('info', 'Families', 'Family members without a career link', familyUnlinked, `Of ${familyNodes.length} family members, these have no career page link yet; many are historical relatives.`);
const ratingIds = Object.keys(d.matchRatings?.matches ?? {});
const ratingOrphans = ratingIds.filter((id) => !momentIds.has(id));
if (ratingOrphans.length) finding('medium', 'Ratings', 'Ratings for matches that do not exist', ratingOrphans.length, '', ratingOrphans.slice(0, 10));

// ---------- Sources ----------
const sourceHosts = tally(moments, (m) => host(m.source));
const bulkSourced = moments.filter((m) => host(m.source) === 'huggingface.co').length;
finding('info', 'Sources', 'Where moment sources point', moments.length, 'Top source sites for moments. Records citing only the bulk dataset need an independent source before they count as verified.', Object.entries(sourceHosts).slice(0, 8).map(([k, v]) => `${k}: ${v}`));
if (bulkSourced) finding('medium', 'Sources', 'Moments citing only the bulk dataset', bulkSourced, 'Cite the confirming broadcast source instead.');

// ---------- Summary ----------
const counts = {
  people: roster.length,
  peopleByScheme: tally(roster, (p) => scheme(p.id)),
  peopleByGenderPlaceholder: tally(roster, placeholder),
  genderByScheme,
  moments: moments.length,
  momentsByKind: tally(moments, (m) => m.kind),
  momentsBySegmentType: tally(moments, (m) => m.segmentType),
  momentYears: (() => {
    const ys = moments.map((m) => year(m.date)).filter((y) => y !== '(no date)').sort();
    return { first: ys[0], last: ys.at(-1) };
  })(),
  shows: broadcasts.length,
  showsByCategory: tally(broadcasts, (b) => b.category),
  showsTabArchive: archive.length,
  cardEntries: cardEntries.length,
  careerReigns: careerReigns.length,
  titlesWithReigns: byTitle.size,
  lineageTitles: Object.keys(d.championshipLineages?.titles ?? {}).length,
  storylines: d.stories.length,
  storylinesByPromotion: tally(d.stories, (s) => s.promotion ?? 'wwe'),
  storyChapters: d.storyMoments.length,
  families: d.dynasties.length,
  familyMembers: familyNodes.length,
  ratedMatches: ratingIds.length,
  calendarEvents: d.calendarData?.events?.length ?? 0,
  calendarWeeklyEvents: d.calendarData?.weeklyEvents?.length ?? 0,
  profilesWithDebut: Object.values(profiles).filter((p) => p.debut).length,
  profilesPartial: Object.values(profiles).filter((p) => p.partial).length,
  profilesWithCagematchTotals: Object.values(profiles).filter((p) => p.stats).length,
};

// Logic that lives in code today and must be re-implemented, not migrated as data.
const logicToPort = [
  'PLE detection: app.js marks a show as PLE by category or by a show-name pattern (WrestleMania, SummerSlam, Royal Rumble, ...).',
  'Historical display names: a person shows a different name before 2025 or in 2025 (importedEventNames, yearRosters).',
  'Default roster filter: RAW and SmackDown checked, NXT and AAA unchecked; brands combine with OR.',
  'PWL rating: equal-weight mean of available source scores on a 0–100 scale (matchRatings.method, ratingUI.normalize).',
  'Statistics record sets and the 106 excluded matches (statisticsRecord, statisticsQuality).',
  'Rivalry clustering for feud highlighting (careerRivalries.find / clusters).',
  'Championship lineage tree layout (lineageUI.config / layout).',
  'Show catalog grouping by promotion and series (showsUI.seriesFor).',
  'Explorer HTML for Cody and Hogan: biography, trained by, moves, managers, signature matches (captured as rendered HTML in the snapshot).',
];

const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

writeFileSync(
  join(dir, 'audit.json'),
  JSON.stringify(
    {
      snapshotSha256: snap.meta ? JSON.parse(readFileSync(join(dir, 'snapshot-meta.json'), 'utf8')).sha256OfJson : null,
      counts,
      findings,
      details: {
        nameCollisions,
        orphanPeople,
        likelyDuplicateMatches: likelyDuplicateMatches.map((g) => g.map((m) => ({ id: m.id, date: m.date, show: m.show, title: m.title, source: m.source }))),
        weeklyCoverage: weekly,
        weeklyListed,
        weeklyGaps: gaps,
        reignOverlaps: overlaps,
        reignOverlapsSameHolder: overlapsSameHolder,
        duplicateReignRecords,
        sourceHosts,
      },
      logicToPort,
    },
    null,
    1,
  ) + '\n',
);

// ---------- Markdown report ----------
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n));
const lines = [];
lines.push('# Reference audit: Pro Wrestling Lore v69', '');
lines.push(`Snapshot of the published site data as of ${SNAPSHOT_DATE}, captured by running the site's own scripts. Full lists are in \`audit.json\`.`, '');
lines.push('## What the site holds', '');
lines.push('| Item | Count |', '| --- | ---: |');
for (const [label, value] of [
  ['People', counts.people],
  ['  curated slugs', counts.peopleByScheme['curated slug'] ?? 0],
  ['  archive-person IDs', counts.peopleByScheme['archive-person-*'] ?? 0],
  ['  hf-person IDs', counts.peopleByScheme['hf-person-*'] ?? 0],
  ['  female placeholder', counts.peopleByGenderPlaceholder.female ?? 0],
  ['Moments', counts.moments],
  ['  matches', counts.momentsByKind.match ?? 0],
  ['  title matches', counts.momentsByKind.title ?? 0],
  ['  non-match segments', counts.momentsByKind.story ?? 0],
  ['Shows with cards', counts.shows],
  ['Shows listed in the Shows tab', counts.showsTabArchive],
  ['Title reigns', counts.careerReigns],
  ['Titles with reigns', counts.titlesWithReigns],
  ['Lineage titles', counts.lineageTitles],
  ['Storylines', counts.storylines],
  ['Storyline chapters', counts.storyChapters],
  ['Families / members', `${counts.families} / ${counts.familyMembers}`],
  ['Rated matches', counts.ratedMatches],
  ['Calendar events (2026)', `${counts.calendarEvents} + ${counts.calendarWeeklyEvents} weekly`],
]) {
  lines.push(`| ${label.replace(/^ {2}/, '&nbsp;&nbsp;')} | ${fmt(value)} |`);
}
lines.push('', `Moments run from ${counts.momentYears.first} to ${counts.momentYears.last}.`, '');
lines.push('## Findings', '');
lines.push('| Severity | Area | Finding | Count |', '| --- | --- | --- | ---: |');
for (const f of findings) lines.push(`| ${f.severity} | ${f.area} | ${f.title} | ${fmt(f.count)} |`);
lines.push('');
for (const f of findings) {
  if (!f.count) continue;
  lines.push(`### ${f.title} (${fmt(f.count)})`, '');
  if (f.detail) lines.push(f.detail, '');
  if (f.sample.length) {
    for (const s of f.sample) lines.push(`- ${s}`);
    lines.push('');
  }
}
lines.push('## Weekly coverage by year', '', 'Episodes with an indexed card / episodes listed in the Shows tab.', '');
const years = [...new Set([...Object.values(weekly), ...Object.values(weeklyListed)].flatMap((y) => Object.keys(y)))].sort();
lines.push(`| Year | ${Object.keys(SERIES_START).join(' | ')} |`, `| --- | ${Object.keys(SERIES_START).map(() => '---:').join(' | ')} |`);
for (const y of years) lines.push(`| ${y} | ${Object.keys(SERIES_START).map((s) => `${weekly[s]?.[y] ?? 0} / ${weeklyListed[s]?.[y] ?? 0}`).join(' | ')} |`);
lines.push('', '## Logic to re-implement', '', 'These rules live in code, not data, so migration carries them over as features, not records.', '');
for (const l of logicToPort) lines.push(`- ${l}`);
lines.push('');
writeFileSync(join(dir, 'AUDIT.md'), lines.join('\n'));

console.log(JSON.stringify({ counts: { people: counts.people, moments: counts.moments, shows: counts.shows, reigns: counts.careerReigns }, findings: findings.map((f) => `${f.severity.padEnd(6)} ${f.area.padEnd(10)} ${f.title}: ${f.count}`) }, null, 1));
