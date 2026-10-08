// Builds the static site from data/ into dist/. Standard library only.
//
//   node site/build.ts                          local build, noindex, http://localhost:4321
//   SITE_URL=https://example.org node site/build.ts --production
//
// Options: --out <dir>, --site-url <origin>, --production, --date <YYYY-MM-DD> (fixes "today").
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { emptyDir, sha256 } from '../scripts/lib/util.ts';
import { loadSite } from './lib/load.ts';
import { formatDate, isPle, yearSpan } from './lib/format.ts';
import { personUrl, promotionUrl, seriesUrl, showUrl, storylineUrl, titleUrl } from './lib/urls.ts';
import { page, type BuildContext, type PageMeta } from './components/layout.ts';
import { promotionNameAt } from './components/bits.ts';
import type { Raw } from './lib/html.ts';
import { homePage } from './pages/home.ts';
import { personPage } from './pages/person.ts';
import { showPage } from './pages/show.ts';
import { promotionPage, seriesPages, showsIndex, LANE_ORDER } from './pages/shows.ts';
import { titlePage, titlesIndex, titlePromotion } from './pages/titles.ts';
import { wrestlersIndex } from './pages/wrestlers.ts';
import { familiesIndex, familyPage, notFoundPage, searchPage, storylinePage, storylinesIndex } from './pages/misc.ts';
import { appShell } from './components/appShell.ts';
import { calendarPage } from './pages/calendar.ts';
import { coveragePage } from './pages/about.ts';
import { writeAppData } from './appData.ts';
import { bundle } from './bundle.ts';

const ROOT = join(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');

const { values: opts } = parseArgs({
  options: {
    out: { type: 'string', default: 'dist' },
    'site-url': { type: 'string' },
    production: { type: 'boolean', default: false },
    date: { type: 'string' },
  },
});
const production = opts.production || process.env.PRODUCTION === '1';
const siteUrl = (opts['site-url'] ?? process.env.SITE_URL ?? 'http://localhost:4321').replace(/\/$/, '');
if (production && !(opts['site-url'] ?? process.env.SITE_URL)) throw new Error('A production build needs SITE_URL or --site-url.');
const buildDate = opts.date ?? process.env.BUILD_DATE ?? new Date().toISOString().slice(0, 10);
const OUT = join(ROOT, opts.out!);
const started = Date.now();

// ---------- Assets ----------

emptyDir(OUT);
mkdirSync(join(OUT, 'assets', 'fonts'), { recursive: true });
const hashed = (name: string, content: Buffer | string) => {
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)}.${sha256(typeof content === 'string' ? content : content.toString('base64')).slice(0, 10)}${name.slice(dot)}`;
};
const files: Record<string, string> = {};
function emit(name: string, content: Buffer | string): string {
  const out = hashed(name, content);
  mkdirSync(dirname(join(OUT, 'assets', out)), { recursive: true });
  writeFileSync(join(OUT, 'assets', out), content);
  files[name] = out;
  return out;
}

const FONTS: [string, string, number, string][] = [
  ['Barlow-Regular', 'Barlow', 400, 'normal'],
  ['Barlow-Italic', 'Barlow', 400, 'italic'],
  ['Barlow-Medium', 'Barlow', 500, 'normal'],
  ['Barlow-SemiBold', 'Barlow', 600, 'normal'],
  ['BarlowCondensed-Medium', 'Barlow Condensed', 500, 'normal'],
  ['BarlowCondensed-SemiBold', 'Barlow Condensed', 600, 'normal'],
  ['BarlowCondensed-Bold', 'Barlow Condensed', 700, 'normal'],
];
let fontCss = '';
for (const [file, family, weight, style] of FONTS) {
  const out = emit(`fonts/${file}.woff`, readFileSync(join(SITE, 'assets', 'fonts', `${file}.woff`)));
  fontCss += `@font-face{font-family:'${family}';src:url(/assets/${out}) format('woff');font-weight:${weight};font-style:${style};font-display:swap}\n`;
}
copyFileSync(join(SITE, 'assets', 'fonts', 'OFL.txt'), join(OUT, 'assets', 'fonts', 'OFL.txt'));
for (const img of ['wordmark-360.webp', 'wordmark-720.webp']) emit(img, readFileSync(join(SITE, 'assets', img)));
copyFileSync(join(SITE, 'assets', 'favicon.svg'), join(OUT, 'favicon.svg'));

const minifyCss = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
const cssSource = ['tokens.css', 'base.css', 'components.css', 'pages.css', 'app.css']
  .map((f) => readFileSync(join(SITE, 'styles', f), 'utf8'))
  .join('\n')
  .replace(/url\(\/assets\/([^)]+)\)/g, (m, name) => (files[name] ? `url(/assets/${files[name]})` : m));
const css = emit('site.css', fontCss + minifyCss(cssSource));

const js: Record<string, string> = {};
for (const f of readdirSync(join(SITE, 'client')).filter((f) => f.endsWith('.ts'))) {
  const code = stripTypeScriptTypes(readFileSync(join(SITE, 'client', f), 'utf8'), { mode: 'strip' });
  js[basename(f, '.ts')] = emit(`${basename(f, '.ts')}.js`, code);
}
// The explorer: one script built from site/app.
js.app = emit('app.js', bundle(join(SITE, 'app', 'main.ts'), ROOT).code);

// ---------- Data ----------

const site = loadSite(join(ROOT, 'data'));
const loaded = Date.now();
const appData = writeAppData(site, OUT, buildDate);
const dataDir = `/${appData.dir}/`;

// Other ways people type the same thing: "WrestleMania 3" for III, "Starrcade 97", "US title".
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20, XXI: 21, XXII: 22, XXIII: 23, XXIV: 24, XXV: 25, XXVI: 26, XXVII: 27, XXVIII: 28, XXIX: 29, XXX: 30, X8: 18, X7: 17 };
function eventAliases(name: string, date: string): string[] {
  const out = new Set<string>();
  const roman = name.replace(/\b([IVX]+\d?|X\d)\b/g, (m) => (ROMAN[m] ? String(ROMAN[m]) : m));
  if (roman !== name) out.add(roman);
  const base = name.replace(/\s+\d{4}$/, '');
  out.add(`${base} ${date.slice(2, 4)}`);
  out.add(`${base} '${date.slice(2, 4)}`);
  out.add(`${base} ${date.slice(0, 4)}`);
  return [...out].filter((a) => a !== name);
}
function titleAliases(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const variants = [n, n.replace(/Championship/, 'Title'), n.replace(/ Championship$/, '')];
    for (const v of variants) {
      out.add(v);
      out.add(v.replace(/United States/, 'US').replace(/Intercontinental/, 'IC').replace(/World Heavyweight/, 'World'));
    }
  }
  return [...out].filter((a) => !names.includes(a));
}

