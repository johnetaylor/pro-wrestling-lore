// Formatting helpers shared by pages and components.
import type { Participant, Segment, Show } from '../../scripts/lib/types.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "March 10, 1997", "March 1997" or "1997" depending on the date's precision. */
export function formatDate(iso: string | undefined, opts: { short?: boolean; weekday?: boolean; noYear?: boolean } = {}): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = opts.short ? SHORT : MONTHS;
  if (!m) return String(y);
  if (!d) return opts.noYear ? months[m - 1] : `${months[m - 1]} ${y}`;
  const day = opts.weekday ? `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ` : '';
  return opts.noYear ? `${day}${months[m - 1]} ${d}` : `${day}${months[m - 1]} ${d}, ${y}`;
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return d ? DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] : '';
}

export function year(iso: string | undefined): string {
  return iso ? iso.slice(0, 4) : '';
}

/** "1997", or "1997–2004" for a span. */
export function yearSpan(first: string | undefined, last: string | undefined): string {
  const a = year(first);
  const b = year(last);
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a}–${b}`;
}

/** Durations arrive as "4:19" (curated) or seconds (bulk). */
export function formatDuration(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') {
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = Math.round(value % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  return value;
}

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}

export function sentenceList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function isPle(show: Show, kind: string | undefined): boolean {
  return kind === 'ple' || kind === 'special' || /ple|ppv|special/i.test(show.category ?? '');
}

// ---------- Matches ----------

/** Match types that say nothing the title doesn't already say. */
export const GENERIC_TYPES = /^(match|other match|singles( match)?|\d+-person match|tag team( match)?|tag)$/i;

/** A stipulation worth showing ("Cage match"), or '' for generic labels. */
export function displayMatchType(type: string | undefined): string {
  if (!type) return '';
  const t = type.trim();
  if (GENERIC_TYPES.test(t)) return '';
  return t.replace(/\bMatch$/, 'match');
}

/** How a match ended for one participant, from the outcomes on the card. */
export function outcomeLabel(seg: Segment, personId: string): string {
  const me = seg.participants.find((p) => p.person === personId);
  if (!me) return '';
  if (me.role === 'involved') return 'Involved';
  const others = seg.participants.filter((p) => p.role === 'competitor' && p.person !== personId);
  const anyWin = seg.participants.some((p) => p.outcome === 'win');
  const how = (ps: Participant[]) => (ps.some((p) => p.outcome === 'dq') ? ' by DQ' : ps.some((p) => p.outcome === 'countout') ? ' by count-out' : '');
  switch (me.outcome) {
    case 'win':
      return `Won${how(others)}`;
    case 'loss':
      return 'Lost';
    case 'dq':
      return anyWin ? 'Lost by DQ' : 'Double DQ';
    case 'countout':
      return anyWin ? 'Lost by count-out' : 'Double count-out';
    case 'no_contest':
    case 'no-contest':
      return 'No contest';
    case 'draw':
      return 'Draw';
    default:
      return '';
  }
}

export type OutcomeClass = 'win' | 'loss' | 'other' | '';
export function outcomeClass(label: string): OutcomeClass {
  if (!label) return '';
  if (label.startsWith('Won')) return 'win';
  if (label.startsWith('Lost')) return 'loss';
  return 'other';
}

// ---------- Ratings ----------

export interface RatingView {
  score: number | null; // PWL rating, 0–100, when at least two sources are eligible
  eligible: number;
  sources: { provider: string; name: string; text: string; url?: string; note?: string }[];
}

/**
 * PWL v1, as published in data/ratings.json: CAGEMATCH points × 10 and critic stars × 20,
 * capped to 0–100; CAGEMATCH needs five votes; one score per provider; two providers needed.
 */
export function ratingView(seg: Segment, ratings: { providers?: Record<string, { name: string; unit?: string }> }): RatingView | null {
  const sources = seg.rating?.sources ?? [];
  if (!sources.length) return null;
  const eligible = new Map<string, number>();
  for (const s of sources) {
    if (!Number.isFinite(s.value)) continue;
    if (s.provider === 'cagematch' && !((s.votes ?? 0) >= 5)) continue;
    eligible.set(s.provider, Math.max(0, Math.min(100, s.value * (s.unit === 'stars' ? 20 : 10))));
  }
  const values = [...eligible.values()];
  const score = values.length >= 2 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  return {
    score,
    eligible: values.length,
    sources: sources.map((s) => {
      const name = ratings.providers?.[s.provider]?.name ?? s.provider;
      const text = s.unit === 'stars' ? `${s.value} ${s.value === 1 ? 'star' : 'stars'}` : `${s.value.toFixed(2)} out of 10`;
      const note = s.provider === 'cagematch' && s.votes !== undefined ? (s.votes < 5 ? `${s.votes} votes, too few to count` : `${num(s.votes)} votes`) : undefined;
      return { provider: s.provider, name, text, url: s.url, note };
    }),
  };
}
