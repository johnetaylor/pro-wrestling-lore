// Applies the reviewed identity decisions in migration/identity-fixes.json: splits records that
// hold more than one person, merges duplicate records into one, renames IDs, and rewrites every
// reference to them in data/ and migration/v69/legacy-ids.json. Applying twice changes nothing,
// so it can run again after the title import recreates people (see the research repository).
// Usage: node scripts/identity-fixes.ts [--dry-run] [--allow-pending]
//
// --allow-pending: for a run before the title import re-creates the people and reigns some decisions
// name (staging/titles/README.md in the research repository). Decisions whose records aren't
// there yet are listed and left for the run after the import, instead of failing.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Family, Person, RingName, Show, Storyline, Title } from './lib/types.ts';
import { listFiles, nameKey, readJson, writeJson } from './lib/util.ts';

type Gender = 'male' | 'female';

export interface IdentitySplit {
  from: string;
  to: string;
  /** Creates `to` when it doesn't exist yet. */
  create?: { name: string; gender?: Gender; summary?: string; sources: string[] };
  segments?: string[];
  reigns?: { title: string; start: string }[];
  /** Profile fields that describe `to`, not `from`. */
  moveFields?: (keyof Person)[];
  moveRingNames?: string[];
  removeRingNames?: string[];
  addRingNames?: RingName[];
  /** Roster entries (by `asOf`) that list `to`. */
  moveRosters?: string[];
  /** The same move in v69's own records, applied to the snapshot for parity (corrections.ts).
   * `from`/`to` are v69 IDs (`to` defaults to the split's own `to`); records move by ID or by date. */
  v69?: { from: string; to?: string; name?: string; before?: string; after?: string; records?: string[] };
  reason: string;
  sources?: string[];
}

export interface IdentityMerge {
  into: string;
  from: string[];
  name?: string;
  addRingNames?: RingName[];
  gender?: Gender;
  reason: string;
  sources?: string[];
}

export interface IdentityFixes {
  note: string;
  splits: IdentitySplit[];
  merges: IdentityMerge[];
  ringNameEdits: { person: string; remove?: string[]; rename?: Record<string, string>; reason: string }[];
  updates: { person: string; summary?: string; sources?: string[]; reason: string }[];
  segmentNotes: { segment: string; context: string; sources: string[] }[];
}

export const FIXES_PATH = 'migration/identity-fixes.json';

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, 'allow-pending': { type: 'boolean', default: false } } });
const DATA = 'data';
const LEGACY = 'migration/v69/legacy-ids.json';
const fixes = readJson<IdentityFixes>(FIXES_PATH);

// ---------- Load ----------
const people = new Map<string, Person>();
for (const f of listFiles(join(DATA, 'people'))) {
  const p = readJson<Person>(join(DATA, 'people', f));
  people.set(p.id, p);
}
const shows = new Map<string, { path: string; show: Show }>();
for (const f of listFiles(join(DATA, 'shows'))) {
  const s = readJson<Show>(join(DATA, 'shows', f));
  shows.set(s.id, { path: join(DATA, 'shows', f), show: s });
}
const titles = new Map<string, { path: string; title: Title }>();
for (const f of listFiles(join(DATA, 'titles'))) {
  const t = readJson<Title>(join(DATA, 'titles', f));
  titles.set(t.id, { path: join(DATA, 'titles', f), title: t });
}
const storylines = listFiles(join(DATA, 'storylines')).map((f) => ({ path: join(DATA, 'storylines', f), story: readJson<Storyline>(join(DATA, 'storylines', f)) }));
const families = listFiles(join(DATA, 'families')).map((f) => ({ path: join(DATA, 'families', f), family: readJson<Family>(join(DATA, 'families', f)) }));
const legacy = readJson<any>(LEGACY);

const originalPeople = new Map([...people].map(([id, p]) => [id, JSON.stringify(p)]));
const touchedShows = new Set<string>();
const touchedTitles = new Set<string>();
const affected = new Set<string>();
const log: string[] = [];
const pending: string[] = [];
let legacyChanged = false;
/** A decision whose records aren't there yet: fails, unless this run allows it. */
function notYet(message: string): void {
  if (!args['allow-pending']) throw new Error(message);
  pending.push(message);
}

// ---------- Helpers ----------
const BASIS_RANK: Record<string, number> = { reviewed: 4, source: 3, division: 2, 'legacy-placeholder': 1 };
const isBlank = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && !v.length);
/** v69 names a few characters "Doink the Clown (Matt Borne)"; the ring name is the character. */
const plainName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;

