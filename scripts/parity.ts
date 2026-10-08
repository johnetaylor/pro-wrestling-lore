// Parity: every record in the v69 reference snapshot is accounted for in data/,
// with the same facts. Writes migration/v69/PARITY.md; exit code 1 on any failure.
// Usage: node scripts/parity.ts
import { join } from 'node:path';
import type { Family, Person, Show, Storyline, Title } from './lib/types.ts';
import { listFiles, readGzipJson, readJson, writeText } from './lib/util.ts';
import { applyCorrections } from './migrate/v69/corrections.ts';

const DATA = 'data';
const REF = 'reference/v69';
const MIG = 'migration/v69';
const d = readGzipJson<any>(join(REF, 'snapshot.json.gz')).data;
// Compare with v69 as corrected: the same documented fixes the migration applies.
const corrections = applyCorrections(d);
const maps = readJson<any>(join(MIG, 'legacy-ids.json'));

const people = new Map<string, Person>();
for (const f of listFiles(join(DATA, 'people'))) {
  const p = readJson<Person>(join(DATA, 'people', f));
  people.set(p.id, p);
}
const shows = new Map<string, Show>();
for (const f of listFiles(join(DATA, 'shows'))) {
  const s = readJson<Show>(join(DATA, 'shows', f));
  shows.set(s.id, s);
}
const segment = (ref: string | undefined) => {
  if (!ref) return undefined;
  const [showId, key] = ref.split('#');
  const show = shows.get(showId);
  const seg = show?.segments.find((s) => s.key === key);
  return show && seg ? { show, seg } : undefined;
};
const titles = new Map<string, Title>();
for (const f of listFiles(join(DATA, 'titles'))) {
  const t = readJson<Title>(join(DATA, 'titles', f));
  titles.set(t.id, t);
}
const storylines = new Map<string, Storyline>();
for (const f of listFiles(join(DATA, 'storylines'))) {
  const s = readJson<Storyline>(join(DATA, 'storylines', f));
  storylines.set(s.id, s);
}
const families = new Map<string, Family>();
for (const f of listFiles(join(DATA, 'families'))) {
  const x = readJson<Family>(join(DATA, 'families', f));
  families.set(x.id, x);
}

interface Check {
  area: string;
  label: string;
  total: number;
  failures: string[];
}
const checks: Check[] = [];
const check = (area: string, label: string, items: any[], test: (item: any) => string | null) => {
  const failures: string[] = [];
  for (const item of items) {
    const problem = test(item);
    if (problem) failures.push(problem);
  }
  checks.push({ area, label, total: items.length, failures });
};
const pid = (legacy: string) => maps.people[legacy];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// People.
check('People', 'Every v69 person maps to a person record', d.roster, (p) => (people.has(pid(p.id)) ? null : p.id));
check('People', 'Person names carry over (renamed characters excepted)', d.roster, (p) => {
  const person = people.get(pid(p.id));
  if (!person) return p.id;
  const names = [person.name, ...person.ringNames.map((r) => r.name)];
  return names.includes(p.name) ? null : `${p.id}: "${p.name}" not among ${names.join(', ')}`;
});

// Moments → segments.
const momentFacts = (m: any) => {
  const hit = segment(maps.segments[m.id]);
  if (!hit) return `${m.id}: no segment`;
  const { show, seg } = hit;
  const date = (seg.legacy as any)?.date ?? show.date;
  if (date !== m.date) return `${m.id}: date ${date} vs ${m.date}`;
  const competitors = seg.participants.filter((x) => x.role === 'competitor').map((x) => x.person);
  const involved = seg.participants.filter((x) => x.role === 'involved').map((x) => x.person);
  const wantCompetitors = [...new Set((m.people ?? []).map(pid))] as string[];
  const wantInvolved = [...new Set((m.involved ?? []).map(pid))].filter((x) => !wantCompetitors.includes(x as string)) as string[];
  if (!sameSet(competitors, wantCompetitors)) return `${m.id}: competitors differ`;
  if (!sameSet(involved, wantInvolved)) return `${m.id}: involved differ`;
  if ((m.result ?? undefined) !== seg.result) return `${m.id}: result differs`;
  if ((m.title || m.result || 'Untitled segment') !== seg.title) return `${m.id}: title differs`;
  if ((m.kind === 'title') !== Boolean(seg.titleMatch)) return `${m.id}: title-match flag differs`;
  if (m.source && !seg.sources.includes(m.source)) return `${m.id}: source missing`;
  return null;
};
check('Moments', 'Every career moment is a segment with the same date, people, result and source', d.moments, momentFacts);

