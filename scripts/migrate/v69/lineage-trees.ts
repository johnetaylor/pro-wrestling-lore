// The title-history trees from the v69 explorer, as data. v69 drew them from hand-written code
// (lineage-ui.js) that the reference snapshot doesn't hold, so they are carried here and written
// into data/title-lineages.json with the rest of the lineage data.
//
// A tree reads from the championship it ends in up through every title that fed it. Each node
// is one championship record at one point: `track` is its lineage title, `event` (or `events`)
// the lineage event that dates it, and `edge` the label on the line to the node below. Belt
// pictures are left out: v69's were WWE-sourced images, which this site doesn't publish.

export interface TreeNode {
  id: string;
  track: string;
  name: string;
  /** 'origin', or the kind of the node's event: merge, shared, retire, revive, split. */
  type?: string;
  event?: string;
  events?: string[];
  /** Overrides the date shown under the name. */
  caption?: string;
  note?: string;
  edge?: string;
  parents?: TreeNode[];
}

export interface LineageTree {
  intro: string;
  notes: string[];
  background: string[];
  root: TreeNode;
  /** Records that came out of the root afterward (a revival, a split). */
  outputs?: TreeNode[];
}

const origin = (track: string, name?: string): TreeNode => ({ id: track, track, name: name ?? '', type: 'origin' });
const joined = (id: string, track: string, name: string, event: string, parents: TreeNode[], note?: string): TreeNode => ({
  id,
  track,
  name,
  event,
  ...(parents.length ? { parents } : {}),
  ...(note ? { note } : {}),
});

function usTree(): TreeNode {
  const national = joined('national81', 'national', 'NWA National Heavyweight Championship', 'georgia-national', [origin('national'), origin('georgia')], 'The Georgia unification is certain; its exact 1981 date is disputed.');
  return joined('us86', 'us', 'United States Championship', 'national-us', [origin('us', 'NWA United States Championship'), national]);
}

function icTree(): TreeNode {
  const us = { ...usTree(), edge: 'Unified, Nov 18, 2001' };
  return {
    id: 'ic-combined',
    track: 'ic',
    name: 'Intercontinental Championship',
    type: 'merge',
    events: ['us-ic', 'euro-ic', 'hard-ic'],
    caption: 'Three unifications, 2001 to 2002',
    note: 'The U.S., European and Hardcore championships were unified into the Intercontinental title in three separate matches. The U.S. title returned in 2003.',
    parents: [origin('ic', 'Intercontinental Championship'), us, { ...origin('european', 'European Championship'), edge: 'Unified, Jul 22, 2002' }, { ...origin('hardcore', 'Hardcore Championship'), edge: 'Unified, Aug 26, 2002' }],
  };
}

function worldTree(): TreeNode {
  const wcw = joined('wcw94', 'wcw', 'WCW World Championship', 'intl-wcw', [origin('wcw', 'WCW World Championship'), origin('intl', 'WCW International Championship')]);
  const undisputed = joined('wwe01', 'wwe', 'Undisputed WWF Championship', 'wcw-wwe', [origin('wwe', 'WWWF / WWF Championship'), wcw], 'Chris Jericho unified the WWF and WCW world titles.');
  const oldworld = joined('world02', 'oldworld', 'World Heavyweight Championship', 'ic-world', [origin('oldworld', 'World Heavyweight Championship'), icTree()], 'The Intercontinental title became inactive after this match; its original championship record resumed in May 2003.');
  const wwe13 = joined('wwe13', 'wwe', 'WWE World Heavyweight Championship', 'oldworld-wwe', [undisputed, oldworld]);
  const paired = joined('wwe22', 'wwe', 'Undisputed WWE Universal Championship', 'universal-pair', [wwe13, origin('universal', 'Universal Championship')], 'Roman Reigns held both titles. Their official records remained separate.');
  return {
    ...joined('wwe-now', 'wwe', 'Undisputed WWE Championship', 'universal-end', [paired], 'WWE’s championship record continues from 1963. WWE’s published Universal history ends on April 7, 2024.'),
    caption: 'Universal ends, Apr 7, 2024',
  };
}

