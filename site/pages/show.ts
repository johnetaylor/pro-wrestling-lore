// Show page: one episode or event, its card in running order.
import type { Segment, Show } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { formatDate, plural, ratingView, sentenceList, weekday, year } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { promotionUrl, seriesUrl, showUrl } from '../lib/urls.ts';
import { breadcrumbs, linkNames, peopleLinks, segmentMeta, showLabel, sourcesList } from '../components/bits.ts';
import type { PageMeta } from '../components/layout.ts';

/** Segments in running order: by position when the source gives one, else matches then other segments. */
export function runningOrder(show: Show): Segment[] {
  const known = show.segments.every((s) => s.order !== undefined);
  if (known) return [...show.segments].sort((a, b) => a.order! - b.order! || a.key.localeCompare(b.key, 'en', { numeric: true }));
  const rank = (s: Segment) => (s.order ?? 1e6);
  return [...show.segments].sort((a, b) => rank(a) - rank(b) || (a.type === 'match' ? 0 : 1) - (b.type === 'match' ? 0 : 1) || a.key.localeCompare(b.key, 'en', { numeric: true }));
}

function ratingBlock(seg: Segment, site: SiteData): Raw | '' {
  const r = ratingView(seg, site.ratings);
  if (!r) return '';
  return html`<div class="rating">${r.score != null ? html`<p class="rating__score" title="PWL rating: the mean of ${r.eligible} published ratings on a 0 to 100 scale"><span class="visually-hidden">PWL rating </span>${r.score}<small>/100</small></p>` : ''}<ul class="rating__sources">${r.sources.map((s) => html`<li>${s.url ? html`<a href="${s.url}" rel="noopener">${s.name}</a>` : s.name} ${s.text}${s.note ? html` <span class="quiet">(${s.note})</span>` : ''}</li>`)}</ul></div>`;
}

function segmentItem(seg: Segment, site: SiteData, numbered: boolean): Raw {
  const { html: title, unlinked } = linkNames(seg, site.people);
  const meta = segmentMeta(seg);
  const involved = seg.participants.filter((p) => p.role === 'involved').map((p) => p.person);
  const kind = seg.type === 'match' ? 'match' : seg.type === 'promo' ? 'promo' : 'appearance';
  const loose = unlinked.filter((p) => p.role === 'competitor').map((p) => p.person);
  return html`<li class="bout bout--${kind}" id="${seg.key}">
<p class="bout__n" aria-hidden="${numbered ? 'false' : 'true'}">${numbered ? seg.order : ''}</p>
<div class="bout__body">
<p class="bout__title">${seg.type !== 'match' ? html`<span class="kind">${seg.type === 'promo' ? 'Promo' : 'Appearance'}</span> ` : ''}${title}</p>
${seg.result && seg.result !== seg.title ? html`<p class="bout__result">${seg.result}</p>` : ''}
${seg.context && seg.context !== seg.result ? html`<p class="bout__context">${seg.context.replace(/ · Duration: [\d:]+\.?$/, '')}</p>` : ''}
${meta || seg.titleMatch ? html`<p class="bout__meta">${seg.titleMatch ? html`<span class="title-mark">Title match</span>${meta ? ', ' : ''}` : ''}${meta}</p>` : ''}
${loose.length ? html`<p class="bout__meta">With ${peopleLinks(loose, site.people)}</p>` : ''}
${involved.length ? html`<p class="bout__meta">Also involved: ${peopleLinks(involved, site.people)}</p>` : ''}
${seg.guests ? html`<p class="bout__meta">Also on screen: ${seg.guests}</p>` : ''}
</div>
${ratingBlock(seg, site)}
</li>`;
}

export function coverageNote(show: Show, numbered: boolean, order: Segment[]): string {
  const notes: string[] = [];
  const c = show.coverage;
  if (c.card === 'career-only') notes.push('Only matches from wrestlers with full career records are listed for this show so far.');
  else if (c.card === 'listed') notes.push('This show is listed, but its card has not been indexed yet.');
  else if (c.card === 'unlinked') notes.push('The card is listed, but some names are not yet linked to wrestler pages.');
  if (c.segments !== 'reviewed-partial' && show.segments.length && !show.segments.some((s) => s.type !== 'match')) notes.push('Promos and other segments are not indexed yet.');
  if (numbered) {
    const positions = order.map((s) => s.order!);
    const max = Math.max(...positions);
    if (positions.length < max) notes.push('Numbers are positions on the televised card; missing numbers are segments not in the archive.');
  }
  if (c.note) notes.push(c.note);
  return notes.join(' ');
}