/** Adds a ring name, or fills in what an existing one (the same name, however punctuated) lacks. */
function addRingName(p: Person, r: RingName): void {
  const name = plainName(r.name);
  const cur = p.ringNames.find((x) => nameKey(x.name) === nameKey(name));
  if (!cur) {
    p.ringNames.push({ ...r, name });
    return;
  }
  if (r.from && (!cur.from || r.from < cur.from)) cur.from = r.from;
  if (r.to && (!cur.to || r.to > cur.to)) cur.to = r.to;
  if (r.note && !cur.note) cur.note = r.note;
  if (r.sources?.length) cur.sources = [...new Set([...(cur.sources ?? []), ...r.sources])];
}

/** Folds `other` into `target`: names, profile fields, sources and legacy IDs. */
function mergePerson(target: Person, other: Person, gender?: Gender): void {
  addRingName(target, { name: other.name });
  for (const r of other.ringNames) addRingName(target, r);

  const genders = [target, other].filter((p) => p.gender);
  if (gender) (target.gender = gender), (target.genderBasis = 'reviewed');
  else if (genders.length) {
    const best = genders.reduce((a, b) => ((BASIS_RANK[b.genderBasis ?? ''] ?? 0) > (BASIS_RANK[a.genderBasis ?? ''] ?? 0) ? b : a));
    const rival = genders.find((p) => p.gender !== best.gender && (BASIS_RANK[p.genderBasis ?? ''] ?? 0) === (BASIS_RANK[best.genderBasis ?? ''] ?? 0));
    if (rival && !args['allow-pending']) throw new Error(`${target.id} + ${other.id}: genders disagree at the same basis; give the merge a gender`);
    // Before the import's gender pass, keep the target's and let that pass settle it.
    const pick = rival ? (target.gender ? target : other) : best;
    if (rival) pending.push(`${target.id} + ${other.id}: genders disagree (${target.gender}/${other.gender}); kept ${pick.gender}`);
    target.gender = pick.gender;
    target.genderBasis = pick.genderBasis;
  }

  const t = target as unknown as Record<string, unknown>;
  const o = other as unknown as Record<string, unknown>;
  for (const key of ['debut', 'careerEnd', 'displayThrough', 'status', 'titleSummary', 'titleTotal', 'externalTotals', 'affiliation', 'scopes', 'curated', 'hoganProfile', 'partial']) {
    if (isBlank(t[key]) && !isBlank(o[key])) t[key] = o[key];
  }
  const boiler = (s?: string) => !s || /is listed in .+ match records from|is linked to the sourced \d{4}|appears in the \d{4} broadcast archive|Explore available broadcast matches/.test(s);
  if (boiler(target.summary) && !boiler(other.summary)) target.summary = other.summary;
  else if (!target.summary && other.summary) target.summary = other.summary;
  for (const key of ['promotions', 'awards'] as const) {
    const merged = [...new Set([...(target[key] ?? []), ...(other[key] ?? [])])];
    if (merged.length) target[key] = merged;
  }
  for (const key of ['archiveFirst', 'checked', 'spanChecked'] as const) {
    const vals = [target[key], other[key]].filter((v): v is string => !!v);
    if (vals.length) target[key] = key === 'archiveFirst' ? vals.sort()[0] : vals.sort().at(-1);
  }
  const lasts = [target.archiveLast, other.archiveLast].filter((v): v is string => !!v).sort();
  if (lasts.length) target.archiveLast = lasts.at(-1);

  // Roster entries: one per asOf, brands combined; an entry only the other record had keeps the
  // name that roster listed.
  if (other.rosters?.length) {
    target.rosters ??= [];
    for (const r of other.rosters) {
      const cur = target.rosters.find((x) => x.asOf === r.asOf);
      if (cur) cur.brands = [...new Set([...(cur.brands ?? []), ...(r.brands ?? [])])];
      else target.rosters.push({ ...r, name: r.name ?? (other.name !== target.name ? other.name : undefined) });
    }
    target.rosters = target.rosters.map((r) => (r.name ? r : { asOf: r.asOf, brands: r.brands }));
  }

  target.sources = [...new Set([...target.sources, ...other.sources])];
  target.legacyIds = [...new Set([...(target.legacyIds ?? []), ...(other.legacyIds ?? [])])];
  const flags = [target.legacyFlags, other.legacyFlags].filter((f): f is NonNullable<Person['legacyFlags']> => !!f);
  if (flags.length) {
    const yearRoster = flags.map((f) => f.yearRoster).find((v) => v !== undefined && v !== false);
    target.legacyFlags = {
      ...(yearRoster !== undefined ? { yearRoster } : {}),
      ...(flags.every((f) => f.archiveOnly) ? { archiveOnly: true } : {}),
      ...(flags.some((f) => f.archiveProfile) ? { archiveProfile: true } : {}),
      ...(flags.some((f) => f.hadPortrait) ? { hadPortrait: true } : {}),
    };
  }
}