function tagTree(): TreeNode {
  const original = joined('tag01', 'tag71', 'World Tag Team Championship', 'wcwtag-merge', [origin('tag71', 'WWF Tag Team Championship'), origin('wcwtag', 'WCW Tag Team Championship')]);
  const together = joined('tag09', 'tag02', 'Unified WWE Tag Team Championships', 'tags09', [original, origin('tag02', 'WWE Tag Team Championship')], 'The Colóns held both sets of titles. Both records continued until the 1971 title was retired in 2010.');
  const survivor = {
    ...joined('tag10', 'tag02', 'WWE / Raw Tag Team Championship', 'tags10', [together], 'The title established in 2002 continued; it became the Raw Tag Team Championship in 2016.'),
    caption: '1971 title ends, Aug 16, 2010',
  };
  return joined('tag22', 'tag02', 'Undisputed WWE Tag Team Champions', 'tags22', [survivor, origin('tag16', 'SmackDown Tag Team Championship')], 'The Usos held both championships. Neither record was retired. The titles separated again at WrestleMania XL.');
}

const BACKGROUND = 'Connections show championship records, not every belt redesign. A promotion acquisition, a renamed title or a similar-looking belt does not by itself create a unification.';

const tagOutputs = (): TreeNode[] => [
  { id: 'tag-raw-now', track: 'tag02', name: 'World Tag Team Championship', type: 'split', events: ['tags-split', 'tag-world-name'], caption: 'Separated Apr 6, renamed Apr 15, 2024', note: 'The Raw title continues the record established in 2002.', edge: 'Separate champions' },
  { id: 'tag-sd-now', track: 'tag16', name: 'WWE Tag Team Championship', type: 'split', events: ['tags-split', 'tag-wwe-name'], caption: 'Separated Apr 6, renamed Apr 19, 2024', note: 'The SmackDown title continues the record established in 2016.', edge: 'Separate champions' },
];
const tagNotes = ['The 2009 and 2022 pairings had unified holders, but initially kept two championship records. Both of today’s tag championships continued after the April 2024 separation.'];

/** Keyed like the lineage views. */
export const LINEAGE_TREES: Record<string, LineageTree> = {
  'undisputed-wwe': {
    root: worldTree(),
    intro: 'Follow the belts down through each unification to today’s WWE Championship.',
    notes: [
      'The Intercontinental and United States titles returned in 2003. Their temporary unifications are shown here, but both remain independent championships today.',
      'The 2002 World Heavyweight title was a new championship that reused the Big Gold design. It did not continue WCW’s record.',
    ],
    background: [BACKGROUND, 'The NWA World Championship is historical background to WWE and WCW but was not absorbed into WWE. The ECW Championship was retired separately, not unified into the WWE title.'],
  },
  'world-heavyweight': {
    root: {
      id: 'world23',
      track: 'world23',
      name: 'World Heavyweight Championship',
      type: 'origin',
      events: ['new-world'],
      caption: 'First awarded May 27, 2023',
      note: 'Seth Rollins became the first champion. This is a new championship record, distinct from the World Heavyweight title that existed from 2002 to 2013.',
    },
    intro: 'A new championship, with its own record.',
    notes: ['Similar names and belt designs do not make this a continuation of the 2002 to 2013 World Heavyweight Championship. No older championship was unified into it.'],
    background: [BACKGROUND],
  },
  intercontinental: {
    root: icTree(),
    outputs: [
      { ...joined('ic-away', 'oldworld', 'Unified into World Heavyweight', 'ic-world', [], 'Triple H defeated Kane. The Intercontinental title became inactive. The World Heavyweight Championship already existed.'), edge: 'Unified, Oct 20, 2002' },
      { ...joined('ic-now', 'ic', 'Intercontinental Championship', 'ic-return', [], 'Christian won the revived title. The original 1979 record resumed.'), edge: 'Original record resumes' },
    ],
    intro: 'Three championships joined the Intercontinental title before its brief retirement and return.',
    notes: ['The United States Championship also returned in July 2003. The European and Hardcore titles did not return.'],
    background: [BACKGROUND, 'The 1979 Intercontinental origin story referenced North and South American titles. That presentation is not drawn as a permanent merger: the North American title continued separately in Japan.'],
  },
  'united-states': {
    root: joined('us-away', 'ic', 'Intercontinental Championship', 'us-ic', [origin('ic', 'Intercontinental Championship'), usTree()], 'Edge defeated Test. The U.S. championship became inactive; the Intercontinental title continued.'),
    outputs: [
      {
        ...joined('us-now', 'us', 'United States Championship', 'us-return', [], 'Eddie Guerrero won the revived U.S. title. Its original 1975 record resumed; this was not a new title created from the Intercontinental Championship.'),
        edge: 'Original record resumes',
      },
    ],
    intro: 'The U.S. title was unified in 2001, then its own record resumed in 2003.',
    notes: ['The U.S. title originated in Mid-Atlantic Wrestling, continued through WCW, and came to WWE in 2001. Changes of promotion are not additional title unifications.'],
    background: [BACKGROUND],
  },
  'world-tag-team': {
    root: tagTree(),
    outputs: tagOutputs(),
    intro: 'Two old tag titles joined the history; two current championships still survive.',
    notes: tagNotes,
    background: [BACKGROUND],
  },
  'wwe-tag-team': {
    root: tagTree(),
    outputs: tagOutputs(),
    intro: 'Two old tag titles joined the history; two current championships still survive.',
    notes: tagNotes,
    background: [BACKGROUND],
  },
};