export function showPage(show: Show, site: SiteData): { meta: PageMeta; body: Raw } {
  const series = site.series.get(show.series);
  const promo = site.promotions.get(show.promotion);
  const label = showLabel(show, site);
  const order = runningOrder(show);
  const numbered = order.length > 0 && order.every((s) => s.order !== undefined);
  const list = site.showsBySeries.get(show.series) ?? [];
  const i = list.findIndex((s) => s.id === show.id);
  const prev = i > 0 ? list[i - 1] : undefined;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : undefined;
  const matches = show.segments.filter((s) => s.type === 'match');
  const others = show.segments.length - matches.length;
  const day = weekday(show.date);
  const aired = show.dateBasis === 'recorded' ? 'Taped' : series?.kind === 'weekly' ? 'Aired' : 'Held';
  const lede = `${label}, ${aired.toLowerCase()} ${day ? `${day}, ` : ''}${formatDate(show.date)}.${show.recordedDate ? ` Taped ${formatDate(show.recordedDate)}.` : ''}`;
  const counts = [matches.length ? plural(matches.length, 'match', 'matches') : '', others ? plural(others, 'other segment') : ''].filter(Boolean);
  const note = coverageNote(show, numbered, order);
  const seriesName = series?.name ?? show.name;
  const crumbs = [
    { name: 'Shows', url: '/shows/' },
    { name: promo?.name ?? show.promotion, url: promotionUrl(show.promotion) },
    ...(series && series.name !== show.name || (series && list.length > 1) ? [{ name: seriesName, url: seriesUrl(show.series) }] : []),
    { name: formatDate(show.date, { short: true }) },
  ];

  const body = html`<article class="show-page">
<header class="page-head">
${breadcrumbs(crumbs)}
<h1>${show.name}<span class="h1-sub">${formatDate(show.date)}</span></h1>
<p class="lede">${lede}${counts.length ? ` This archive has ${sentenceList(counts)} from it.` : ''}</p>
${note ? html`<p class="note">${note}</p>` : ''}
${show.watch ? html`<p class="watch"><a href="${show.watch.url}" rel="noopener">${show.watch.label ?? 'Where to watch'}</a></p>` : ''}
</header>
${order.length
    ? html`<section aria-labelledby="card-h"><h2 id="card-h" class="visually-hidden">Card</h2><ol class="card">${order.map((s) => segmentItem(s, site, numbered))}</ol></section>`
    : html`<p class="empty">No matches from this show are in the archive yet.</p>`}
${prev || next
    ? html`<nav class="pager" aria-label="${seriesName} episodes">${prev ? html`<a class="pager__prev" href="${showUrl(prev)}"><span>Previous</span>${prev.name === show.name ? formatDate(prev.date) : `${prev.name}, ${year(prev.date)}`}</a>` : ''}${next ? html`<a class="pager__next" href="${showUrl(next)}"><span>Next</span>${next.name === show.name ? formatDate(next.date) : `${next.name}, ${year(next.date)}`}</a>` : ''}</nav>`
    : ''}
<section class="section" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2>${sourcesList([...new Set([...show.sources, ...show.segments.flatMap((s) => s.sources)])])}</section>
</article>`;

  const names = matches.slice(-3).reverse().map((m) => m.title);
  const description = matches.length
    ? `${label} results from ${formatDate(show.date)}: ${names.join('; ')}${matches.length > names.length ? ` and ${plural(matches.length - names.length, 'more match', 'more matches')}` : ''}.`
    : `${label} on ${formatDate(show.date)}.`;
  return {
    meta: {
      title: `${label}, ${formatDate(show.date)}: results`,
      description: description.slice(0, 300),
      path: showUrl(show),
      nav: 'shows',
      breadcrumbs: crumbs.map((c) => ({ name: c.name, url: c.url ?? showUrl(show) })),
    },
    body,
  };
}