// Show cards.
const archive: any[] = d.showsUI.archive;
const cardEntries = archive.flatMap((b) => [...(b.matches ?? []), ...(b.segments ?? [])].map((e) => ({ b, e })));
const showFor = (b: any) => maps.shows[`${b.id}@${b.date}`] ?? maps.shows[b.id];
check('Shows', 'Every Shows-tab card entry is a segment in its show', cardEntries, ({ b, e }) => {
  const hit = segment(maps.segments[e.id]);
  if (!hit) return `${b.id}/${e.id}: no segment`;
  if (hit.show.id !== showFor(b)) return `${b.id}/${e.id}: filed under ${hit.show.id}, show maps to ${showFor(b)}`;
  return null;
});
check('Shows', 'Every Shows-tab and career show maps to a show', [...archive, ...d.broadcasts], (b) => (shows.has(showFor(b)) ? null : b.id));
check('Shows', 'Show dates carry over', [...archive, ...d.broadcasts], (b) => {
  const s = shows.get(showFor(b));
  return s && s.date === b.date ? null : `${b.id}: ${s?.date} vs ${b.date}`;
});
check('Moments', 'Every career moment keeps its own date', d.moments, (m: any) => {
  const hit = segment(maps.segments[m.id]);
  if (!hit) return `${m.id}: no segment`;
  if (hit.show.date === m.date) return null;
  // A few v69 cards carry one match with a different (air) date; the segment keeps it.
  return (hit.seg.legacy as any)?.date === m.date ? null : `${m.id}: in ${hit.show.id}, dated ${m.date}`;
});

// Careers: each person's set of moments is unchanged.
const legacyByPerson = new Map<string, Set<string>>();
for (const m of d.moments) {
  for (const l of [...(m.people ?? []), ...(m.involved ?? [])]) {
    const id = pid(l);
    if (!legacyByPerson.has(id)) legacyByPerson.set(id, new Set());
    legacyByPerson.get(id)!.add(m.id);
  }
}
const segToLegacy = new Map<string, string>(Object.entries<string>(maps.segments).map(([legacy, ref]) => [ref, legacy]));
const newByPerson = new Map<string, Set<string>>();
for (const s of shows.values()) {
  for (const seg of s.segments) {
    const legacy = segToLegacy.get(`${s.id}#${seg.key}`);
    if (!legacy || !d.moments.some) continue;
    for (const p of seg.participants) {
      if (!newByPerson.has(p.person)) newByPerson.set(p.person, new Set());
      newByPerson.get(p.person)!.add(legacy);
    }
  }
}
const momentIds = new Set(d.moments.map((m: any) => m.id));
check('Careers', 'Each person appears in exactly the same career moments', [...people.keys()], (id) => {
  const want = legacyByPerson.get(id) ?? new Set<string>();
  const got = new Set([...(newByPerson.get(id) ?? [])].filter((l) => momentIds.has(l)));
  if (want.size !== got.size) return `${id}: ${got.size} vs ${want.size}`;
  for (const x of want) if (!got.has(x)) return `${id}: missing ${x}`;
  return null;
});