/** old ID -> new ID, for every reference in data/ and the legacy map. */
const replaced = new Map<string, string>();
function replaceId(from: string, to: string): void {
  for (const [k, v] of replaced) if (v === from) replaced.set(k, to);
  replaced.set(from, to);
}

/** A record named in a decision may already have been renamed by a merge. */
const mergedInto = new Map<string, string>();
for (const m of fixes.merges) for (const f of m.from) mergedInto.set(f, m.into);
function resolve(id: string): string {
  let cur = id;
  for (let i = 0; i < 10 && !people.has(cur) && mergedInto.has(cur); i++) cur = mergedInto.get(cur)!;
  return cur;
}

function segmentAt(ref: string) {
  const [showId, key] = ref.split('#');
  const hit = shows.get(showId);
  const seg = hit?.show.segments.find((s) => s.key === key);
  if (!hit || !seg) throw new Error(`no segment ${ref}`);
  return { hit, seg };
}

// ---------- Splits ----------
for (const s of fixes.splits) {
  const fromId = resolve(s.from);
  const from = people.get(fromId);
  let to = people.get(s.to);
  if (!to && !s.create) {
    notYet(`split ${s.from} → ${s.to}: ${s.to} doesn't exist yet`);
    continue;
  }
  if (!to) {
    if (!s.create) throw new Error('unreachable');
    to = {
      id: s.to,
      name: s.create.name,
      ...(s.create.gender ? { gender: s.create.gender, genderBasis: 'reviewed' as const } : {}),
      ringNames: [{ name: s.create.name }],
      ...(s.create.summary ? { summary: s.create.summary } : {}),
      sources: [...s.create.sources],
      legacyIds: [],
    };
    people.set(to.id, to);
    log.push(`created ${to.id}`);
  }
  affected.add(s.to);
  if (from) affected.add(fromId);

  let moved = 0;
  for (const ref of s.segments ?? []) {
    const { hit, seg } = segmentAt(ref);
    const mine = seg.participants.find((p) => p.person === fromId);
    if (!mine) {
      if (!seg.participants.some((p) => p.person === s.to)) throw new Error(`split ${s.from} → ${s.to}: ${ref} has neither`);
      continue;
    }
    mine.person = s.to;
    touchedShows.add(hit.show.id);
    moved++;
  }
  for (const r of s.reigns ?? []) {
    const t = titles.get(r.title);
    const reign = t?.title.reigns.find((x) => x.start === r.start && (x.people.includes(fromId) || x.people.includes(s.to)));
    if (!t || !reign) {
      notYet(`split ${s.from} → ${s.to}: no reign of ${r.title} from ${r.start} held by either`);
      continue;
    }
    if (reign.people.includes(fromId)) {
      reign.people = [...new Set(reign.people.map((p) => (p === fromId ? s.to : p)))];
      if (reign.memberStarts?.[fromId]) {
        reign.memberStarts[s.to] ??= reign.memberStarts[fromId];
        delete reign.memberStarts[fromId];
      }
      touchedTitles.add(t.title.id);
      moved++;
    }
  }
  if (from) {
    const f = from as unknown as Record<string, unknown>;
    const t = to as unknown as Record<string, unknown>;
    // A field moves only while `to` lacks it, so a second run leaves both records alone.
    for (const key of s.moveFields ?? []) {
      if (isBlank(f[key]) || !isBlank(t[key])) continue;
      t[key] = f[key];
      if (key === 'sources') from.sources = [];
      else delete f[key];
    }
    for (const name of s.moveRingNames ?? []) {
      const r = from.ringNames.find((x) => x.name === name);
      if (!r) continue;
      from.ringNames = from.ringNames.filter((x) => x !== r);
      addRingName(to, r);
    }
    for (const name of s.removeRingNames ?? []) from.ringNames = from.ringNames.filter((x) => x.name !== name);
    for (const asOf of s.moveRosters ?? []) {
      const r = from.rosters?.find((x) => x.asOf === asOf);
      if (!r) continue;
      from.rosters = from.rosters!.filter((x) => x !== r);
      if (!from.rosters.length) delete from.rosters;
      to.rosters ??= [];
      if (!to.rosters.some((x) => x.asOf === asOf)) to.rosters.push(r.name && r.name !== to.name ? r : { asOf: r.asOf, brands: r.brands });
    }
  }
  for (const r of s.addRingNames ?? []) addRingName(to, r);
  if (s.v69 && !s.v69.to) {
    // The corrected v69 snapshot gains this person; map that ID like any other v69 ID.
    if (legacy.people[s.to] !== s.to) (legacy.people[s.to] = s.to), (legacyChanged = true);
    if (!to.legacyIds.includes(s.to)) to.legacyIds.push(s.to);
  } else if (s.v69?.to && legacy.people[s.v69.to] !== s.to) {
    throw new Error(`split ${s.from} → ${s.to}: v69 ${s.v69.to} maps to ${legacy.people[s.v69.to]}`);
  }
  if (moved) log.push(`split ${fromId} → ${s.to}: ${moved} records`);
}

