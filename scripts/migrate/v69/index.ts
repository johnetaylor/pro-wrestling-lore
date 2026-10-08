// Migrates the v69 reference snapshot into canonical data files.
// Usage: node scripts/migrate/v69/index.ts [--out data] [--reference reference/v69]
//
// Writes data/ (one file per record) and migration/v69/ (legacy ID map, review queue, log).
// Re-running replaces both folders completely; nothing in them is edited by hand until
// Phase 1 closes, after which data/ becomes the source of truth and this script retires.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { emptyDir, readGzipJson, readJson, writeJson, writeText } from '../../lib/util.ts';
import { emptyMaps, MigrationLog } from './context.ts';
import { buildIdentity } from './identity.ts';
import { buildCalendar, buildFamilies, buildRatingsMethod, buildStorylines, legacyReports, legacySourceLedger } from './other.ts';
import { buildPeople } from './people.ts';
import { buildRegistry } from './series.ts';
import { buildShows } from './shows.ts';
import { buildTitles } from './titles.ts';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'data' },
    reference: { type: 'string', default: 'reference/v69' },
    migration: { type: 'string', default: 'migration/v69' },
  },
});
const outDir = args.out!;
const migrationDir = args.migration!;

const snapshot = readGzipJson<any>(join(args.reference!, 'snapshot.json.gz'));
const d = snapshot.data;
const rendered = snapshot.rendered;
const log = new MigrationLog();
const maps = emptyMaps();

const identity = buildIdentity(d.roster, log);
const registry = buildRegistry(d);
const { shows, appearances } = buildShows(d, identity, registry, maps, log);
const people = buildPeople(d, rendered, identity, shows, appearances, maps, log);
const { titles, lineages } = buildTitles(d, identity, maps, log);
const storylines = buildStorylines(d, identity, shows, maps, log);
const families = buildFamilies(d, identity, maps);
const calendar = buildCalendar(d, shows, maps);

// ---------- Write ----------
emptyDir(outDir);
emptyDir(migrationDir);
writeJson(join(outDir, 'promotions.json'), [...registry.promotions.values()].sort((a, b) => a.id.localeCompare(b.id)));
writeJson(join(outDir, 'series.json'), [...registry.series.values()].sort((a, b) => a.id.localeCompare(b.id)));
for (const p of people.values()) writeJson(join(outDir, 'people', `${p.id}.json`), p);
for (const s of shows.values()) {
  const [promotion, series, date] = s.id.split('/');
  writeJson(join(outDir, 'shows', promotion, series, date.slice(0, 4), `${date}.json`), s);
}
for (const t of titles.values()) writeJson(join(outDir, 'titles', `${t.id}.json`), t);
writeJson(join(outDir, 'title-lineages.json'), lineages);
for (const s of storylines.values()) writeJson(join(outDir, 'storylines', s.promotion, `${s.id}.json`), s);
for (const f of families.values()) writeJson(join(outDir, 'families', `${f.id}.json`), f);
writeJson(join(outDir, 'calendar', `${calendar.year}.json`), calendar);
writeJson(join(outDir, 'ratings.json'), buildRatingsMethod(d));
for (const [name, report] of Object.entries(legacyReports(d))) writeJson(join(outDir, 'reports', 'v69', `${name}.json`), report);
writeJson(join(outDir, 'sources', 'v69-ledger.json'), legacySourceLedger(d));

writeJson(join(migrationDir, 'legacy-ids.json'), maps);
writeJson(join(migrationDir, 'review-queue.json'), log.review);

const segmentCount = [...shows.values()].reduce((n, s) => n + s.segments.length, 0);
const counts = {
  people: people.size,
  shows: shows.size,
  segments: segmentCount,
  series: registry.series.size,
  promotions: registry.promotions.size,
  titles: titles.size,
  reigns: [...titles.values()].reduce((n, t) => n + t.reigns.length, 0),
  storylines: storylines.size,
  chapters: [...storylines.values()].reduce((n, s) => n + s.chapters.length, 0),
  families: families.size,
  ...log.counts,
};
const lines = [
  '# v69 migration log',
  '',
  `Source: reference snapshot of v69 (export commit ${String(snapshot.meta?.exportCommit ?? '').slice(0, 7)}), snapshot SHA-256 ${readJson<any>(join(args.reference!, 'snapshot-meta.json')).sha256OfJson.slice(0, 12)}…`,
  '',
  '## Output',
  '',
  '| Item | Count |',
  '| --- | ---: |',
  ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v.toLocaleString('en-US')} |`),
  '',
  '## Review queue',
  '',
  ...log.review.map((r) => `- **${r.kind}:** ${r.title}${r.records ? ` (${r.records.length})` : ''}${r.decision ? ` — ${r.decision}` : ''}`),
  '',
  ...log.notes.map((n) => `- ${n}`),
];
writeText(join(migrationDir, 'MIGRATION.md'), lines.join('\n'));
console.log(JSON.stringify(counts, null, 2));
