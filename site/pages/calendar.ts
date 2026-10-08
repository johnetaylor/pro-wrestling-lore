// The year's calendar as a plain page: every major event by month, with its venue and sources.
import { html, type Raw } from '../lib/html.ts';
import { formatDate, plural } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { showUrl } from '../lib/urls.ts';
import { breadcrumbs } from '../components/bits.ts';
import type { PageMeta } from '../components/layout.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const tidy = (s: string) => s.replace(/\s+·\s+/g, ', ');

export function calendarPage(site: SiteData): { meta: PageMeta; body: Raw } {
  const c = site.calendar;
  const promos = new Map<string, any>(c.promotions.map((p: any) => [p.id, p]));
  const events = [...c.events].sort((a: any, b: any) => a.date.localeCompare(b.date));
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Calendar' }])}
<h1>The ${c.year} wrestling calendar</h1>
<p class="lede">${plural(events.length, 'major event')} from ${plural(c.promotions.length, 'promotion and brand', 'promotions and brands')}, with venues, dates and where to watch. Checked ${formatDate(c.checked)}.</p>
</header>
${MONTHS.map((m, i) => {
  const list = events.filter((e: any) => Number(e.date.slice(5, 7)) === i + 1);
  if (!list.length) return '';
  return html`<section class="section"><h2>${m}</h2><ul class="entries">${list.map((e: any) => {
    const show = e.show && site.shows.has(e.show) ? e.show : null;
    return html`<li><strong class="entry-name">${show ? html`<a href="${showUrl(show)}">${tidy(e.name)}</a>` : tidy(e.name)}</strong> <span class="quiet">${promos.get(e.promotion)?.name ?? e.promotion}, ${formatDate(e.date)}${e.end ? ` to ${formatDate(e.end)}` : ''}</span>${e.venue || e.city ? html`<p>${[e.venue, e.city].filter(Boolean).join(', ')}</p>` : ''}<p class="cell-note"><a href="${e.source}" rel="noopener">Source</a>${e.watch ? html`, <a href="${e.watch}" rel="noopener">${e.watchLabel ?? 'Where to watch'}</a>` : ''}</p></li>`;
  })}</ul></section>`;
})}`;
  return {
    meta: {
      nav: 'calendar',
      title: `${c.year} wrestling calendar: pay-per-views, premium live events and weekly shows`,
      description: `Every major wrestling event of ${c.year} by week and promotion, from WWE and AEW to NJPW, TNA, AAA and more, with venues and where to watch.`,
      path: '/calendar/',
      breadcrumbs: [{ name: 'Calendar', url: '/calendar/' }],
    },
    body,
  };
}
