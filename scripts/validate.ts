// Integrity checks over data/. Exit code 1 when any check fails.
// Usage: node scripts/validate.ts [data-dir]
import { join } from 'node:path';
import type { Family, Person, Promotion, Series, Show, Storyline, Title } from './lib/types.ts';
import { ISO_DATE, listFiles, readJson } from './lib/util.ts';

const dir = process.argv[2] ?? 'data';
const errors: string[] = [];
const warnings: string[] = [];
const fail = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);
const isDate = (v: unknown) => typeof v === 'string' && ISO_DATE.test(v);

// Registries.
const promotions = readJson<Promotion[]>(join(dir, 'promotions.json'));
const promotionIds = new Set(promotions.map((p) => p.id));
if (promotionIds.size !== promotions.length) fail('promotions.json: duplicate ids');
const series = readJson<Series[]>(join(dir, 'series.json'));
const seriesById = new Map(series.map((s) => [s.id, s]));
if (seriesById.size !== series.length) fail('series.json: duplicate ids');
for (const s of series) {
  if (!promotionIds.has(s.promotion)) fail(`series ${s.id}: unknown promotion ${s.promotion}`);
  if (s.id.split('/')[0] !== s.promotion) fail(`series ${s.id}: id does not start with its promotion`);
}

// People.
const people = new Map<string, Person>();
const legacyOwner = new Map<string, string>();
for (const file of listFiles(join(dir, 'people'))) {
  const p = readJson<Person>(join(dir, 'people', file));
  if (`${p.id}.json` !== file) fail(`people/${file}: id "${p.id}" does not match the file name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) fail(`people/${file}: id is not a clean slug`);
  if (!p.name) fail(`people/${file}: no name`);
  if (!Array.isArray(p.ringNames)) fail(`people/${file}: ringNames missing`);
  if (!Array.isArray(p.sources)) fail(`people/${file}: sources missing`);
  else if (!p.sources.length) warn(`people/${file}: no sources`);
  for (const l of p.legacyIds ?? []) {
    if (legacyOwner.has(l)) fail(`legacy id ${l} claimed by ${legacyOwner.get(l)} and ${p.id}`);
    legacyOwner.set(l, p.id);
  }
  for (const r of p.ringNames ?? []) {
    if (r.from && !isDate(r.from)) fail(`people/${file}: ring name ${r.name} has a bad start date`);
    if (r.to && !isDate(r.to)) fail(`people/${file}: ring name ${r.name} has a bad end date`);
  }
  people.set(p.id, p);
}

// Shows.
const shows = new Map<string, Show>();
const segmentRefs = new Set<string>();
let segments = 0;
for (const file of listFiles(join(dir, 'shows'))) {
  const s = readJson<Show>(join(dir, 'shows', file));
  const [promotion, slug, year, name] = file.split('/');
  const expected = `${promotion}/${slug}/${name.replace(/\.json$/, '')}`;
  if (s.id !== expected) fail(`shows/${file}: id "${s.id}" does not match its path`);
  if (year !== s.date.slice(0, 4)) fail(`shows/${file}: filed under ${year} but dated ${s.date}`);
  if (!promotionIds.has(s.promotion)) fail(`${s.id}: unknown promotion`);
  const ser = seriesById.get(s.series);
  if (!ser) fail(`${s.id}: unknown series ${s.series}`);
  else if (ser.promotion !== s.promotion) fail(`${s.id}: series belongs to ${ser.promotion}`);
  if (!isDate(s.date)) fail(`${s.id}: bad date`);
  if (s.recordedDate && !isDate(s.recordedDate)) fail(`${s.id}: bad recorded date`);
  if (!s.sources?.length) fail(`${s.id}: no sources`);
  const keys = new Set<string>();
  for (const seg of s.segments) {
    segments++;
    if (!/^[ms]\d+$/.test(seg.key)) fail(`${s.id}: bad segment key ${seg.key}`);
    if (keys.has(seg.key)) fail(`${s.id}: duplicate segment key ${seg.key}`);
    keys.add(seg.key);
    if (seg.key.startsWith('m') !== (seg.type === 'match')) fail(`${s.id}#${seg.key}: key prefix does not match type ${seg.type}`);
    if (!seg.sources?.length) fail(`${s.id}#${seg.key}: no sources`);
    if (!seg.title) fail(`${s.id}#${seg.key}: no title`);
    for (const p of seg.participants) if (!people.has(p.person)) fail(`${s.id}#${seg.key}: unknown person ${p.person}`);
    segmentRefs.add(`${s.id}#${seg.key}`);
  }
  shows.set(s.id, s);
}