// Search index: [kind, name, url, detail, weight, aliases].
type Entry = [string, string, string, string, number, string?];
const entries: Entry[] = [];
for (const p of site.people.values()) {
  const apps = site.appearances.get(p.id) ?? [];
  const matches = apps.filter((a) => a.seg.type === 'match' && a.role === 'competitor').length;
  const aliases = p.ringNames.map((r) => r.name).filter((n) => n !== p.name);
  entries.push(['w', p.name, personUrl(p.id), apps.length ? yearSpan(apps[0].show.date, apps.at(-1)!.show.date) : '', matches + apps.length * 0.2, aliases.join('|') || undefined]);
}
for (const pr of site.promotions.values()) {
  const count = [...site.series.values()].filter((s) => s.promotion === pr.id).reduce((a, s) => a + (site.showsBySeries.get(s.id)?.length ?? 0), 0);
  if (count) entries.push(['p', pr.name, promotionUrl(pr.id), pr.fullName ?? '', count, [pr.fullName, ...(pr.aliases ?? [])].filter(Boolean).join('|') || undefined]);
}
for (const s of site.series.values()) {
  const shows = site.showsBySeries.get(s.id) ?? [];
  if (!shows.length) continue;
  const promo = promotionNameAt(s.promotion, shows.at(-1)!.date, site.promotions.get(s.promotion)?.name ?? s.promotion);
  entries.push(['s', s.name, seriesUrl(s.id), `${promo}, ${yearSpan(shows[0].date, shows.at(-1)!.date)}`, shows.length * 2]);
  if (s.kind !== 'weekly')
    for (const sh of shows) {
      if (!isPle(sh, s.kind) && s.kind !== 'event') continue;
      const era = promotionNameAt(sh.promotion, sh.date, site.promotions.get(sh.promotion)?.name ?? sh.promotion);
      const name = sh.name === s.name ? `${sh.name} ${sh.date.slice(0, 4)}` : sh.name;
      entries.push(['e', name, showUrl(sh), `${era}, ${formatDate(sh.date, { short: true })}`, sh.segments.length, eventAliases(name, sh.date).join('|')]);
    }
}
for (const t of site.titles.values()) {
  const promo = titlePromotion(t);
  const titleNames = [t.name, ...(t.names ?? []).filter((n) => n !== t.name)];
  entries.push(['t', t.name, titleUrl(t.id), promo ? site.promotions.get(promo)?.name ?? '' : '', t.reigns.length * 3 + (t.featured ? 200 : 0), [...titleNames.slice(1), ...titleAliases(titleNames)].join('|') || undefined]);
}
for (const s of site.storylines.values()) {
  const dates = s.chapters.map((c) => c.date).sort();
  entries.push(['y', s.title, storylineUrl(s.id), `${site.promotions.get(s.promotion)?.name ?? s.promotion}, ${yearSpan(dates[0], dates.at(-1))}`, s.chapters.length]);
}
const searchIndex = emit('search.json', JSON.stringify({ v: 1, items: entries.map((e) => (e[5] === undefined ? e.slice(0, 5) : e)) }));

