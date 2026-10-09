// Small shared pieces of markup.
import type { Participant, Person, Segment, Show, Title } from '../../scripts/lib/types.ts';
import { nameKey } from '../../scripts/lib/util.ts';
import { escapeHtml, html, raw, type Raw } from '../lib/html.ts';
import { GENERIC_TYPES, displayMatchType, formatDate, formatDuration } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl, showUrl } from '../lib/urls.ts';
import { initials } from '../app/model.ts';

/** The name a promotion went by on a date (WWWF → WWF → WWE). */
export function promotionNameAt(promotion: string, date: string, fallback: string): string {
  if (promotion === 'wwe') return date < '1979-03-01' ? 'WWWF' : date < '2002-05-06' ? 'WWF' : 'WWE';
  if (promotion === 'tna') return date >= '2017-03-02' && date < '2024-01-13' ? 'Impact' : 'TNA';
  return fallback;
}

/** The promotion a championship belongs to: its record's, else read from its id; undefined for promotions we don't track. */
export function titlePromotion(title: Title): string | undefined {
  if (title.promotion) return title.promotion;
  const id = title.id;
  if (/^(wwe|wwf|nxt)-|^(intercontinental|united-states|million-dollar)-|^world-(heavyweight|tag-team)-championship/.test(id)) return 'wwe';
  if (/^(iwgp|strong|never)-/.test(id)) return 'njpw';
  if (/^(tna|impact|gfw)-/.test(id)) return 'tna';
  const prefix = id.split('-')[0];
  return ['aaa', 'aew', 'cmll', 'ecw', 'roh', 'wcw'].includes(prefix) ? prefix : undefined;
}

/** A title as it was named on a date: from its eras when traced (the WWE Championship in 1984 was
 * the WWF World Heavyweight Championship), else, and for a short name passed in, the WWWF → WWF →
 * WWE rule for WWE titles. */
export function titleNameAt(title: Title, date: string, name = title.name): string {
  // Before its first era's date (a reign the source dates earlier) the title had its first name.
  const era = name === title.name ? title.eras?.filter((e) => e.from.slice(0, Math.min(e.from.length, date.length)) <= date.slice(0, Math.min(e.from.length, date.length))).at(-1) ?? title.eras?.[0] : undefined;
  if (era) return era.name;
  if (titlePromotion(title) !== 'wwe') return name;
  const brand = promotionNameAt('wwe', date, 'WWE');
  return brand === 'WWE' ? name : name.replace(/^WWE\b/, brand);
}

export function promoColor(promotion: string): string {
  return `var(--p-${promotion}, var(--text-3))`;
}

/** A person's initials tile, where a photo will go once a free-licensed one exists. */
export function avatar(name: string, promotion: string | undefined, size: 'small' | 'large' = 'small'): Raw {
  return html`<span class="avatar${size === 'large' ? ' avatar--large' : ''}" style="--c:${promoColor(promotion ?? 'other')}" aria-hidden="true">${initials(name)}</span>`;
}

export function promoTag(promotion: string, label: string): Raw {
  return html`<span class="promo-tag" style="--c:${promoColor(promotion)}">${label}</span>`;
}

/** Display form of a source URL: host and path, without protocol or www. */
export function sourceLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

export function sourcesList(urls: string[]): Raw {
  if (!urls.length) return html`<p class="quiet">No sources recorded yet.</p>`;
  return html`<ol class="sources">${urls.map((u) => html`<li><a href="${u}" rel="noopener">${sourceLabel(u)}</a></li>`)}</ol>`;
}

export function breadcrumbs(items: { name: string; url?: string }[]): Raw {
  return html`<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((c) => html`<li>${c.url ? html`<a href="${c.url}">${c.name}</a>` : html`<span aria-current="page">${c.name}</span>`}</li>`)}</ol></nav>`;
}

/** Names a person can appear under, longest first, for finding them in match titles. */
export function namesFor(person: Person | undefined): string[] {
  if (!person) return [];
  return [...new Set([person.name, ...person.ringNames.map((r) => r.name)])].filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
}

function findName(text: string, name: string, taken: { start: number; end: number }[]): { start: number; end: number } | undefined {
  let from = 0;
  for (;;) {
    const i = text.indexOf(name, from);
    if (i < 0) return undefined;
    const before = i === 0 ? ' ' : text[i - 1];
    const after = text[i + name.length] ?? ' ';
    const clash = taken.some((h) => i < h.end && i + name.length > h.start);
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after) && !clash) return { start: i, end: i + name.length };
    from = i + 1;
  }
}

/**
 * The title to show for a segment. Some imported records carry only a match type
 * ("Singles match"); those get one built from the billed names instead.
 */