// Titles.
const titles = new Map<string, Title>();
let reigns = 0;
for (const file of listFiles(join(dir, 'titles'))) {
  const t = readJson<Title>(join(dir, 'titles', file));
  if (`${t.id}.json` !== file) fail(`titles/${file}: id mismatch`);
  const ids = new Set<string>();
  for (const r of t.reigns) {
    reigns++;
    if (ids.has(r.id)) fail(`${t.id}: duplicate reign id ${r.id}`);
    ids.add(r.id);
    if (!isDate(r.start)) fail(`${t.id}#${r.id}: bad start`);
    if (r.end && (!isDate(r.end) || r.end < r.start)) fail(`${t.id}#${r.id}: bad or reversed end`);
    for (const p of r.people) if (!people.has(p)) fail(`${t.id}#${r.id}: unknown person ${p}`);
    if (!r.sources.length) warn(`${t.id}#${r.id}: no sources`);
  }
  titles.set(t.id, t);
}
const lineages = readJson<any>(join(dir, 'title-lineages.json'));
for (const [lid, lt] of Object.entries<any>(lineages.titles ?? {})) if (!titles.has(lt.title)) warn(`lineage ${lid}: no title record ${lt.title}`);

// Storylines.
let chapters = 0;
for (const file of listFiles(join(dir, 'storylines'))) {
  const s = readJson<Storyline>(join(dir, 'storylines', file));
  if (`${s.promotion}/${s.id}.json` !== file) fail(`storylines/${file}: path mismatch`);
  for (const p of s.people ?? []) if (!people.has(p)) fail(`${s.id}: unknown person ${p}`);
  for (const c of s.chapters) {
    chapters++;
    if (!isDate(c.date)) fail(`${s.id}#${c.id}: bad date`);
    if (c.segment && !segmentRefs.has(c.segment)) fail(`${s.id}#${c.id}: missing segment ${c.segment}`);
    if (c.showId && !shows.has(c.showId)) fail(`${s.id}#${c.id}: missing show ${c.showId}`);
    for (const p of c.people ?? []) if (!people.has(p)) fail(`${s.id}#${c.id}: unknown person ${p}`);
    if (!c.sources.length) warn(`${s.id}#${c.id}: no sources`);
  }
}

// Families.
let members = 0;
for (const file of listFiles(join(dir, 'families'))) {
  const f = readJson<Family>(join(dir, 'families', file));
  const ids = new Set(f.members.map((m) => m.id));
  members += f.members.length;
  for (const m of f.members) if (m.person && !people.has(m.person)) fail(`${f.id}: member ${m.id} links to unknown person ${m.person}`);
  for (const l of f.links) if (!ids.has(l.a) || !ids.has(l.b)) fail(`${f.id}: link ${l.a} → ${l.b} has a missing member`);
}

// Calendar.
for (const file of listFiles(join(dir, 'calendar'))) {
  const c = readJson<any>(join(dir, 'calendar', file));
  for (const e of [...(c.events ?? []), ...(c.weeklyEvents ?? [])]) if (e.show && !shows.has(e.show)) fail(`calendar ${e.id}: missing show ${e.show}`);
}

const summary = { people: people.size, shows: shows.size, segments, titles: titles.size, reigns, chapters, familyMembers: members, errors: errors.length, warnings: warnings.length };
console.log(JSON.stringify(summary, null, 2));
for (const e of errors.slice(0, 40)) console.log('ERROR', e);
if (errors.length > 40) console.log(`… ${errors.length - 40} more errors`);
const warnKinds = new Map<string, number>();
for (const w of warnings) {
  const k = w.replace(/^[^:]+: /, '');
  warnKinds.set(k, (warnKinds.get(k) ?? 0) + 1);
}
for (const [k, n] of warnKinds) console.log(`WARN ${n} × ${k}`);
process.exit(errors.length ? 1 : 0);
