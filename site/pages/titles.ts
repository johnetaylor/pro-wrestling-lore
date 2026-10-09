// Championship pages and the championships index.
import type { Title } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { daysBetween, formatDate, num, plural, sentenceList, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl, titleUrl } from '../lib/urls.ts';
import { breadcrumbs, promoColor, sourceLabel, sourcesList, titlePromotion } from '../components/bits.ts';
export { titlePromotion };
import { reignStrip } from '../components/timelines.ts';
import type { PageMeta } from '../components/layout.ts';

type TitleReign = Title['reigns'][number];

interface TitleLink {
  id: string;
  date: string;
  kind: 'merge' | 'succeed' | 'shared';
  from: string[];
  to: string;
  label: string;
  text: string;
  sources: string[];
}

function reignDays(r: TitleReign, buildDate: string): number {
  return r.days ?? daysBetween(r.start, r.end ?? buildDate);
}

/** "Women's tag team", "Trios", "" for men's singles. */
export function titleKindLabel(t: Title): string {
  const format = t.format === 'tag' ? 'tag team' : t.format === 'trios' ? 'trios' : '';
  if (t.division === 'women') return `Women’s${format ? ` ${format}` : ''}`;
  if (t.division === 'mixed') return format ? `Mixed ${format}` : 'Open to anyone';
  return format ? format[0].toUpperCase() + format.slice(1) : '';
}

/** Whether the title has its champions now: not retired, and a lineal reign still going. */
const isActive = (t: Title) => !t.retired && t.reigns.some((r) => !r.end && !r.kind);

function holderLinks(r: TitleReign, site: SiteData): Raw {
  const unlinked = r.unlinked ?? [];
  if (r.people.length === 1 && !unlinked.length) return html`<a href="${personUrl(r.people[0])}">${r.holder}</a>`;
  if (!r.people.length) return html`${r.holder || unlinked.join(', ')}`;
  const names = [...r.people.map((p) => html`<a href="${personUrl(p)}">${site.people.get(p)?.name ?? p}</a>`), ...unlinked.map((n) => html`${n}`)];
  const team = r.holder && !/ & | and /.test(r.holder) ? r.holder : '';
  const joined = html`${names.map((n, i) => html`${i ? (i === names.length - 1 ? ' and ' : ', ') : ''}${n}`)}`;
  return team ? html`${team} <span class="quiet">(${joined})</span>` : joined;
}

function linksOf(site: SiteData, id: string): TitleLink[] {
  return ((site.lineages?.links ?? []) as TitleLink[]).filter((l) => l.to === id || l.from.includes(id));
}

function linkHead(l: TitleLink, id: string, site: SiteData): Raw {
  const out = l.from.includes(id);
  const others = (out ? [l.to] : l.from.filter((x) => x !== id)).map((x) => site.titles.get(x));
  const names = html`${others.map((t, i) => html`${i ? ' and ' : ''}${t ? html`the <a href="${titleUrl(t.id)}">${t.name}</a>` : ''}`)}`;
  if (l.kind === 'shared') return html`Held together with ${names}`;
  if (l.kind === 'merge') return out ? html`Unified into ${names}` : html`Absorbed ${names}`;
  return out ? html`Replaced by ${names}` : html`Took the place of ${names}`;
}