// Titles.
check('Titles', 'Every reign record maps to a reign with the same start and holders', d.careerReigns, (r) => {
  const ref = maps.reigns[r.id];
  if (!ref) return `${r.id}: unmapped`;
  const [tid, rid] = ref.split('#');
  const reign = titles.get(tid)?.reigns.find((x) => x.id === rid);
  if (!reign) return `${r.id}: missing ${ref}`;
  if (reign.start !== r.start) return `${r.id}: start differs`;
  for (const p of r.people ?? []) if (!reign.people.includes(pid(p))) return `${r.id}: holder ${p} missing`;
  if (!reign.legacyIds.includes(r.id)) return `${r.id}: legacy id not recorded`;
  return null;
});
check('Titles', 'Curated reign dates carry over exactly', d.careerReigns.filter((r: any) => r.curated), (r) => {
  const [tid, rid] = maps.reigns[r.id].split('#');
  const reign = titles.get(tid)!.reigns.find((x) => x.id === rid)!;
  return reign.end === (r.end ?? undefined) && reign.holder === r.holder ? null : `${r.id}: end or holder differs`;
});

// Storylines.
check('Storylines', 'Every storyline maps', d.stories, (s) => (storylines.has(maps.storylines[s.id]) ? null : s.id));
check('Storylines', 'Every chapter maps with its date and title', d.storyMoments, (c) => {
  const ref = maps.chapters[c.id];
  if (!ref) return `${c.id}: unmapped`;
  const [sid, cid] = ref.split('#');
  const ch = storylines.get(sid)?.chapters.find((x) => x.id === cid);
  if (!ch) return `${c.id}: missing ${ref}`;
  return ch.date === c.date && ch.title === c.title ? null : `${c.id}: date or title differs`;
});
check('Storylines', 'Archived chapters point at their segments', d.stories.flatMap((s: any) => (s.events ?? []).map((e: string) => ({ s, e }))), ({ s, e }) => {
  const sl = storylines.get(maps.storylines[s.id]);
  return sl?.chapters.some((c) => c.segment === maps.segments[e]) ? null : `${s.id}: ${e}`;
});

// Families.
check('Families', 'Every family keeps its members and links', d.dynasties, (f) => {
  const x = families.get(maps.families[f.id]);
  if (!x) return `${f.id}: missing`;
  if (x.members.length !== f.nodes.length) return `${f.id}: members ${x.members.length} vs ${f.nodes.length}`;
  if (x.links.length !== f.edges.length) return `${f.id}: links ${x.links.length} vs ${f.edges.length}`;
  for (const n of f.nodes) {
    const m = x.members.find((y) => y.id === n.id);
    if (!m) return `${f.id}: member ${n.id} missing`;
    if (n.careerId && m.person !== pid(n.careerId)) return `${f.id}: ${n.id} career link differs`;
  }
  return null;
});

