// Home: the career strip as the first thing anyone sees, then ways in.
import type { Show } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { formatDate, isPle, num, plural, year } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl, showUrl } from '../lib/urls.ts';
import { showLabel } from '../components/bits.ts';
import { careerStrip } from '../components/careerStrip.ts';
import { archiveChart } from '../components/timelines.ts';
import type { PageMeta } from '../components/layout.ts';
import { personStats } from './person.ts';

/** Featured careers rotate by day of year, so a daily build changes the home page. */
const FEATURED = ['hulk-hogan', 'cody-rhodes'];

function mainEvent(show: Show): string {
  const matches = show.segments.filter((s) => s.type === 'match').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return matches.at(-1)?.title ?? '';
}

export function homePage(site: SiteData, buildDate: string, siteUrl: string): { meta: PageMeta; body: Raw } {
  const dayOfYear = Math.floor((Date.parse(buildDate) - Date.parse(`${buildDate.slice(0, 4)}-01-01`)) / 86400000);
  const featuredId = FEATURED.filter((id) => site.people.has(id))[dayOfYear % FEATURED.length];
  const featured = site.people.get(featuredId)!;
  const fStats = personStats(featured, site);
  const signature = new Set((featured.curated?.signatureMatches ?? []).map((m) => m.segment).filter((x): x is string => !!x));
  const strip = careerStrip(featured, site, { signature, today: buildDate });

  const md = buildDate.slice(5);
  const onThisDay = [...site.shows.values()]
    .filter((s) => s.date.slice(5) === md && s.date < buildDate && s.segments.some((g) => g.type === 'match'))
    .sort((a, b) => Number(isPle(b, site.series.get(b.series)?.kind)) - Number(isPle(a, site.series.get(a.series)?.kind)) || a.date.localeCompare(b.date))
    .slice(0, 8)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = [...site.shows.values()]
    .filter((s) => s.date <= buildDate && s.segments.length)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 8);
  const busiest = [...site.people.values()]
    .map((p) => ({ p, n: (site.appearances.get(p.id) ?? []).filter((a) => a.seg.type === 'match' && a.role === 'competitor').length }))
    .sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name))
    .slice(0, 10);
  const matchTotal = [...site.shows.values()].reduce((a, s) => a + s.segments.filter((g) => g.type === 'match').length, 0);

  const showItem = (s: Show, withYear: boolean) =>
    html`<li><a href="${showUrl(s)}">${showLabel(s, site)}</a><span class="quiet">${withYear ? year(s.date) : formatDate(s.date, { short: true })}</span>${mainEvent(s) ? html`<p>${mainEvent(s)}</p>` : ''}</li>`;

  const body = html`<section class="home-hero" aria-labelledby="home-h">
<h1 id="home-h">See a whole career at once.</h1>
<p class="lede">Pro Wrestling Lore puts every televised match, title reign and promotion run onto one timeline for each wrestler. Search for anyone, or start with ${featured.name}.</p>
<form class="search search--large" role="search" action="/search/" data-search>
<label class="visually-hidden" for="home-search">Search wrestlers, shows and championships</label>
<input id="home-search" name="q" type="search" placeholder="Try Bret Hart or WrestleMania" autocomplete="off" aria-autocomplete="list" aria-controls="home-search-results" aria-expanded="false">
<ul class="search__results" id="home-search-results" role="listbox" hidden></ul>
</form>
</section>
<section class="featured" aria-labelledby="featured-h">
<h2 id="featured-h" class="featured__name"><a href="${personUrl(featured.id)}">${featured.name}</a></h2>
<p class="featured__facts">${plural(fStats.matches.length, 'televised match', 'televised matches')}, ${plural(fStats.segments.length, 'promo or appearance', 'promos and appearances')} and ${plural((site.reignsByPerson.get(featured.id) ?? []).length, 'title reign')}. Select any dot to open that match.</p>
${strip ?? ''}
</section>
<div class="columns columns--home">
${onThisDay.length ? html`<section class="section" aria-labelledby="otd-h"><h2 id="otd-h">On ${formatDate(buildDate, { noYear: true })}</h2><ul class="entries entries--shows">${onThisDay.map((s) => showItem(s, true))}</ul></section>` : ''}
<section class="section" aria-labelledby="latest-h"><h2 id="latest-h">Latest shows</h2><ul class="entries entries--shows">${latest.map((s) => showItem(s, false))}</ul><p class="more"><a href="/shows/">All shows</a></p></section>
</div>
<section class="section" aria-labelledby="archive-h">
<h2 id="archive-h">What the archive covers</h2>
<p class="section-note">${plural(site.shows.size, 'show')}, ${num(matchTotal)} matches and ${plural(site.people.size, 'wrestler')} so far. Each lane is a promotion; dense stretches are fully indexed weekly television, thin ones are still being added.</p>
${archiveChart(site)}
</section>
<section class="section" aria-labelledby="most-h">
<h2 id="most-h">Most matches in the archive</h2>
<ol class="rank-list">${busiest.map(({ p, n }) => html`<li><a href="${personUrl(p.id)}">${p.name}</a><span class="quiet">${num(n)}</span></li>`)}</ol>
<p class="more"><a href="/wrestlers/">All wrestlers</a></p>
</section>`;

  return {
    meta: {
      title: 'every televised match, title reign and career on a timeline',
      description: `A visual history of pro wrestling: career timelines for ${plural(site.people.size, 'wrestler')}, results from ${plural(site.shows.size, 'televised show')} and title histories for ${plural(site.titles.size, 'championship')}.`,
      path: '/',
      nav: 'home',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Pro Wrestling Lore',
          url: `${siteUrl}/`,
          potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        },
      ],
      scripts: strip ? ['strip'] : [],
    },
    body,
  };
}