export function displayTitle(seg: Segment, people: Map<string, Person>): string {
  const t = seg.title?.trim() ?? '';
  if (t && !GENERIC_TYPES.test(t) && t !== seg.matchType) return t;
  const comps = seg.participants.filter((p) => p.role === 'competitor');
  const names = seg.billing?.length === comps.length ? seg.billing : comps.map((p) => people.get(p.person)?.name ?? p.person);
  if (names.length === 2) return `${names[0]} vs. ${names[1]}`;
  if (names.length > 2) {
    // Teams of the same size, read from the result: "A and B vs. C and D".
    const won = names.filter((_, i) => comps[i].outcome === 'win');
    const lost = names.filter((_, i) => comps[i].outcome && comps[i].outcome !== 'win');
    const team = (list: string[]) => (list.length === 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
    if (won.length >= 2 && won.length === lost.length && won.length + lost.length === names.length) return `${team(won)} vs. ${team(lost)}`;
    return names.length <= 4 ? names.join(' vs. ') : names.join(', ');
  }
  return t || 'Untitled segment';
}

/**
 * Links participants' names inside a match title. Each participant is linked once, at the
 * longest of their names that appears. When none of their recorded names appear, the name
 * they were billed under on this card is tried (billing lists competitors in order). The
 * subject of the page is set in bold instead of linked.
 */
export function linkNames(seg: Segment, people: Map<string, Person>, subject?: string): { html: Raw; unlinked: Participant[] } {
  const text = displayTitle(seg, people);
  type Hit = { start: number; end: number; person: string };
  const hits: Hit[] = [];
  const unlinked: Participant[] = [];
  const competitors = seg.participants.filter((p) => p.role === 'competitor');
  const billingUsable = seg.billing?.length === competitors.length;
  for (const p of seg.participants) {
    let found: { start: number; end: number } | undefined;
    for (const name of namesFor(people.get(p.person))) {
      found = findName(text, name, hits);
      if (found) break;
    }
    if (!found && billingUsable && p.role === 'competitor') {
      const billed = seg.billing![competitors.indexOf(p)];
      const ownedByOther = seg.participants.some((o) => o.person !== p.person && namesFor(people.get(o.person)).includes(billed));
      if (billed && billed.length > 2 && !ownedByOther) found = findName(text, billed, hits);
    }
    if (found) hits.push({ ...found, person: p.person });
    else if (p.person !== subject) unlinked.push(p);
  }
  hits.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const h of hits) {
    out += escapeHtml(text.slice(pos, h.start));
    const label = escapeHtml(text.slice(h.start, h.end));
    out += h.person === subject ? `<strong>${label}</strong>` : `<a href="${personUrl(h.person)}">${label}</a>`;
    pos = h.end;
  }
  out += escapeHtml(text.slice(pos));
  return { html: raw(out), unlinked };
}

export function personLink(id: string, people: Map<string, Person>): Raw {
  return html`<a href="${personUrl(id)}">${people.get(id)?.name ?? id}</a>`;
}

export function peopleLinks(ids: string[], people: Map<string, Person>): Raw {
  return html`${ids.map((id, i) => html`${i ? (i === ids.length - 1 ? ' and ' : ', ') : ''}${personLink(id, people)}`)}`;
}

/** Links a free-text name to a person when exactly one person goes by it. */
export function nameLink(name: string, site: SiteData): Raw {
  const ids = site.peopleByName.get(nameKey(name.replace(/\s*\(.*\)$/, '')));
  return ids?.length === 1 ? html`<a href="${personUrl(ids[0])}">${name}</a>` : html`${name}`;
}

/** "Cage match, 12:04" — the stipulation and running time, when known. */
export function segmentMeta(seg: Segment): string {
  return [displayMatchType(seg.matchType), formatDuration(seg.duration)].filter(Boolean).join(', ');
}

/** "WWF Raw", "WCW Monday Nitro", "AEW Dynamite": the show as fans would name it. */
export function showLabel(show: Show, site: SiteData): string {
  const promo = promotionNameAt(show.promotion, show.date, site.promotions.get(show.promotion)?.name ?? show.promotion);
  if (show.promotion === 'indy') return show.name;
  const name = show.name;
  return name.toLowerCase().startsWith(promo.toLowerCase()) || name.startsWith('WCW ') || name.startsWith('WWF ') || name.startsWith('WWE ') ? name : `${promo} ${name}`;
}

export function showLink(show: Show, site: SiteData): Raw {
  return html`<a href="${showUrl(show)}">${showLabel(show, site)}</a>`;
}

export function dateCell(iso: string, href?: string): Raw {
  const t = html`<time datetime="${iso}">${formatDate(iso, { short: true })}</time>`;
  return html`<td class="date">${href ? html`<a href="${href}">${t}</a>` : t}</td>`;
}
