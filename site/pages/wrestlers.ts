// Wrestlers A–Z.
import type { Person } from '../../scripts/lib/types.ts';
import { html, type Raw } from '../lib/html.ts';
import { num, plural, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl } from '../lib/urls.ts';
import { breadcrumbs } from '../components/bits.ts';
import type { PageMeta } from '../components/layout.ts';

/** Sort key: "The Rock" files under R. Accents are ignored. */
export function sortName(name: string): string {
  return name
    .replace(/^(the|el|la)\s+/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function letterOf(name: string): string {
  const c = sortName(name).replace(/^[^a-z0-9]+/, '')[0] ?? '#';
  return /[a-z]/.test(c) ? c.toUpperCase() : '#';
}

export function wrestlersIndex(site: SiteData): { meta: PageMeta; body: Raw } {
  const people = [...site.people.values()].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name), 'en'));
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    const l = letterOf(p.name);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(p);
  }
  const letters = [...groups.keys()].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  const item = (p: Person) => {
    const apps = site.appearances.get(p.id) ?? [];
    const matches = apps.filter((a) => a.seg.type === 'match' && a.role === 'competitor').length;
    const span = apps.length ? yearSpan(apps[0].show.date, apps.at(-1)!.show.date) : '';
    return html`<li><a href="${personUrl(p.id)}">${p.name}</a><span class="quiet">${span}${matches ? `, ${num(matches)}` : ''}</span></li>`;
  };
  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Wrestlers' }])}
<h1>Wrestlers</h1>
<p class="lede">${plural(site.people.size, 'wrestler')}, managers and other personalities, each with their televised career on one timeline. Years show the span of their matches here, followed by the number of matches.</p>
<nav class="letter-jump" aria-label="Jump to a letter">${letters.map((l) => html`<a href="#letter-${l === '#' ? 'other' : l}">${l}</a>`)}</nav>
</header>
${letters.map((l) => html`<section aria-labelledby="letter-${l === '#' ? 'other' : l}"><h2 class="letter" id="letter-${l === '#' ? 'other' : l}">${l}</h2><ul class="link-list link-list--cols">${groups.get(l)!.map(item)}</ul></section>`)}`;
  return {
    meta: {
      title: 'Wrestlers A to Z: careers, matches and championships',
      description: `Career timelines for ${plural(site.people.size, 'wrestler')}, from Hulk Hogan to Cody Rhodes: every televised match, title reign and promotion run in the archive.`,
      path: '/wrestlers/',
      nav: 'wrestlers',
      breadcrumbs: [{ name: 'Wrestlers', url: '/wrestlers/' }],
    },
    body,
  };
}
