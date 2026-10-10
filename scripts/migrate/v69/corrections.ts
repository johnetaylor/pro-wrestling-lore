// Corrections to errors inherited from v69, applied to the snapshot in memory before migrating.
// Parity applies the same corrections, so it compares data/ with v69 as corrected. Each entry
// says what was wrong, what changed and where the right answer comes from.
import { readFileSync } from 'node:fs';

export interface Correction {
  kind: 'show-date' | 'identity-split' | 'profile-field' | 'rating';
  target: string;
  change: string;
  reason: string;
  sources: string[];
}

const SHOW_DATES: { event: string; from: string; to: string; reason: string; sources: string[] }[] = [
  {
    event: 'bulk-event-10222',
    from: '2004-03-14',
    to: '2014-03-14',
    reason: 'The source dataset typed 2004 for the March 14, 2014 SmackDown; its own taping date is March 11, 2014 and every match cites the 2014 results page.',
    sources: ['https://kbwrestlingreviews.com/2014/03/14/smackdown-march-14-2014-when-being-big-isnt-enough/'],
  },
  {
    event: 'bulk-event-7762',
    from: '1998-09-27',
    to: '2006-11-27',
    reason: 'The source dataset dated the live November 27, 2006 Raw to 1998; its own recorded date is November 27, 2006 and every match cites the 2006 results page.',
    sources: ['https://www.wrestlinginc.com/news/2006/11/wwe-raw-results-494452/'],
  },
];

/** People v69 folded into someone else. Records dated before `before` (and from `after` on), or
 * the records listed in `records`, move to the other ID. */
interface Split {
  from: string;
  to: string;
  name: string;
  before?: string;
  after?: string;
  records?: string[];
  aliases: string[];
  reason: string;
  sources: string[];
}

const SPLITS: Split[] = [
  {
    from: 'jacob-fatu',
    to: 'rikishi',
    name: 'Rikishi',
    before: '2010-01-01',
    aliases: ['Rikishi', 'The Sultan', 'Fatu'],
    reason:
      'v69 credited Rikishi (Solofa Fatu Jr.) as Fatu, The Sultan and Rikishi from 1994 to 2004 to Jacob Fatu, who debuted in 2012. Every Jacob Fatu record before 2010 belongs to Rikishi.',
    sources: ['https://en.wikipedia.org/wiki/Rikishi_(wrestler)', 'https://www.cagematch.net/?id=2&nr=14128&page=22'],
  },
];

/** The identity review's splits that move v69's own records (migration/identity-fixes.json). */
function reviewedSplits(): Split[] {
  const fixes = JSON.parse(readFileSync(new URL('../../../migration/identity-fixes.json', import.meta.url), 'utf8'));
  return fixes.splits
    .filter((s: any) => s.v69)
    .map((s: any) => ({
      from: s.v69.from,
      to: s.v69.to ?? s.to,
      name: s.v69.name ?? s.create?.name,
      before: s.v69.before,
      after: s.v69.after,
      records: s.v69.records,
      aliases: s.removeRingNames ?? [],
      reason: s.reason,
      sources: s.sources ?? [],
    }));
}

const PROFILE_FIELDS: { person: string; fields: Record<string, unknown>; change: string; reason: string; sources: string[] }[] = [
  {
    person: 'logan-paul',
    fields: { debut: '2022-04-02', debutPrecision: 'day', debutSource: 'https://www.sescoops.com/?p=249166' },
    change: 'debut 2026-01-08 → 2022-04-02',
    reason: 'v69 listed a 2026 debut, but the archive itself has his matches from 2023; his in-ring debut was the WrestleMania 38 tag match on April 2, 2022.',
    sources: ['https://www.sescoops.com/?p=249166'],
  },
];