// Ratings, calendar, lineages, curated content.
check('Ratings', 'Every rated match carries its rating sources', Object.entries<any>(d.matchRatings.matches), ([id, r]) => {
  const hit = segment(maps.segments[id]);
  if (!hit?.seg.rating) return `${id}: no rating`;
  return hit.seg.rating.sources.length === r.sources.length ? null : `${id}: ${hit.seg.rating.sources.length} vs ${r.sources.length} sources`;
});
const cal = readJson<any>(join(DATA, 'calendar', '2026.json'));
check('Calendar', 'Major events and weekly shows carry over', [['events', d.calendarData.events.length, cal.events.length], ['weekly', d.calendarData.weeklyEvents.length, cal.weeklyEvents.length]], ([k, a, b]) => (a === b ? null : `${k}: ${b} vs ${a}`));
const lin = readJson<any>(join(DATA, 'title-lineages.json'));
const L = d.championshipLineages;
check('Titles', 'Lineage titles, events and views carry over', [['titles', Object.keys(L.titles).length, Object.keys(lin.titles).length], ['events', L.events.length, lin.events.length], ['views', Object.keys(L.views).length, Object.keys(lin.views).length]], ([k, a, b]) => (a === b ? null : `${k}: ${b} vs ${a}`));
const curatedCases = [
  { legacy: 'cody-rhodes', periods: d.careerPromotions.periods.filter((x: any) => x.person === 'cody-rhodes').length, signature: d.codyExplorer.signatureMatches.length },
  { legacy: d.hoganCareer.person, periods: d.careerPromotions.periods.filter((x: any) => x.person === d.hoganCareer.person).length, signature: d.hoganCareer.signatureMatches.length },
];
check('People', 'Cody and Hogan keep their curated career content', curatedCases, (c) => {
  const p = people.get(pid(c.legacy));
  const cur = p?.curated;
  if (!cur) return `${c.legacy}: no curated content`;
  if ((cur.promotionPeriods?.length ?? 0) !== c.periods) return `${c.legacy}: periods ${cur.promotionPeriods?.length} vs ${c.periods}`;
  if ((cur.signatureMatches?.length ?? 0) !== c.signature) return `${c.legacy}: signature matches differ`;
  if (cur.signatureMatches?.some((m) => !m.segment)) return `${c.legacy}: a signature match lost its segment`;
  const rel = d.careerRelationshipData[c.legacy];
  for (const k of ['feuds', 'factions', 'teams']) if ((cur.relationships as any)?.[k]?.length !== rel[k].length) return `${c.legacy}: ${k} differ`;
  if (!cur.legacyHtml?.biography || !cur.legacyHtml?.details) return `${c.legacy}: explorer text missing`;
  // The structured profile must hold everything the explorer showed.
  const details = cur.legacyHtml.details;
  const prof = cur.profile;
  if (!prof?.intro || !prof.inBrief) return `${c.legacy}: biography not parsed`;
  if (!prof.trainedBy?.text) return `${c.legacy}: trainer not parsed`;
  const moves = (/<div class="signature-moves">([\s\S]*?)<\/div>/.exec(details)?.[1].match(/<span>/g) ?? []).length;
  if (prof.signatureMoves?.moves.length !== moves) return `${c.legacy}: signature moves ${prof.signatureMoves?.moves.length} vs ${moves}`;
  const items = (details.match(/<li>/g) ?? []).length;
  const parsed = (prof.associates?.length ?? 0) + (prof.guestCornermen?.length ?? 0);
  if (parsed !== items) return `${c.legacy}: associates ${parsed} vs ${items}`;
  const anchors = (details.match(/<a /g) ?? []).length;
  const links = (prof.trainedBy.links?.length ?? 0) + (prof.signatureMoves?.links?.length ?? 0) + (prof.links?.length ?? 0);
  if (links !== anchors) return `${c.legacy}: profile links ${links} vs ${anchors}`;
  return null;
});

// Report.
const failed = checks.filter((c) => c.failures.length);
const lines = [
  '# v69 parity report',
  '',
  `${checks.length - failed.length} of ${checks.length} checks pass.`,
  '',
  '| Area | Check | Records | Failures |',
  '| --- | --- | ---: | ---: |',
  ...checks.map((c) => `| ${c.area} | ${c.label} | ${c.total.toLocaleString('en-US')} | ${c.failures.length} |`),
  '',
  ...failed.flatMap((c) => [`## ${c.label}`, '', ...c.failures.slice(0, 20).map((f) => `- ${f}`), c.failures.length > 20 ? `- … ${c.failures.length - 20} more` : '', '']),
];
writeText(join(MIG, 'PARITY.md'), lines.join('\n'));
for (const c of checks) console.log(`${c.failures.length ? 'FAIL' : 'PASS'}  ${c.area.padEnd(10)} ${c.label} (${c.total})${c.failures.length ? ` — ${c.failures.length} failures, e.g. ${c.failures[0]}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
