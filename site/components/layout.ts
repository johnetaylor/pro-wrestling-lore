// Page shell: head metadata, header, footer and scripts.
import { html, jsonLd, toString, type Raw } from '../lib/html.ts';
import { formatDate } from '../lib/format.ts';

export interface BuildContext {
  siteUrl: string; // absolute origin, no trailing slash
  production: boolean;
  /** Hashed file names under /assets/. */
  assets: { css: string; js: Record<string, string>; searchIndex: string; preload: string[]; files: Record<string, string> };
  buildDate: string;
}

export interface PageMeta {
  title: string; // page-specific part; the site name is appended
  description: string;
  path: string; // absolute path beginning with /
  /** Which section tab is current. */
  nav?: 'careers' | 'wrestlers' | 'storylines' | 'shows' | 'titles' | 'dynasties' | 'home';
  /** An explorer page: full-width frame, and the app script. */
  app?: boolean;
  breadcrumbs?: { name: string; url: string }[];
  structuredData?: unknown[];
  noindex?: boolean;
  scripts?: string[];
}

const SITE = 'Pro Wrestling Lore';

// The section tabs, as on the v69 explorer. Careers is the timeline at the site root.
const NAV: { keys: PageMeta['nav'][]; label: string; url: string }[] = [
  { keys: ['careers', 'wrestlers', 'home'], label: 'Careers', url: '/' },
  { keys: ['storylines'], label: 'Storylines', url: '/storylines/' },
  { keys: ['shows'], label: 'Shows', url: '/shows/' },
  { keys: ['titles'], label: 'Championships', url: '/titles/' },
  { keys: ['dynasties'], label: 'Dynasties', url: '/families/' },
];

export function page(meta: PageMeta, body: Raw, ctx: BuildContext): string {
  const url = `${ctx.siteUrl}${meta.path}`;
  const fullTitle = meta.nav === 'home' ? `${SITE}: ${meta.title}` : `${meta.title} | ${SITE}`;
  const crumbs = meta.breadcrumbs?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: meta.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ctx.siteUrl}${c.url}` })),
      }
    : null;
  // Entities described on this page get the page's own URL.
  const ld = [...(meta.structuredData ?? []).map((d: any) => (d && d['@type'] === 'Person' && !d.url ? { ...d, url } : d)), ...(crumbs ? [crumbs] : [])];
  const hasStrip = toString(body).includes('class="strip');
  const scripts = [...new Set(['search', ...(hasStrip ? ['strip'] : []), ...(meta.app ? ['app'] : []), ...(meta.scripts ?? [])])];
  const frame = meta.app ? 'frame frame--wide' : 'frame';
  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${meta.description}">
<link rel="canonical" href="${url}">
${meta.noindex || !ctx.production ? html`<meta name="robots" content="noindex">` : ''}
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${meta.description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#080c11">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${ctx.assets.preload.map((f) => html`<link rel="preload" href="/assets/${f}" as="font" type="font/woff" crossorigin>`)}
<link rel="stylesheet" href="/assets/${ctx.assets.css}">
${meta.app ? html`<script>document.documentElement.classList.add('js')</script>` : ''}
<meta name="search-index" content="/assets/${ctx.assets.searchIndex}">
${ld.map((d) => jsonLd(d))}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="${frame} site-header__row">
    <a class="brand" href="/"><img src="/assets/${ctx.assets.files['wordmark-360.webp']}" srcset="/assets/${ctx.assets.files['wordmark-360.webp']} 1x, /assets/${ctx.assets.files['wordmark-720.webp']} 2x" width="131" height="46" alt="Pro Wrestling Lore"></a>
    <form class="search" role="search" action="/search/" data-search>
      <label class="visually-hidden" for="site-search">Search wrestlers, shows and championships</label>
      <input id="site-search" name="q" type="search" placeholder="Search wrestlers, shows, titles" autocomplete="off" aria-autocomplete="list" aria-controls="site-search-results" aria-expanded="false">
      <ul class="search__results" id="site-search-results" role="listbox" hidden></ul>
    </form>
  </div>
  <nav class="${frame} site-nav" aria-label="Sections">${NAV.map((n) => html`<a href="${n.url}"${n.keys.includes(meta.nav) ? html` aria-current="page"` : ''}>${n.label}</a>`)}</nav>
</header>
<main id="main" class="${frame}">
${body}
</main>
<footer class="site-footer">
  <div class="${frame}">
    <nav class="footer-nav" aria-label="More"><a href="/">Careers</a> <a href="/wrestlers/">Wrestlers A to Z</a> <a href="/storylines/">Storylines</a> <a href="/shows/">Shows</a> <a href="/titles/">Championships</a> <a href="/families/">Dynasties</a></nav>
    <p>Pro Wrestling Lore indexes televised matches and segments only, never dark matches or house shows. Every record links to its source, and counts are records in this archive rather than complete career totals.</p>
    <p>Updated ${formatDate(ctx.buildDate)}. Set in Barlow, under the SIL Open Font License.</p>
  </div>
</footer>
${scripts.map((s) => html`<script src="/assets/${ctx.assets.js[s]}" defer></script>`)}
</body>
</html>
`;
  return toString(doc);
}