/** Ratings v69 attached to the wrong match. The rating is removed from that match only. */
const MISPLACED_RATINGS: { match: string; reason: string; sources: string[] }[] = [
  {
    match: '2026-06-19-smackdown-match-2',
    reason:
      "v69 gave the 70-second Gunther vs. Cody Rhodes DQ the ratings of the 11-minute Cody Rhodes vs. Gunther title match earlier that night: the same CAGEMATCH score and vote count (6.19 from 124 votes) and the same Observer stars. They belong to the title match, which keeps them.",
    sources: ['https://www.cagematch.net/?id=1&nr=448747'],
  },
];

/** Calls fn on every object in the tree. */
function visit(node: unknown, fn: (o: Record<string, any>) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const v of node) visit(v, fn);
    return;
  }
  fn(node as Record<string, any>);
  for (const v of Object.values(node)) visit(v, fn);
}

export function applyCorrections(d: any): Correction[] {
  const applied: Correction[] = [];

  for (const fix of SHOW_DATES) {
    let n = 0;
    visit(d, (o) => {
      if ((o.id === fix.event || o.broadcastId === fix.event) && o.date === fix.from) {
        o.date = fix.to;
        n++;
      }
    });
    // Matches listed inside a broadcast record carry the broadcast's date too.
    visit(d, (o) => {
      if (o.id === fix.event && Array.isArray(o.matches)) for (const m of o.matches) if (m.date === fix.from) (m.date = fix.to), n++;
    });
    if (n) applied.push({ kind: 'show-date', target: fix.event, change: `${fix.from} → ${fix.to} (${n} records)`, reason: fix.reason, sources: fix.sources });
  }

  for (const split of [...SPLITS, ...reviewedSplits()]) {
    let n = 0;
    visit(d, (o) => {
      if (split.records) {
        if (!split.records.includes(o.id)) return;
      } else {
        const date = o.date ?? o.start;
        if (typeof date !== 'string' || (split.before && date >= split.before) || (split.after && date < split.after)) return;
      }
      for (const key of ['people', 'personIds', 'competitorIds']) {
        if (Array.isArray(o[key]) && o[key].includes(split.from)) {
          o[key] = o[key].map((p: string) => (p === split.from ? split.to : p));
          n++;
        }
      }
      if (o.person === split.from) (o.person = split.to), n++;
    });
    if (!d.roster.some((p: any) => p.id === split.to)) {
      if (!split.name) throw new Error(`split ${split.from} → ${split.to}: a person new to v69 needs a name`);
      d.roster.push({ id: split.to, name: split.name, aliases: split.aliases });
      d.profiles[split.to] ??= { name: split.name, aliases: split.aliases, source: split.sources[0] };
    }
    const profile = d.profiles?.[split.from];
    if (profile?.aliases) profile.aliases = profile.aliases.filter((a: string) => !split.aliases.includes(a) || a === profile.name);
    for (const fam of d.dynasties ?? []) for (const node of fam.nodes ?? []) if (node.id === split.to && !node.careerId) node.careerId = split.to;
    const which = split.records
      ? `${n} records`
      : `${n} records ${[split.after && `from ${split.after}`, split.before && `before ${split.before}`].filter(Boolean).join(' and ')}`;
    const toName = split.name ?? d.roster.find((p: any) => p.id === split.to)?.name ?? split.to;
    applied.push({ kind: 'identity-split', target: `${split.from} → ${split.to}`, change: `${which} moved to ${toName}`, reason: split.reason, sources: split.sources });
  }

  for (const fix of MISPLACED_RATINGS) {
    const ratings = d.matchRatings?.matches;
    if (!ratings?.[fix.match]) continue;
    delete ratings[fix.match];
    applied.push({ kind: 'rating', target: fix.match, change: 'rating removed', reason: fix.reason, sources: fix.sources });
  }

  for (const fix of PROFILE_FIELDS) {
    const profile = d.profiles?.[fix.person];
    if (!profile) continue;
    Object.assign(profile, fix.fields);
    applied.push({ kind: 'profile-field', target: fix.person, change: fix.change, reason: fix.reason, sources: fix.sources });
  }
  return applied;
}