export function titlePage(title: Title, site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  const promo = titlePromotion(title);
  const promoName = promo ? site.promotions.get(promo)?.name ?? promo : 'Other promotions';
  const reigns = [...title.reigns];
  const lineal = reigns.filter((r) => !r.kind);
  const traced = !!title.established;
  const current = isActive(title) ? lineal.filter((r) => !r.end) : [];
  const otherNames = (title.names ?? []).filter((n) => n !== title.name);
  const first = lineal[0] ?? reigns[0];
  const kind = titleKindLabel(title);
  const lede = reigns.length
    ? traced
      ? `${[promoName, kind ? kind.toLowerCase() : ''].filter(Boolean).join(' ')} championship, established ${title.established!.length === 10 ? 'on ' : 'in '}${formatDate(title.established)}${title.retired ? ` and retired ${title.retired.length === 10 ? 'on ' : 'in '}${formatDate(title.retired)}` : ''}. ${plural(lineal.length, 'reign')}, from ${first.holder} ${first.start.length === 10 ? 'on' : 'in'} ${formatDate(first.start)}${current.length ? ` to ${sentenceList(current.map((r) => r.holder))}, the current ${current.length > 1 || current[0].people.length > 1 ? 'champions' : 'champion'}` : ''}.`
      : `${plural(reigns.length, 'reign')} in this archive, from ${first.holder} ${first.start.length === 10 ? 'on' : 'in'} ${formatDate(first.start)}${current.length ? ` to ${sentenceList(current.map((r) => r.holder))}, the current ${current.length > 1 || current[0].people.length > 1 ? 'champions' : 'champion'}` : ''}.`
    : 'No reigns of this championship are in the archive yet.';
  const longest = [...lineal].sort((a, b) => reignDays(b, buildDate) - reignDays(a, buildDate))[0];
  // A note shared by many reigns is said once above the table instead of on every row.
  const noteCounts = new Map<string, number>();
  for (const r of reigns) if (r.dateNote) noteCounts.set(r.dateNote, (noteCounts.get(r.dateNote) ?? 0) + 1);
  const shared = [...noteCounts].filter(([, n]) => n > 3).map(([note]) => note);
  const daysText = (r: TitleReign) => {
    const d = reignDays(r, buildDate);
    return `${d < 1 ? '<1' : num(d)}${r.end || title.retired ? '' : '+'}`;
  };
  const links = linksOf(site, title.id);

  // Names and milestones: the eras, the links to other titles and the title's own story.
  type Item = { date: string; head: Raw | string; text?: string; sources?: string[] };
  const items: Item[] = [];
  if (traced) {
    const firstEra = title.eras?.[0];
    items.push({ date: title.established!, head: `Established${firstEra && firstEra.name !== title.name ? ` as the ${firstEra.name}` : ''}`, text: first ? `${first.holder} ${first.start === title.established ? 'became' : 'was'} the first champion${first.start !== title.established ? `, ${first.start.length === 10 ? 'on' : 'in'} ${formatDate(first.start)}` : ''}.` : undefined });
    for (const e of title.eras?.slice(1) ?? []) items.push({ date: e.from, head: `Renamed the ${e.name}` });
    for (const l of links) items.push({ date: l.date, head: linkHead(l, title.id, site), text: l.text, sources: l.sources });
    const near = (a: string, b: string) => Math.abs(Date.parse(a.padEnd(10, '-01').slice(0, 10)) - Date.parse(b.padEnd(10, '-01').slice(0, 10))) <= 31 * 86400000;
    for (const e of title.history ?? []) {
      if (links.some((l) => near(l.date, e.date)) && /unif|absorb|replace|merge/i.test(`${e.kind} ${e.text}`)) continue;
      items.push({ date: e.date, head: '', text: e.text, sources: e.sources });
    }
    if (title.retired) items.push({ date: title.retired, head: 'Retired' });
    items.sort((a, b) => a.date.localeCompare(b.date) || Number(!a.head) - Number(!b.head));
  }

  const body = html`<article class="title-page">
<header class="page-head">
${breadcrumbs([{ name: 'Championships', url: '/titles/' }, { name: title.name }])}
<h1>${title.name}</h1>
${otherNames.length ? html`<p class="aka">Also known as ${sentenceList(otherNames)}.</p>` : ''}
<p class="lede">${lede}</p>
${longest && lineal.length > 2 ? html`<p class="facts">Longest reign: ${longest.holder}, ${plural(reignDays(longest, buildDate), 'day')}.${traced ? '' : ' Gaps in the list are reigns still to be added, so reign counts are not official numbers.'}</p>` : ''}
</header>
${reignStrip(title, buildDate) ?? ''}
${items.length
    ? html`<section class="section" aria-labelledby="history-h"><h2 id="history-h">Names and milestones</h2>
<ol class="milestone-list">${items.map((i) => html`<li><span class="date">${formatDate(i.date)}</span><div>${i.head ? html`<strong>${i.head}</strong>` : ''}${i.text ? html`<p>${i.text}</p>` : ''}${i.sources?.length ? html`<p class="cell-note">${i.sources.map((u, n) => html`${n ? ', ' : ''}<a href="${u}" rel="noopener">${sourceLabel(u)}</a>`)}</p>` : ''}</div></li>`)}</ol></section>`
    : ''}
${reigns.length
    ? html`<section class="section" aria-labelledby="reigns-h"><h2 id="reigns-h">${traced ? 'Every champion' : 'Reigns'}</h2>
${shared.map((n) => html`<p class="section-note">${n.replace(/\.$/, '')} (${plural(noteCounts.get(n)!, 'reign')}).</p>`)}
${reigns.length > lineal.length ? html`<p class="section-note">Interim and unrecognized reigns are listed with the lineal ones but don't count toward the reign numbers.</p>` : ''}
<div class="table-wrap"><table class="data reigns">
<thead><tr>${traced ? html`<th scope="col" class="num">No.</th>` : ''}<th scope="col">Champion</th><th scope="col">Won</th><th scope="col">Lost</th>${traced ? html`<th scope="col" class="where">Where</th>` : ''}<th scope="col" class="num">Days</th></tr></thead>
<tbody>${reigns.map(
        (r) =>
          html`<tr id="${r.id}"${r.kind ? html` class="kind-${r.kind}"` : ''}>${traced ? html`<td class="num">${r.number ? num(r.number) : r.kind ? html`<span class="quiet">${r.kind === 'interim' ? 'Interim' : 'Unrecognized'}</span>` : '—'}</td>` : ''}<td>${holderLinks(r, site)}${r.note ? html`<p class="cell-note">${r.note}</p>` : ''}${r.dateNote && !shared.includes(r.dateNote) ? html`<p class="cell-note">${r.dateNote}</p>` : ''}</td><td class="date">${formatDate(r.start, { short: true })}</td><td class="date">${r.end ? formatDate(r.end, { short: true }) : title.retired ? '' : html`<span class="current">Current</span>`}</td>${traced ? html`<td class="where">${[r.event, r.location].filter(Boolean).join(', ')}</td>` : ''}<td class="num">${daysText(r)}</td></tr>`,
      )}</tbody>
</table></div></section>`
    : ''}
<section class="section" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2>${sourcesList([...new Set([...title.sources, ...reigns.flatMap((r) => r.sources)])])}</section>
</article>`;
  return {
    meta: {
      title: `${title.name}: title history and every champion`,
      description: `${title.name} history${promo ? ` (${promoName})` : ''}: ${lede}`.slice(0, 300),
      path: titleUrl(title.id),
      nav: 'titles',
      breadcrumbs: [
        { name: 'Championships', url: '/titles/' },
        { name: title.name, url: titleUrl(title.id) },
      ],
    },
    body,
  };
}