/** Who created each lineage title, and how it moved between promotions (from v69). */
export const LINEAGE_PROMOTIONS: Record<string, { label: string; tone: string; text: string }> = {
  wwe: { label: 'WWWF / WWF / WWE', tone: 'wwe', text: 'Established by the World Wide Wrestling Federation (WWWF) in 1963. The promotion became WWF, then WWE; those name changes did not create new championships.' },
  wcw: { label: 'WCW', tone: 'wcw', text: 'World Championship Wrestling. Its world title entered the WWF through the 2001 WCW asset acquisition and the December 2001 unification.' },
  intl: { label: 'WCW', tone: 'wcw', text: 'WCW’s International title, recognized after its 1993 departure from the NWA. The NWA World title remained separate.' },
  oldworld: { label: 'WWE', tone: 'wwe', text: 'Created by WWE in 2002. The Big Gold design echoed WCW, but this was a new WWE championship record.' },
  world23: { label: 'WWE', tone: 'wwe', text: 'Created by WWE in 2023 as an independent championship.' },
  universal: { label: 'WWE', tone: 'wwe', text: 'Created by WWE in 2016.' },
  ic: { label: 'WWF to WWE', tone: 'wwe', text: 'Created by WWF in 1979. It continued under the WWE company name from 2002.' },
  european: { label: 'WWF to WWE', tone: 'wwe', text: 'Created by WWF in 1997 during its European tour. There was no separate European promotion supplying this championship.' },
  hardcore: { label: 'WWF to WWE', tone: 'wwe', text: 'Created by WWF in 1998 and first awarded to Mankind. This was not an ECW championship.' },
  us: { label: 'JCP / NWA to WCW to WWE', tone: 'jcp', text: 'Created in Jim Crockett Promotions’ Mid-Atlantic territory under NWA sanction. It continued through WCW and then WWF/WWE. NWA is an alliance and sanctioning body, not a synonym for a promotion owned by WWE.' },
  national: { label: 'Georgia / NWA to JCP', tone: 'georgia', text: 'Created in Georgia Championship Wrestling, an NWA territory. It moved into Jim Crockett Promotions and was unified with the U.S. title in 1986.' },
  georgia: { label: 'Georgia Championship Wrestling', tone: 'georgia', text: 'An NWA-sanctioned Georgia territorial championship. It joined the National title in 1981, before the National title joined the U.S. title.' },
  tag71: { label: 'WWWF to WWF to WWE', tone: 'wwe', text: 'Created by WWWF in 1971; continued under WWF and WWE until retirement in 2010.' },
  wcwtag: { label: 'JCP / NWA to WCW', tone: 'wcw', text: 'The Mid-Atlantic/Jim Crockett Promotions version of the NWA World Tag Team title became WCW’s tag title, then was unified with WWF’s in 2001.' },
  tag02: { label: 'WWE', tone: 'wwe', text: 'Created by WWE in 2002. Later called Raw Tag Team and, since 2024, World Tag Team.' },
  tag16: { label: 'WWE', tone: 'wwe', text: 'Created by WWE for SmackDown in 2016. Renamed WWE Tag Team in 2024.' },
};
