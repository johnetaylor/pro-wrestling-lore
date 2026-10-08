// Canonical data model for Pro Wrestling Lore.
// One file per record under data/, written as JSON. See docs/data-model.md.

/** ISO date: YYYY, YYYY-MM or YYYY-MM-DD. */
export type IsoDate = string;
export type Url = string;

// ---------- Registries ----------

export interface Promotion {
  id: string; // 'wwe', 'wcw', 'aew' ...
  name: string; // display abbreviation, e.g. 'WWE'
  fullName?: string;
  aliases?: string[]; // other names the promotion has used, e.g. 'WWF', 'WWWF'
  color?: string;
  historical?: boolean;
  storylineNote?: string;
  storylineColor?: string;
  schedule?: Url;
  watch?: Url;
}

export type SeriesKind = 'weekly' | 'ple' | 'special' | 'arena' | 'event';

export interface Series {
  id: string; // '<promotion>/<slug>', e.g. 'wwe/raw'
  promotion: string;
  name: string;
  kind: SeriesKind;
  start?: number; // first year
  color?: string;
  note?: string;
  sources?: Url[];
  legacyFamilies?: string[]; // v69 showFamily ids folded into this series
}

// ---------- People ----------

export interface RingName {
  name: string;
  from?: IsoDate; // documented start, when known
  to?: IsoDate; // documented end, when known
  note?: string;
  sources?: Url[];
  /** First and last show where this person alone was billed under the name (evidence, not a boundary). */
  billed?: { first: IsoDate; last: IsoDate };
}

export interface DatedFact {
  date: IsoDate;
  precision?: 'day' | 'month' | 'year';
  label?: string;
  source?: Url;
}

export interface ExternalTotals {
  provider: 'cagematch';
  matches?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  source?: Url;
  crawl?: string;
  note?: string;
}

export interface PromotionPeriod {
  id: string;
  name: string;
  fullName?: string;
  start?: IsoDate;
  end?: IsoDate;
  note?: string;
  sources?: Url[];
}

export interface Relationship {
  name: string;
  promotions?: string;
  period?: string;
  note?: string;
  source?: Url;
}

export interface SignatureMatch {
  segment?: string; // '<showId>#<key>' when the match is in the archive
  date: IsoDate;
  show: string;
  title: string;
  why: string;
  source?: Url;
}

export interface LinkRef {
  label: string;
  url: Url;
}

export interface Associate {
  name: string;
  meta?: string; // promotion and years, as written
  note?: string;
}

/** Structured career profile, parsed from the v69 explorer text. */
export interface CareerProfile {
  intro?: string;
  inBrief?: string;
  trainedBy?: { text: string; links?: LinkRef[] };
  signatureMoves?: { moves: string[]; note?: string; links?: LinkRef[] };
  associates?: Associate[];
  guestCornermen?: Associate[];
  links?: LinkRef[];
}

export interface Person {
  id: string;
  name: string;
  gender?: 'male' | 'female';
  genderBasis?: 'legacy-placeholder' | 'source';
  ringNames: RingName[];
  debut?: DatedFact;
  careerEnd?: DatedFact;
  displayThrough?: IsoDate; // last date a career timeline should draw (e.g. date of death)
  status?: { value: 'active' | 'retired'; source?: Url };
  promotions?: string[]; // promotions named in the career profile (free text for now)
  titleSummary?: { name: string; count: number; source?: Url }[];
  titleTotal?: number;
  awards?: string[];
  externalTotals?: ExternalTotals;
  summary?: string;
  affiliation?: { label: string; source?: Url; checked?: IsoDate };
  rosters?: { asOf: string; brands: string[]; name?: string }[];
  partial?: boolean;
  scopes?: { titles?: string; reigns?: string; record?: string };
  archiveFirst?: IsoDate;
  archiveLast?: IsoDate;
  curated?: {
    promotionPeriods?: PromotionPeriod[];
    relationships?: { feuds?: Relationship[]; factions?: Relationship[]; teams?: Relationship[] };
    signatureMatches?: SignatureMatch[];
    profile?: CareerProfile;
    /** v69 explorer content as rendered, kept for reference; pages use the structured fields. */
    legacyHtml?: Record<string, string>;
    sources?: Record<string, Url>;
  };
  checked?: IsoDate;
  spanChecked?: IsoDate;
  sources: Url[];
  legacyIds: string[];
  legacyFlags?: { yearRoster?: boolean; archiveOnly?: boolean; archiveProfile?: boolean; hadPortrait?: boolean };
  hoganProfile?: Record<string, unknown>;
}

