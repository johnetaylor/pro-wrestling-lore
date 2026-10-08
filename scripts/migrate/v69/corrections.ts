// Corrections to errors inherited from v69, applied to the snapshot in memory before migrating.
// Parity applies the same corrections, so it compares data/ with v69 as corrected. Each entry
// says what was wrong, what changed and where the right answer comes from.

export interface Correction {
  kind: 'show-date' | 'identity-split' | 'profile-field';
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

/** People v69 folded into someone else. Everything dated before `before` moves to the new ID. */
const SPLITS: { from: string; to: string; name: string; before: string; aliases: string[]; reason: string; sources: string[] }[] = [
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

const PROFILE_FIELDS: { person: string; fields: Record<string, unknown>; change: string; reason: string; sources: string[] }[] = [
  {
    person: 'logan-paul',
    fields: { debut: '2022-04-02', debutPrecision: 'day', debutSource: 'https://www.sescoops.com/?p=249166' },
    change: 'debut 2026-01-08 → 2022-04-02',
    reason: 'v69 listed a 2026 debut, but the archive itself has his matches from 2023; his in-ring debut was the WrestleMania 38 tag match on April 2, 2022.',
    sources: ['https://www.sescoops.com/?p=249166'],
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

  for (const split of SPLITS) {
    let n = 0;
    visit(d, (o) => {
      const date = o.date ?? o.start;
      if (typeof date !== 'string' || date >= split.before) return;
      for (const key of ['people', 'personIds', 'competitorIds']) {
        if (Array.isArray(o[key]) && o[key].includes(split.from)) {
          o[key] = o[key].map((p: string) => (p === split.from ? split.to : p));
          n++;
        }
      }
      if (o.person === split.from) (o.person = split.to), n++;
    });
    if (!d.roster.some((p: any) => p.id === split.to)) d.roster.push({ id: split.to, name: split.name, aliases: split.aliases });
    d.profiles[split.to] ??= { name: split.name, aliases: split.aliases, source: split.sources[0] };
    const profile = d.profiles?.[split.from];
    if (profile?.aliases) profile.aliases = profile.aliases.filter((a: string) => !split.aliases.includes(a) || a === profile.name);
    for (const fam of d.dynasties ?? []) for (const node of fam.nodes ?? []) if (node.id === split.to && !node.careerId) node.careerId = split.to;
    applied.push({ kind: 'identity-split', target: `${split.from} → ${split.to}`, change: `${n} records before ${split.before} moved to ${split.name}`, reason: split.reason, sources: split.sources });
  }

  for (const fix of PROFILE_FIELDS) {
    const profile = d.profiles?.[fix.person];
    if (!profile) continue;
    Object.assign(profile, fix.fields);
    applied.push({ kind: 'profile-field', target: fix.person, change: fix.change, reason: fix.reason, sources: fix.sources });
  }
  return applied;
}