const PROMO_ORDER = ['wwe', 'aew', 'tna', 'njpw', 'aaa', 'roh', 'cmll', 'stardom', 'nwa', 'wcw', 'ecw'];

export function titlesIndex(site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  const groups = new Map<string, Title[]>();
  for (const t of site.titles.values()) {
    const p = titlePromotion(t) ?? 'other';
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(t);
  }
  const order = [...PROMO_ORDER.filter((p) => groups.has(p)), ...[...groups.keys()].filter((p) => !PROMO_ORDER.includes(p) && p !== 'other').sort(), 'other'].filter((p) => groups.has(p));
  const listed = [...groups.values()].flat();
  const total = listed.reduce((a, t) => a + t.reigns.length, 0);
  const traced = listed.filter((t) => t.established).length;
  const row = (t: Title) => {
    const cur = isActive(t) ? t.reigns.filter((r) => !r.end && !r.kind) : [];
    const last = t.retired ?? t.reigns.map((r) => r.end ?? buildDate).sort().at(-1);
    const span = t.reigns.length ? yearSpan(t.established ?? t.reigns[0].start, isActive(t) ? buildDate : last) : '';
    const kind = titleKindLabel(t);
    return html`<li><a href="${titleUrl(t.id)}">${t.name}</a><span class="quiet">${kind ? `${kind}, ` : ''}${cur.length ? html`${cur.map((r) => r.holder).join(', ')}, current` : span}${t.reigns.length ? `, ${plural(t.reigns.filter((r) => !r.kind).length, 'reign')}` : ''}</span></li>`;
  };
  const sort = (a: Title, b: Title) => Number(!!b.featured) - Number(!!a.featured) || b.reigns.length - a.reigns.length || a.name.localeCompare(b.name);
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Championships' }])}
<h1>Championships</h1>
<p class="lede">${plural(listed.length, 'championship')} and ${num(total)} reigns, each linked to the champions' careers. ${num(traced)} are traced from their first champion to today, with the names they carried and the titles they absorbed or became.</p>
</header>
${order.map((p) => {
    const list = groups.get(p)!;
    const active = list.filter((t) => isActive(t) || !t.established).sort(sort);
    const past = list.filter((t) => !active.includes(t)).sort(sort);
    const name = p === 'other' ? 'Other promotions' : site.promotions.get(p)?.fullName ?? site.promotions.get(p)?.name ?? p;
    return html`<section class="section" aria-labelledby="t-${p}"><h2 id="t-${p}" class="promo-head" style="--c:${p === 'other' ? 'var(--p-other)' : promoColor(p)}">${name}</h2>${active.length ? html`<ul class="link-list link-list--cols">${active.map(row)}</ul>` : ''}${past.length ? html`<h3 class="sub-head">${active.length ? 'Retired and inactive' : 'Retired'}</h3><ul class="link-list link-list--cols">${past.map(row)}</ul>` : ''}</section>`;
  })}`;
  return {
    meta: {
      title: 'Championships: title histories and every champion',
      description: `Title histories for ${plural(listed.length, 'championship')} across WWE, WCW, ECW, AEW, TNA, NJPW, ROH and more: every champion from the first, the names each title carried, and every reign linked to the champion's career.`,
      path: '/titles/',
      nav: 'titles',
      breadcrumbs: [{ name: 'Championships', url: '/titles/' }],
    },
    body,
  };
}