// ---------- Merges and renames ----------
for (const m of fixes.merges) {
  const present = m.from.filter((id) => people.has(id) && id !== m.into);
  let target = people.get(m.into);
  if (!target && args['allow-pending']) {
    // Before the import: the target may be a champion the import creates. The importer reads an
    // alias naming it as the record that becomes it, so the merge can wait for the run after.
    if (present.length) notYet(`merge into ${m.into}: ${m.into} doesn't exist yet`);
    continue;
  }
  if (!target) {
    const first = present.shift();
    if (!first) {
      notYet(`merge into ${m.into}: neither it nor ${m.from.join(', ')} exists`);
      continue;
    }
    target = people.get(first)!;
    people.delete(first);
    target.id = m.into;
    people.set(m.into, target);
    replaceId(first, m.into);
    log.push(`renamed ${first} → ${m.into}`);
  }
  for (const id of present) {
    mergePerson(target, people.get(id)!, m.gender);
    people.delete(id);
    replaceId(id, m.into);
    log.push(`merged ${id} → ${m.into}`);
  }
  if (m.name && target.name !== m.name) {
    addRingName(target, { name: target.name });
    // Profile summaries open with the name the record had ("Naraku began wrestling in 2011 …").
    if (target.summary?.startsWith(`${target.name} `)) target.summary = m.name + target.summary.slice(target.name.length);
    target.name = m.name;
  }
  // v69 told characters apart as "Character (Performer)"; the merged record keeps the character.
  const names = target.ringNames;
  target.ringNames = [];
  for (const r of names) addRingName(target, r);
  addRingName(target, { name: target.name });
  for (const r of m.addRingNames ?? []) addRingName(target, r);
  if (m.gender) (target.gender = m.gender), (target.genderBasis = 'reviewed');
  affected.add(m.into);
}

// ---------- Ring names, summaries, segment notes ----------
for (const e of fixes.ringNameEdits) {
  const p = people.get(resolve(e.person));
  if (!p) {
    notYet(`ring-name edit: no person ${e.person}`);
    continue;
  }
  p.ringNames = p.ringNames.filter((x) => !e.remove?.includes(x.name));
  for (const [from, to] of Object.entries(e.rename ?? {})) {
    const r = p.ringNames.find((x) => x.name === from);
    if (!r) continue;
    p.ringNames = p.ringNames.filter((x) => x !== r);
    addRingName(p, { ...r, name: to });
  }
}
for (const u of fixes.updates) {
  const p = people.get(resolve(u.person));
  if (!p) {
    notYet(`update: no person ${u.person}`);
    continue;
  }
  if (u.summary) p.summary = u.summary;
  if (u.sources) p.sources = [...new Set([...u.sources, ...p.sources])];
}
for (const n of fixes.segmentNotes) {
  const { hit, seg } = segmentAt(n.segment);
  if (seg.context !== n.context || n.sources.some((x) => !seg.sources.includes(x))) {
    seg.context = n.context;
    seg.sources = [...new Set([...seg.sources, ...n.sources])];
    touchedShows.add(hit.show.id);
  }
}

