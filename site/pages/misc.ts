// Storylines, families, search and the not-found page.
import type { Family, Storyline } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { formatDate, plural, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { familyUrl, personUrl, segmentUrl, showUrl, storylineUrl } from '../lib/urls.ts';
import { breadcrumbs, peopleLinks, promoColor, sourceLabel } from '../components/bits.ts';
import type { PageMeta } from '../components/layout.ts';

export function storylinePage(story: Storyline, site: SiteData): { meta: PageMeta; body: Raw } {
  const chapters = [...story.chapters].sort((a, b) => a.date.localeCompare(b.date));
  const promo = site.promotions.get(story.promotion);
  const span = yearSpan(chapters[0]?.date, chapters.at(-1)?.date);
  const cast = (story.people ?? []).filter((p) => site.people.has(p));
  const body = html`<article>
<header class="page-head">
${breadcrumbs([{ name: 'Storylines', url: '/storylines/' }, { name: story.title }])}
<h1>${story.title}</h1>
<p class="lede">${story.summary ?? ''}</p>
<p class="facts"><span class="promo-tag" style="--c:${promoColor(story.promotion)}">${promo?.name ?? story.promotion}</span> ${plural(chapters.length, 'chapter')}${span ? `, ${span}` : ''}.${cast.length ? html` Featuring ${peopleLinks(cast, site.people)}.` : ''}</p>
</header>
<ol class="chapters">${chapters.map((c) => {
    const link = c.segment ? segmentUrl(c.segment) : c.showId && site.shows.has(c.showId) ? showUrl(c.showId) : undefined;
    return html`<li id="${c.id}"><time datetime="${c.date}">${formatDate(c.date, { short: true })}</time><div><h2 class="chapter__title">${c.title}</h2><p class="quiet">${link ? html`<a href="${link}">${c.show ?? 'Show'}</a>` : c.show ?? ''}</p>${c.result ? html`<p>${c.result}</p>` : ''}${c.context ? html`<p class="muted">${c.context}</p>` : ''}${c.sources.length ? html`<p class="cell-note">${c.sources.map((u, i) => html`${i ? ', ' : ''}<a href="${u}" rel="noopener">${sourceLabel(u).split('/')[0]}</a>`)}</p>` : ''}</div></li>`;
  })}</ol>
</article>`;
  return {
    meta: {
      nav: 'storylines',
      title: `${story.title}: the storyline, chapter by chapter`,
      description: (story.summary ?? `${story.title}, a ${promo?.name ?? ''} storyline told across ${plural(chapters.length, 'chapter')}.`).slice(0, 300),
      path: storylineUrl(story.id),
      breadcrumbs: [
        { name: 'Storylines', url: '/storylines/' },
        { name: story.title, url: storylineUrl(story.id) },
      ],
    },
    body,
  };
}

export function storylinesIndex(site: SiteData): { meta: PageMeta; body: Raw } {
  const byPromo = new Map<string, Storyline[]>();
  for (const s of site.storylines.values()) {
    if (!byPromo.has(s.promotion)) byPromo.set(s.promotion, []);
    byPromo.get(s.promotion)!.push(s);
  }
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Storylines' }])}
<h1>Storylines</h1>
<p class="lede">${plural(site.storylines.size, 'storyline')}, each told through the matches and segments that moved it along.</p>
</header>
${[...byPromo].sort((a, b) => b[1].length - a[1].length).map(([p, list]) => html`<section class="section"><h2 class="promo-head" style="--c:${promoColor(p)}">${site.promotions.get(p)?.name ?? p}</h2><ul class="link-list link-list--cols">${list
    .map((s) => ({ s, dates: s.chapters.map((c) => c.date).sort() }))
    .sort((a, b) => (b.dates.at(-1) ?? '').localeCompare(a.dates.at(-1) ?? ''))
    .map(({ s, dates }) => html`<li><a href="${storylineUrl(s.id)}">${s.title}</a><span class="quiet">${yearSpan(dates[0], dates.at(-1))}</span></li>`)}</ul></section>`)}`;
  return {
    meta: { nav: 'storylines', title: 'Storylines', description: `${plural(site.storylines.size, 'wrestling storyline')}, chapter by chapter, linked to the matches and promos that told them.`, path: '/storylines/', breadcrumbs: [{ name: 'Storylines', url: '/storylines/' }] },
    body,
  };
}

export function familyPage(fam: Family, site: SiteData): { meta: PageMeta; body: Raw } {
  const byId = new Map(fam.members.map((m) => [m.id, m]));
  const memberLink = (id: string) => {
    const m = byId.get(id);
    if (!m) return html`${id}`;
    return m.person && site.people.has(m.person) ? html`<a href="${personUrl(m.person)}">${m.name}</a>` : html`${m.name}`;
  };
  const RELATION: Record<string, string> = {
    parent: 'a parent of',
    marriage: 'married to',
    adoption: 'the adoptive parent of',
    honorary: 'honorary family to',
    sibling: 'a sibling of',
    cousin: 'a cousin of',
    uncle: 'an uncle of',
    inlaw: 'an in-law of',
    grandparent: 'a grandparent of',
  };
  const relation = (type: string) => RELATION[type] ?? `related to (${type})`;
  const name = fam.name.replace(/ · /g, ', ');
  const body = html`<article>
<header class="page-head">
${breadcrumbs([{ name: 'Families', url: '/families/' }, { name }])}
<h1>${name}</h1>
${fam.description ? html`<p class="lede">${fam.description}</p>` : ''}
</header>
${fam.branches.map((b) => {
    const members = fam.members.filter((m) => m.branch === b.id);
    return html`<section class="section"><h2>${b.name.replace(/ · /g, ', ')}</h2>${b.note ? html`<p class="section-note">${b.note}</p>` : ''}<ul class="link-list link-list--cols">${members.map((m) => html`<li>${memberLink(m.id)}${m.note ? html`<span class="quiet">${m.note}</span>` : ''}</li>`)}</ul></section>`;
  })}
<section class="section"><h2>Relationships</h2><ul class="plain-list">${fam.links.map((l) => html`<li>${memberLink(l.a)} is ${l.label ?? relation(l.type)} ${memberLink(l.b)}</li>`)}</ul></section>
<section class="section"><h2>Sources</h2><ol class="sources">${Object.values(fam.sources).map((s) => html`<li><a href="${s.url}" rel="noopener">${s.label}</a></li>`)}</ol></section>
</article>`;
  return {
    meta: {
      nav: 'dynasties',
      title: `The ${name} wrestling family`,
      description: (fam.description ?? `The ${name} wrestling family: ${plural(fam.members.length, 'member')} and how they are related.`).slice(0, 300),
      path: familyUrl(fam.id),
      breadcrumbs: [
        { name: 'Families', url: '/families/' },
        { name, url: familyUrl(fam.id) },
      ],
    },
    body,
  };
}

export function familiesIndex(site: SiteData): { meta: PageMeta; body: Raw } {
  const list = [...site.families.values()].sort((a, b) => a.name.localeCompare(b.name));
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Families' }])}
<h1>Wrestling families</h1>
<p class="lede">${plural(list.length, 'family', 'families')}, with each member linked to their career where we have one.</p>
</header>
<ul class="link-list link-list--cols">${list.map((f) => html`<li><a href="${familyUrl(f.id)}">${f.name.replace(/ · /g, ', ')}</a><span class="quiet">${plural(f.members.length, 'member')}</span></li>`)}</ul>`;
  return { meta: { nav: 'dynasties', title: 'Wrestling families', description: `${plural(list.length, 'wrestling family', 'wrestling families')} and how their members are related.`, path: '/families/', breadcrumbs: [{ name: 'Families', url: '/families/' }] }, body };
}

export function searchPage(): { meta: PageMeta; body: Raw } {
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Search' }])}
<h1>Search</h1>
<form class="search search--large search--page" role="search" action="/search/">
<label class="visually-hidden" for="page-search">Search wrestlers, shows and championships</label>
<input id="page-search" name="q" type="search" placeholder="Search wrestlers, shows and championships" autocomplete="off">
</form>
</header>
<div id="search-page-results" aria-live="polite"></div>
<noscript><p class="note">Search needs JavaScript. Browse <a href="/wrestlers/">wrestlers</a>, <a href="/shows/">shows</a> or <a href="/titles/">championships</a> instead.</p></noscript>`;
  return { meta: { title: 'Search', description: 'Search wrestlers, shows and championships.', path: '/search/', noindex: true }, body };
}

export function notFoundPage(): { meta: PageMeta; body: Raw } {
  const body = html`<header class="page-head">
<h1>Page not found</h1>
<p class="lede">There's no page at this address. It may have moved when the archive was rebuilt.</p>
<p>Search above, or browse <a href="/wrestlers/">wrestlers</a>, <a href="/shows/">shows</a> or <a href="/titles/">championships</a>.</p>
</header>`;
  return { meta: { title: 'Page not found', description: 'This page does not exist.', path: '/404.html', noindex: true }, body };
}
