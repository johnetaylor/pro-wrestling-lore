// Show indexes: all promotions, one promotion, one series, one series year.
import type { Series, Show } from '../../scripts/lib/types.ts';
import { escapeHtml, html, raw, type Raw } from '../lib/html.ts';
import { formatDate, num, plural, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { promotionUrl, seriesUrl, showUrl } from '../lib/urls.ts';
import { breadcrumbs, promotionNameAt, promoColor } from '../components/bits.ts';
import { archiveChart } from '../components/timelines.ts';
import type { PageMeta } from '../components/layout.ts';

export const LANE_ORDER = ['wwe', 'wcw', 'ecw', 'aew', 'tna', 'roh', 'njpw', 'aaa', 'cmll', 'stardom', 'awa', 'indy'];
/** A series gets one page per year once it has more shows than this. */
export const YEAR_PAGES_OVER = 60;

const KIND_LABEL: Record<string, string> = {
  weekly: 'Weekly television',
  ple: 'Pay-per-views and premium live events',
  special: 'Television specials',
  event: 'Tournaments and events',
  arena: 'Arena cards',
};
const KIND_ORDER = ['weekly', 'ple', 'special', 'event', 'arena'];

export const seriesYearUrl = (seriesId: string, y: string) => `/shows/${seriesId}/${y}/`;

/** The main event as listed: the last match on the card. */
function mainEvent(show: Show): string {
  const matches = show.segments.filter((s) => s.type === 'match');
  const last = [...matches].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).at(-1);
  return last?.title ?? '';
}

function showRows(shows: Show[], opts: { withName?: boolean } = {}): Raw {
  return html`<div class="table-wrap"><table class="data">
<thead><tr><th scope="col">Date</th>${opts.withName ? html`<th scope="col">Show</th>` : ''}<th scope="col">Main event in the archive</th><th scope="col" class="num">Matches</th></tr></thead>
<tbody>${shows.map((s) => {
    const n = s.segments.filter((x) => x.type === 'match').length;
    return html`<tr><td class="date"><a href="${showUrl(s)}"><time datetime="${s.date}">${formatDate(s.date, { short: true })}</time></a></td>${opts.withName ? html`<td><a href="${showUrl(s)}">${s.name}</a></td>` : ''}<td>${mainEvent(s) || html`<span class="quiet">Card not indexed yet</span>`}</td><td class="num">${n || ''}</td></tr>`;
  })}</tbody></table></div>`;
}

/** Shows per year for one series, as bars; each bar links to that year. */
function yearBars(series: Series, shows: Show[], linkYears: boolean): Raw {
  const counts = new Map<number, number>();
  for (const s of shows) counts.set(Number(s.date.slice(0, 4)), (counts.get(Number(s.date.slice(0, 4))) ?? 0) + 1);
  const years = [...counts.keys()];
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const n = y1 - y0 + 1;
  const W = 1200;
  const H = 96;
  const L = 0;
  const bw = (W - L) / n;
  const max = Math.max(...counts.values());
  let out = '';
  for (let y = y0; y <= y1; y++) {
    const c = counts.get(y) ?? 0;
    const h = c ? Math.max(3, (c / max) * (H - 30)) : 0;
    const x = L + (y - y0) * bw;
    const rect = `<rect class="bar" x="${(x + 1).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" style="fill:${promoColor(series.promotion)}"><title>${y}: ${plural(c, 'show')}</title></rect>`;
    out += c && linkYears ? `<a href="${seriesYearUrl(series.id, String(y))}">${rect}</a>` : rect;
    const step = n > 30 ? 5 : n > 12 ? 2 : 1;
    if ((y - y0) % step === 0 || y === y1) out += `<text class="axis-label" x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${y}</text>`;
  }
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(`${series.name} shows in the archive per year, ${y0} to ${y1}`)}">${out}</svg>`;
  return html`<figure class="strip strip--compact"><div class="strip__scroll">${raw(svg)}</div><figcaption>Shows in the archive per year${linkYears ? '; select a year to see its episodes' : ''}. Short bars are years still being filled in.</figcaption></figure>`;
}

