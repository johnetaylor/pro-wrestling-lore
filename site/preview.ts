// Packs a hand-picked set of built pages into a self-contained folder that works from any
// base path, for design reviews hosted somewhere other than the site's own domain.
//
//   node site/preview.ts --out <dir> [--from dist] /wrestlers/hulk-hogan/ /shows/wwe/raw/1997-03-10/ ...
//
// Root-absolute links become relative ones, each page gets a <base> pointing at the preview
// root, and links to pages that aren't included lead to a short notice instead of a 404.
// The first page listed is the landing page; index.html at the root is written without its
// document wrapper (head, body), for hosts that supply their own.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    from: { type: 'string', default: 'dist' },
    'keep-wrapper': { type: 'boolean', default: false },
    title: { type: 'string' },
    // Pages to point reviewers at, as "path=Label" (repeatable).
    start: { type: 'string', multiple: true, default: [] },
  },
});
const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, opts.from!);
const OUT = opts.out!;
if (!OUT) throw new Error('--out is required');
const pages = positionals.map((p) => (p.endsWith('/') ? p : `${p}/`));
const included = new Set(pages);
const MISSING = 'not-in-preview.html';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fileFor = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}index.html`);
const depth = (path: string) => (path === '/' ? 0 : path.slice(1, -1).split('/').length);

/** A root-absolute URL as a path from the preview root. */
function rewriteUrl(url: string, own: string): string {
  if (url.startsWith('#')) return `${fileFor(own)}${url}`;
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const [path, fragment] = url.split('#');
  if (path.startsWith('/assets/') || path.startsWith('/data/') || path === '/favicon.svg') return path.slice(1);
  const clean = path.split('?')[0];
  if (!included.has(clean)) return MISSING;
  return `${fileFor(clean)}${fragment ? `#${fragment}` : ''}`;
}

const starts = opts.start!.map((x) => {
  const [path, label] = x.split('=');
  return { path: path.endsWith('/') ? path : `${path}/`, label };
});
const banner = () => {
  const links = starts.map((x) => `<a href="${fileFor(x.path)}">${x.label}</a>`);
  const list = links.length > 1 ? `${links.slice(0, -1).join(', ')} and ${links.at(-1)}` : links.join('');
  return `<div class="preview-bar" style="background:var(--ink-2);color:var(--text-2);font-size:0.8rem;padding:8px 16px;text-align:center;border-bottom:1px solid var(--rule)">Design preview with ${included.size} of the site's pages${list ? `. Start with ${list}` : ''}. Links to pages left out open a short notice.</div>`;
};

for (const path of pages) {
  const src = join(DIST, fileFor(path));
  if (!existsSync(src)) throw new Error(`Not built: ${path}`);
  let doc = readFileSync(src, 'utf8');
  doc = doc.replace(/\s(href|src|data-href|data-data|content)="([^"]*)"/g, (m, attr, url) => (attr === 'content' && !url.startsWith('/') ? m : ` ${attr}="${rewriteUrl(url, path)}"`));
  doc = doc.replace(/(srcset=")([^"]*)(")/g, (m, a, list, b) => a + list.replace(/\/assets\//g, 'assets/') + b);
  const base = depth(path) ? '../'.repeat(depth(path)) : '';
  doc = doc.replace('<head>\n', `<head>\n${base ? `<base href="${base}">\n` : ''}`);
  doc = doc.replace('<body>\n', `<body>\n${banner()}\n`);
  const out = join(OUT, fileFor(path));
  mkdirSync(dirname(out), { recursive: true });
  if (path === pages[0] && !opts['keep-wrapper']) {
    // The host wraps the landing page in its own document: keep the title, styles, meta and
    // body content, and drop the outer tags.
    const head = /<head>([\s\S]*?)<\/head>/.exec(doc)![1];
    const body = /<body>([\s\S]*?)<\/body>/.exec(doc)![1];
    const keep = head
      .split('\n')
      .filter((l) => /<title>|<link rel="stylesheet"|<meta name="search-index"|<meta name="description"|<script type="application\/ld\+json">|<script>document\.documentElement/.test(l))
      .join('\n');
    const titled = opts.title ? keep.replace(/<title>[^<]*<\/title>/, `<title>${opts.title}</title>`) : keep;
    writeFileSync(join(OUT, 'index.html'), `${titled}\n${body}`);
  } else writeFileSync(out, doc);
}

// Assets: CSS with root-absolute font URLs made relative to the stylesheet, scripts with the
// search page path made relative, and the search index pointing at included pages only.
const copyTree = (from: string, to: string) => {
  for (const name of readdirSync(from)) {
    const f = join(from, name);
    const t = join(to, name);
    if (statSync(f).isDirectory()) {
      mkdirSync(t, { recursive: true });
      copyTree(f, t);
    } else if (name.endsWith('.css')) writeFileSync(t, readFileSync(f, 'utf8').replace(/url\(\/assets\//g, 'url('));
    else if (name.endsWith('.js')) writeFileSync(t, readFileSync(f, 'utf8').replace("`/search/?q=", '`search/index.html?q='));
    else if (name.startsWith('search.') && name.endsWith('.json')) {
      const index = JSON.parse(readFileSync(f, 'utf8'));
      for (const e of index.items) e[2] = rewriteUrl(e[2], '/');
      writeFileSync(t, JSON.stringify(index));
    } else copyFileSync(f, t);
  }
};
mkdirSync(join(OUT, 'assets'), { recursive: true });
copyTree(join(DIST, 'assets'), join(OUT, 'assets'));
// The explorer's data bundles, as they are.
if (existsSync(join(DIST, 'data'))) {
  mkdirSync(join(OUT, 'data'), { recursive: true });
  copyTree(join(DIST, 'data'), join(OUT, 'data'));
}
copyFileSync(join(DIST, 'favicon.svg'), join(OUT, 'favicon.svg'));

// The notice for pages left out.
const css = readdirSync(join(OUT, 'assets')).find((f) => /^site\..*\.css$/.test(f));
writeFileSync(
  join(OUT, MISSING),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not in this preview</title><link rel="stylesheet" href="assets/${css}"></head><body><main class="frame"><header class="page-head"><h1>Not in this preview</h1><p class="lede">This page exists on the full site, but only ${included.size} pages are packed into the design preview.</p><p><a href="index.html">Back to the home page</a></p></header></main></body></html>`,
);

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) walk(f);
    else files.push(relative(OUT, f));
  }
};
walk(OUT);
writeFileSync(join(OUT, '..', 'preview-files.json'), JSON.stringify(files.filter((f) => f !== 'index.html').sort(), null, 1));
console.log(`Preview: ${pages.length} pages, ${files.length} files in ${OUT}`);