// ---------- Shows and segments ----------

export type SegmentType = 'match' | 'promo' | 'appearance';
export type Outcome = 'win' | 'loss' | 'draw' | 'no-contest' | 'countout' | 'dq' | string;

export interface Participant {
  person: string; // person id
  role: 'competitor' | 'involved';
  outcome?: Outcome;
}

export interface RatingSource {
  provider: string;
  value: number;
  unit: string;
  url?: Url;
  checked?: IsoDate;
  votes?: number;
  reviewer?: string;
}

export interface Segment {
  key: string; // 'm1', 'm2' for matches, 's1' for other segments; never renumbered
  order?: number; // position in the card when a source gives it
  type: SegmentType;
  title: string;
  result?: string;
  context?: string;
  matchType?: string;
  duration?: string | number; // "4:19" in curated records, seconds in bulk records (to normalize)
  titleMatch?: boolean;
  participants: Participant[];
  billing?: string[]; // competitor names as billed, teams included
  guests?: string; // named participants without a person record
  unlinked?: boolean; // names on the card are not yet linked to people
  showCategory?: string;
  promotionLabel?: string;
  dateBasis?: string;
  rating?: { sources: RatingSource[]; matchCheck?: Record<string, unknown> };
  verification?: Record<string, unknown>;
  evidence?: string;
  sources: Url[];
  provenance?: Record<string, unknown>;
  legacyId: string;
  legacy?: Record<string, unknown>;
}

export interface Show {
  id: string; // '<promotion>/<series-slug>/<date>[-n]'
  promotion: string;
  series: string;
  name: string;
  date: IsoDate;
  dateBasis?: 'aired' | 'recorded';
  recordedDate?: IsoDate;
  category?: string;
  coverage: {
    card: 'indexed' | 'listed' | 'career-only' | 'unlinked';
    segments: 'reviewed-partial' | 'not-indexed' | 'unknown';
    note?: string;
    legacyCardStatus?: string;
    legacySegmentStatus?: string;
  };
  watch?: { url: Url; label?: string };
  notes?: string[];
  sources: Url[];
  segments: Segment[];
  legacyIds: string[];
  legacy?: Record<string, unknown>;
}

// ---------- Titles ----------

export interface Reign {
  id: string;
  holder: string;
  people: string[];
  start: IsoDate;
  end?: IsoDate;
  days?: number;
  ongoing?: boolean;
  note?: string;
  dateNote?: string;
  memberStarts?: Record<string, IsoDate>;
  curated?: boolean;
  sources: Url[];
  legacyIds: string[];
}

export interface Title {
  id: string;
  name: string;
  short?: string;
  names?: string[]; // every spelling seen in v69 data
  featured?: boolean;
  sources: Url[];
  reigns: Reign[];
}

// ---------- Storylines and families ----------

export interface Chapter {
  id: string;
  date: IsoDate;
  title: string;
  show?: string; // show name as written
  showId?: string;
  segment?: string; // '<showId>#<key>' when the chapter is an archived segment
  kind?: string;
  result?: string;
  context?: string;
  showCategory?: string;
  people?: string[];
  historical?: boolean;
  sources: Url[];
  legacyId?: string;
  legacyMoment?: string;
}

export interface Storyline {
  id: string;
  promotion: string;
  title: string;
  summary?: string;
  brands?: string[];
  cast?: string[];
  people?: string[];
  /** First milestone; end is the last milestone, absent while the story is still going. */
  start?: IsoDate;
  end?: IsoDate;
  source?: Url;
  chapters: Chapter[];
  legacyId: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  person?: string;
  branch?: string;
  note?: string;
  aliases?: string[];
  source?: string;
  layout?: { x: number; y: number };
}

export interface FamilyLink {
  a: string;
  b: string;
  type: string;
  label?: string;
  source?: string;
}

export interface Family {
  id: string;
  name: string;
  description?: string;
  branches: { id: string; name: string; note?: string }[];
  members: FamilyMember[];
  links: FamilyLink[];
  sources: Record<string, { label: string; url: Url }>;
}