// ---------- References ----------
const swap = (id: string) => replaced.get(id) ?? id;
if (replaced.size) {
  for (const { show } of shows.values()) {
    for (const seg of show.segments) {
      if (!seg.participants.some((p) => replaced.has(p.person))) continue;
      const out: typeof seg.participants = [];
      for (const p of seg.participants) {
        const person = swap(p.person);
        const twin = out.find((x) => x.person === person);
        if (!twin) out.push({ ...p, person });
        else {
          // Two records of one person on one card: keep one participant, a competitor if either was.
          log.push(`${show.id}#${seg.key}: ${p.person} and ${twin.person} were both listed`);
          if (p.role === 'competitor' && twin.role !== 'competitor') Object.assign(twin, { ...p, person });
        }
      }
      seg.participants = out;
      touchedShows.add(show.id);
    }
  }
  for (const { title } of titles.values()) {
    for (const r of title.reigns) {
      if (!r.people.some((p) => replaced.has(p)) && !Object.keys(r.memberStarts ?? {}).some((p) => replaced.has(p))) continue;
      r.people = [...new Set(r.people.map(swap))];
      if (r.memberStarts) r.memberStarts = Object.fromEntries(Object.entries(r.memberStarts).map(([k, v]) => [swap(k), v]));
      touchedTitles.add(title.id);
    }
  }
  for (const s of storylines) {
    const st = s.story;
    const before = JSON.stringify(st);
    if (st.cast) st.cast = [...new Set(st.cast.map(swap))];
    if (st.people) st.people = [...new Set(st.people.map(swap))];
    for (const c of st.chapters) if (c.people) c.people = [...new Set(c.people.map(swap))];
    if (JSON.stringify(st) !== before) (s as any).changed = true;
  }
  for (const f of families) {
    for (const m of f.family.members) if (m.person && replaced.has(m.person)) (m.person = swap(m.person)), ((f as any).changed = true);
  }
  for (const [l, id] of Object.entries<string>(legacy.people)) {
    if (replaced.has(id)) (legacy.people[l] = swap(id)), (legacyChanged = true);
  }
}

// ---------- Billing evidence ----------
// When was each affected person billed under each of their names? As in the migration: a billed
// name counts only when exactly one participant on the card goes by it.
const keysOf = (p: Person) => new Set([p.name, ...p.ringNames.map((r) => r.name)].map(nameKey).filter(Boolean));
const keys = new Map([...people].map(([id, p]) => [id, keysOf(p)]));
const ranges = new Map<string, Map<string, { first: string; last: string }>>();
for (const { show } of shows.values()) {
  for (const seg of show.segments) {
    for (const billed of seg.billing ?? []) {
      const k = nameKey(billed);
      const owners = [...new Set(seg.participants.map((p) => p.person))].filter((id) => keys.get(id)?.has(k));
      if (owners.length !== 1 || !affected.has(owners[0])) continue;
      const m = ranges.get(owners[0]) ?? ranges.set(owners[0], new Map()).get(owners[0])!;
      const cur = m.get(k);
      if (!cur) m.set(k, { first: show.date, last: show.date });
      else {
        if (show.date < cur.first) cur.first = show.date;
        if (show.date > cur.last) cur.last = show.date;
      }
    }
  }
}
for (const id of affected) {
  const p = people.get(id);
  if (!p) continue;
  const m = ranges.get(id);
  p.ringNames = p.ringNames.filter((r) => {
    const ev = m?.get(nameKey(r.name));
    if (ev) r.billed = { first: ev.first, last: ev.last };
    else delete r.billed;
    // A name kept only because of billing evidence goes when the evidence does.
    return ev || r.note !== 'Billed under this name in indexed matches.';
  });
}

// ---------- Write ----------
const deleted = [...originalPeople.keys()].filter((id) => !people.has(id));
const changedPeople = [...people.values()].filter((p) => originalPeople.get(p.id) !== JSON.stringify(p));
const changedStories = storylines.filter((s) => (s as any).changed);
const changedFamilies = families.filter((f) => (f as any).changed);
if (!args['dry-run']) {
  for (const id of deleted) {
    const path = join(DATA, 'people', `${id}.json`);
    if (existsSync(path)) rmSync(path);
  }
  for (const p of changedPeople) writeJson(join(DATA, 'people', `${p.id}.json`), p);
  for (const id of touchedShows) writeJson(shows.get(id)!.path, shows.get(id)!.show);
  for (const id of touchedTitles) writeJson(titles.get(id)!.path, titles.get(id)!.title);
  for (const s of changedStories) {
    delete (s as any).changed;
    writeJson(s.path, s.story);
  }
  for (const f of changedFamilies) {
    delete (f as any).changed;
    writeJson(f.path, f.family);
  }
  if (legacyChanged) writeJson(LEGACY, legacy);
}
for (const line of log) console.log(line);
for (const line of pending) console.log(`pending: ${line}`);
console.log(
  `${args['dry-run'] ? 'Would change' : 'Changed'}: ${changedPeople.length} people (${deleted.length} removed), ${touchedShows.size} shows, ${touchedTitles.size} titles, ${changedStories.length} storylines, ${changedFamilies.length} families${legacyChanged ? ', the legacy ID map' : ''}.`,
);