const ctx: BuildContext = {
  siteUrl,
  production,
  buildDate,
  assets: { css, js, searchIndex, preload: [files['fonts/Barlow-Regular.woff'], files['fonts/BarlowCondensed-Bold.woff']], files },
};

// ---------- Pages ----------

const sitemap = new Map<string, string[]>();
let pages = 0;
function write(rendered: { meta: PageMeta; body: Raw }, section = 'other') {
  const { meta, body } = rendered;
  const file = meta.path.endsWith('.html') ? join(OUT, meta.path) : join(OUT, meta.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(meta, body, ctx));
  pages++;
  if (!meta.noindex) {
    if (!sitemap.has(section)) sitemap.set(section, []);
    sitemap.get(section)!.push(meta.path);
  }
}

// Explorer pages: the app, with the static page inside it for readers and crawlers without scripts.
const home = homePage(site, buildDate, siteUrl);
const homeTitle = `Pro Wrestling Lore: ${home.meta.title}`;
const explorer = (r: { meta: PageMeta; body: Raw }) => ({ meta: { ...r.meta, app: true }, body: appShell({ path: r.meta.path, data: dataDir, homeTitle, fallback: r.body }) });
write(explorer(home), 'other');
write(wrestlersIndex(site), 'wrestlers');
for (const p of site.people.values()) {
  write(explorer(personPage(p, site, buildDate)), 'wrestlers');
}
write(explorer(showsIndex(site)), 'shows');
for (const p of LANE_ORDER) if (site.promotions.has(p) && [...site.series.values()].some((s) => s.promotion === p && site.showsBySeries.get(s.id)?.length)) write(explorer(promotionPage(p, site)), 'shows');
for (const s of site.series.values()) if (site.showsBySeries.get(s.id)?.length) for (const r of seriesPages(s, site)) write(explorer(r), 'shows');
for (const s of site.shows.values()) write(explorer(showPage(s, site)), 'shows');
write(explorer(titlesIndex(site, buildDate)), 'titles');
for (const t of site.titles.values()) write(explorer(titlePage(t, site, buildDate)), 'titles');
write(explorer(storylinesIndex(site)), 'other');
for (const s of site.storylines.values()) write(explorer(storylinePage(s, site)), 'other');
write(explorer(calendarPage(site)), 'other');
write(explorer(familiesIndex(site)), 'other');
for (const f of site.families.values()) write(explorer(familyPage(f, site)), 'other');
write(coveragePage(site, buildDate), 'other');
write(searchPage());
write(notFoundPage());

// ---------- Crawling ----------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
if (production) {
  const index: string[] = [];
  for (const [section, paths] of sitemap) {
    for (let i = 0; i < paths.length; i += 45000) {
      const name = `sitemap-${section}${i ? `-${i / 45000 + 1}` : ''}.xml`;
      const urls = paths.slice(i, i + 45000).map((p) => `<url><loc>${xml(siteUrl + p)}</loc></url>`);
      writeFileSync(join(OUT, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
      index.push(`<sitemap><loc>${xml(`${siteUrl}/${name}`)}</loc></sitemap>`);
    }
  }
  writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.join('\n')}\n</sitemapindex>\n`);
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
} else {
  writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
}
// Cache headers for hosts that read a _headers file (Cloudflare Pages, Netlify).
writeFileSync(join(OUT, '_headers'), '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/data/*\n  Cache-Control: public, max-age=31536000, immutable\n');

const indexed = [...sitemap.values()].reduce((a, l) => a + l.length, 0);
console.log(
  `Built ${pages.toLocaleString('en-US')} pages (${indexed.toLocaleString('en-US')} indexable) and ${appData.files} explorer data files into ${opts.out} in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
    `(data ${((loaded - started) / 1000).toFixed(1)}s). ${production ? `Production build for ${siteUrl}.` : 'Preview build: robots blocked, every page noindex.'}`,
);
