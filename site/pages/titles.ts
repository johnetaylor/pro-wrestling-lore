// Championship pages and the championships index.
import type { Title } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { daysBetween, formatDate, num, plural, sentenceList, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl, titleUrl } from '../lib/urls.ts';
import { breadcrumbs, promoColor, sourcesList, titlePromotion } from '../components/bits.ts';
export { titlePromotion };
import { reignStrip } from '../components/timelines.ts';
import type { PageMeta } from '../components/layout.ts';

function reignDays(r: Title['reigns'][number], buildDate: string): number {
  return r.days ?? daysBetween(r.start, r.end ?? buildDate);
}

function holderLinks(r: Title['reigns'][number], site: SiteData): Raw {
  if (r.people.length === 1) return html`<a href="${personUrl(r.people[0])}">${r.holder}</a>`;
  const linked = r.people.map((p) => site.people.get(p)?.name ?? p);
  const team = r.holder && !linked.includes(r.holder) && !r.holder.includes(' & ') ? r.holder : '';
  return html`${team ? html`${team} <span class="quiet">(` : ''}${r.people.map((p, i) => html`${i ? (i === r.people.length - 1 ? ' and ' : ', ') : ''}<a href="${personUrl(p)}">${site.people.get(p)?.name ?? p}</a>`)}${team ? html`)</span>` : ''}`;
}

export function titlePage(title: Title, site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  const promo = titlePromotion(title);
  const promoName = promo ? site.promotions.get(promo)?.name ?? promo : 'Other promotions';
  const reigns = [...title.reigns];
  const current = reigns.filter((r) => !r.end);
  const otherNames = (title.names ?? []).filter((n) => n !== title.name);
  const first = reigns[0];
  const lede = reigns.length
    ? `${plural(reigns.length, 'reign')} in this archive, from ${first.holder} ${first.start.length === 10 ? 'on' : 'in'} ${formatDate(first.start)}${current.length ? ` to ${sentenceList(current.map((r) => r.holder))}, the current ${current.length > 1 || current[0].people.length > 1 ? 'champions' : 'champion'}` : ''}.`
    : 'No reigns of this championship are in the archive yet.';
  const longest = [...reigns].sort((a, b) => reignDays(b, buildDate) - reignDays(a, buildDate))[0];
  // A note shared by many reigns is said once above the table instead of on every row.
  const noteCounts = new Map<string, number>();
  for (const r of reigns) if (r.dateNote) noteCounts.set(r.dateNote, (noteCounts.get(r.dateNote) ?? 0) + 1);
  const shared = [...noteCounts].filter(([, n]) => n > 3).map(([note]) => note);
  const daysText = (r: Title['reigns'][number]) => {
    const d = reignDays(r, buildDate);
    return d < 1 ? 'Under 1' : num(d);
  };
  const body = html`<article class="title-page">
<header class="page-head">
${breadcrumbs([{ name: 'Championships', url: '/titles/' }, { name: title.name }])}
<h1>${title.name}</h1>
${otherNames.length ? html`<p class="aka">Also known as ${sentenceList(otherNames)}.</p>` : ''}
<p class="lede">${lede}</p>
${longest && reigns.length > 2 ? html`<p class="facts">Longest reign here: ${longest.holder}, ${plural(reignDays(longest, buildDate), 'day')}. Gaps in the list are reigns still to be added, so reign counts are not official numbers.</p>` : ''}
</header>
${reignStrip(title, buildDate) ?? ''}
${reigns.length
    ? html`<section class="section" aria-labelledby="reigns-h"><h2 id="reigns-h">Reigns</h2>
${shared.map((n) => html`<p class="section-note">${n.replace(/\.$/, '')} (${plural(noteCounts.get(n)!, 'reign')}).</p>`)}
<div class="table-wrap"><table class="data reigns">
<thead><tr><th scope="col">Champion</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col" class="num">Days</th></tr></thead>
<tbody>${reigns.map((r) => html`<tr id="${r.id}"><td>${holderLinks(r, site)}${r.note ? html`<p class="cell-note">${r.note}</p>` : ''}${r.dateNote && !shared.includes(r.dateNote) ? html`<p class="cell-note">${r.dateNote}</p>` : ''}</td><td class="date">${formatDate(r.start, { short: true })}</td><td class="date">${r.end ? formatDate(r.end, { short: true }) : html`<span class="current">Current</span>`}</td><td class="num">${daysText(r)}</td></tr>`)}</tbody>
</table></div></section>`
    : ''}
<section class="section" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2>${sourcesList([...new Set([...title.sources, ...reigns.flatMap((r) => r.sources)])])}</section>
</article>`;
  return {
    meta: {
      title: `${title.name}: title history and reigns`,
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

const PROMO_ORDER = ['wwe', 'aew', 'wcw', 'ecw', 'tna', 'njpw', 'roh', 'aaa', 'cmll'];

export function titlesIndex(site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  const groups = new Map<string, Title[]>();
  for (const t of site.titles.values()) {
    const p = titlePromotion(t) ?? 'other';
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(t);
  }
  const order = [...PROMO_ORDER.filter((p) => groups.has(p)), 'other'].filter((p) => groups.has(p));
  const total = [...site.titles.values()].reduce((a, t) => a + t.reigns.length, 0);
  const row = (t: Title) => {
    const cur = t.reigns.filter((r) => !r.end);
    const span = t.reigns.length ? yearSpan(t.reigns[0].start, t.reigns.at(-1)!.end ?? buildDate) : '';
    return html`<li><a href="${titleUrl(t.id)}">${t.name}</a><span class="quiet">${cur.length ? html`${cur.map((r) => r.holder).join(', ')}, current` : span}${t.reigns.length ? `, ${plural(t.reigns.length, 'reign')}` : ''}</span></li>`;
  };
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Championships' }])}
<h1>Championships</h1>
<p class="lede">${plural(site.titles.size, 'championship')} and ${num(total)} reigns, each linked to the champions' careers.</p>
</header>
${order.map((p) => {
    const list = groups.get(p)!.sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || b.reigns.length - a.reigns.length || a.name.localeCompare(b.name));
    const name = p === 'other' ? 'Other promotions' : site.promotions.get(p)?.fullName ?? site.promotions.get(p)?.name ?? p;
    return html`<section class="section" aria-labelledby="t-${p}"><h2 id="t-${p}" class="promo-head" style="--c:${p === 'other' ? 'var(--p-other)' : promoColor(p)}">${name}</h2><ul class="link-list link-list--cols">${list.map(row)}</ul></section>`;
  })}`;
  return {
    meta: {
      title: 'Championships: title histories and reigns',
      description: `Title histories for ${plural(site.titles.size, 'championship')} across WWE, WCW, AEW, TNA, NJPW and more, with every reign linked to the champion's career.`,
      path: '/titles/',
      nav: 'titles',
      breadcrumbs: [{ name: 'Championships', url: '/titles/' }],
    },
    body,
  };
}