export function seriesPages(series: Series, site: SiteData): { meta: PageMeta; body: Raw }[] {
  const shows = site.showsBySeries.get(series.id) ?? [];
  const promo = site.promotions.get(series.promotion);
  const promoName = promo?.name ?? series.promotion;
  const first = shows[0];
  const last = shows.at(-1);
  const era = first ? promotionNameAt(series.promotion, first.date, promoName) : promoName;
  const split = shows.length > YEAR_PAGES_OVER;
  const byYear = new Map<string, Show[]>();
  for (const s of shows) {
    const y = s.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const crumbsBase = [
    { name: 'Shows', url: '/shows/' },
    { name: promoName, url: promotionUrl(series.promotion) },
  ];
  const lede = shows.length
    ? `${plural(shows.length, series.kind === 'weekly' ? 'episode' : 'show')} in this archive, from ${formatDate(first!.date)} to ${formatDate(last!.date)}.`
    : 'No shows from this series are in the archive yet.';
  const pages: { meta: PageMeta; body: Raw }[] = [];
  const recent = [...shows].reverse().slice(0, 12);
  const body = html`<header class="page-head">
${breadcrumbs([...crumbsBase, { name: series.name }])}
<h1>${series.name}</h1>
<p class="lede">${KIND_LABEL[series.kind] ? `${era} ${series.kind === 'weekly' ? 'weekly show' : series.kind === 'ple' ? 'pay-per-view' : series.kind === 'special' ? 'television special' : series.kind === 'arena' ? 'arena cards' : 'event'}. ` : ''}${lede}</p>
${series.note ? html`<p class="note">${series.note}</p>` : ''}
</header>
${shows.length > 1 ? yearBars(series, shows, split) : ''}
${split
    ? html`<section class="section" aria-labelledby="years-h"><h2 id="years-h">By year</h2><ul class="year-grid">${[...byYear].map(([y, list]) => html`<li><a href="${seriesYearUrl(series.id, y)}">${y}</a><span class="quiet">${list.length}</span></li>`)}</ul></section>
<section class="section" aria-labelledby="recent-h"><h2 id="recent-h">Latest in the archive</h2>${showRows(recent)}</section>`
    : html`<section class="section" aria-labelledby="all-h"><h2 id="all-h">${series.kind === 'weekly' ? 'Episodes' : 'Shows'}</h2>${showRows([...shows].reverse(), { withName: shows.some((s) => s.name !== series.name) })}</section>`}`;
  pages.push({
    meta: {
      title: `${era} ${series.name}: every show and result${first ? `, ${yearSpan(first.date, last!.date)}` : ''}`.replace(/^(\w+) \1 /, '$1 '),
      description: `${series.name} results in the Pro Wrestling Lore archive: ${lede}`,
      path: seriesUrl(series.id),
      nav: 'shows',
      breadcrumbs: [...crumbsBase, { name: series.name, url: seriesUrl(series.id) }],
    },
    body,
  });
  if (split) {
    const years = [...byYear.keys()];
    years.forEach((y, i) => {
      const list = byYear.get(y)!;
      const prev = years[i - 1];
      const next = years[i + 1];
      const yEra = promotionNameAt(series.promotion, `${y}-12-31`, promoName);
      pages.push({
        meta: {
          title: `${yEra} ${series.name} ${y}: every episode and result`.replace(/^(\w+) \1 /, '$1 '),
          description: `${series.name} in ${y}: ${plural(list.length, 'episode')} with match results, from ${formatDate(list[0].date)} to ${formatDate(list.at(-1)!.date)}.`,
          path: seriesYearUrl(series.id, y),
          nav: 'shows',
          breadcrumbs: [...crumbsBase, { name: series.name, url: seriesUrl(series.id) }, { name: y, url: seriesYearUrl(series.id, y) }],
        },
        body: html`<header class="page-head">
${breadcrumbs([...crumbsBase, { name: series.name, url: seriesUrl(series.id) }, { name: y }])}
<h1>${series.name}<span class="h1-sub">${y}</span></h1>
<p class="lede">${plural(list.length, 'episode')} of ${yEra} ${series.name} from ${y} in this archive.</p>
</header>
${showRows(list)}
<nav class="pager" aria-label="Years">${prev ? html`<a class="pager__prev" href="${seriesYearUrl(series.id, prev)}"><span>Previous year</span>${prev}</a>` : ''}${next ? html`<a class="pager__next" href="${seriesYearUrl(series.id, next)}"><span>Next year</span>${next}</a>` : ''}</nav>`,
      });
    });
  }
  return pages;
}

function seriesList(list: Series[], site: SiteData): Raw {
  return html`<ul class="link-list link-list--cols">${list.map((s) => {
    const shows = site.showsBySeries.get(s.id) ?? [];
    return html`<li><a href="${seriesUrl(s.id)}">${s.name}</a><span class="quiet">${shows.length ? `${yearSpan(shows[0].date, shows.at(-1)!.date)}, ${num(shows.length)}` : 'none yet'}</span></li>`;
  })}</ul>`;
}

export function promotionPage(promotionId: string, site: SiteData): { meta: PageMeta; body: Raw } {
  const promo = site.promotions.get(promotionId)!;
  const list = [...site.series.values()].filter((s) => s.promotion === promotionId && (site.showsBySeries.get(s.id)?.length ?? 0) > 0);
  const shows = list.flatMap((s) => site.showsBySeries.get(s.id) ?? []);
  const dates = shows.map((s) => s.date).sort();
  const segs = shows.reduce((a, s) => a + s.segments.length, 0);
  const formerly = (promo.aliases ?? []).filter((a) => a !== promo.name);
  const byKind = KIND_ORDER.map((k) => [k, list.filter((s) => s.kind === k).sort((a, b) => (site.showsBySeries.get(b.id)?.length ?? 0) - (site.showsBySeries.get(a.id)?.length ?? 0))] as const).filter(([, l]) => l.length);
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Shows', url: '/shows/' }, { name: promo.name }])}
<h1 class="promo-head" style="--c:${promoColor(promotionId)}">${promo.fullName ?? promo.name}</h1>
${formerly.length ? html`<p class="aka">Also known as ${formerly.join(', ')}.</p>` : ''}
<p class="lede">${plural(shows.length, 'show')} and ${plural(segs, 'match or segment', 'matches and segments')} in this archive${dates.length ? `, from ${formatDate(dates[0])} to ${formatDate(dates.at(-1))}` : ''}.</p>
</header>
${byKind.map(([k, l]) => html`<section class="section" aria-labelledby="k-${k}"><h2 id="k-${k}">${KIND_LABEL[k]}</h2>${seriesList(l, site)}</section>`)}`;
  return {
    meta: {
      title: `${promo.name} shows and results`,
      description: `${promo.fullName ?? promo.name} in the Pro Wrestling Lore archive: ${plural(shows.length, 'show')} of televised results, by series and year.`,
      path: promotionUrl(promotionId),
      nav: 'shows',
      breadcrumbs: [
        { name: 'Shows', url: '/shows/' },
        { name: promo.name, url: promotionUrl(promotionId) },
      ],
    },
    body,
  };
}

export function showsIndex(site: SiteData): { meta: PageMeta; body: Raw } {
  const promos = LANE_ORDER.filter((p) => site.promotions.has(p));
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Shows' }])}
<h1>Shows</h1>
<p class="lede">${plural(site.shows.size, 'televised show')} with ${num(site.segmentCount)} matches and segments, by promotion.</p>
</header>
${archiveChart(site)}
<div class="columns columns--wide">${promos.map((p) => {
    const promo = site.promotions.get(p)!;
    const series = [...site.series.values()].filter((s) => s.promotion === p && (site.showsBySeries.get(s.id)?.length ?? 0) > 0);
    const count = series.reduce((a, s) => a + (site.showsBySeries.get(s.id)?.length ?? 0), 0);
    if (!count) return '';
    const top = series.sort((a, b) => (site.showsBySeries.get(b.id)?.length ?? 0) - (site.showsBySeries.get(a.id)?.length ?? 0)).slice(0, 5);
    return html`<section class="section promo-block" aria-labelledby="p-${p}"><h2 id="p-${p}" class="promo-head" style="--c:${promoColor(p)}"><a href="${promotionUrl(p)}">${promo.name}</a></h2><p class="quiet">${plural(count, 'show')}${promo.fullName ? `, ${promo.fullName}` : ''}</p><ul class="link-list">${top.map((s) => html`<li><a href="${seriesUrl(s.id)}">${s.name}</a><span class="quiet">${num(site.showsBySeries.get(s.id)!.length)}</span></li>`)}</ul>${series.length > top.length ? html`<p class="more"><a href="${promotionUrl(p)}">All ${plural(series.length, 'series', 'series')}</a></p>` : ''}</section>`;
  })}</div>`;
  return {
    meta: {
      title: 'Shows: televised wrestling results by promotion',
      description: `Results from ${plural(site.shows.size, 'televised show')}: WWE Raw and SmackDown, WCW Nitro, AEW Dynamite, pay-per-views and more, by promotion, series and year.`,
      path: '/shows/',
      nav: 'shows',
      breadcrumbs: [{ name: 'Shows', url: '/shows/' }],
    },
    body,
  };
}
