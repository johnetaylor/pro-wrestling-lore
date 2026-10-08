// Checks a built site: every internal link and asset resolves, every #fragment exists on its
// page, and every page has the basics search engines and screen readers rely on.
//   node site/check.ts [dist]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = join(import.meta.dirname, '..', process.argv[2] ?? 'dist');
const pages = new Map<string, string>(); // url path → file
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) {
      const rel = '/' + relative(OUT, full).replace(/\\/g, '/');
      pages.set(rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel, full);
    }
  }
};
walk(OUT);

const ids = new Map<string, Set<string>>();
const idsOf = (path: string) => {
  if (!ids.has(path)) {
    const file = pages.get(path);
    const set = new Set<string>();
    if (file) for (const m of readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)) set.add(m[1]);
    ids.set(path, set);
  }
  return ids.get(path)!;
};

const problems = new Map<string, string[]>();
const report = (kind: string, detail: string) => {
  if (!problems.has(kind)) problems.set(kind, []);
  problems.get(kind)!.push(detail);
};
let links = 0;
for (const [path, file] of pages) {
  const doc = readFileSync(file, 'utf8');
  const head = doc.slice(0, doc.indexOf('</head>'));
  const titles = head.match(/<title>/g)?.length ?? 0;
  if (titles !== 1) report('Pages without exactly one <title>', path);
  if ((doc.match(/<h1[\s>]/g)?.length ?? 0) !== 1) report('Pages without exactly one <h1>', path);
  if (!/<meta name="description" content="[^"]{20,}"/.test(doc)) report('Pages without a useful meta description', path);
  if (!path.endsWith('404.html') && !doc.includes(`<link rel="canonical" href="`)) report('Pages without a canonical link', path);
  const own = new Set([...doc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  if (own.size !== [...doc.matchAll(/\sid="([^"]+)"/g)].length) {
    const seen = new Set<string>();
    for (const m of doc.matchAll(/\sid="([^"]+)"/g)) {
      if (seen.has(m[1])) report('Duplicate ids', `${path} #${m[1]}`);
      seen.add(m[1]);
    }
  }
  for (const m of doc.matchAll(/\s(href|src|data-href|content)="([^"]*)"/g)) {
    const url = m[2];
    if (m[1] === 'content' && !url.startsWith('/')) continue;
    if (url.startsWith('#')) {
      links++;
      if (url.length > 1 && !own.has(decodeURIComponent(url.slice(1)))) report('Broken in-page anchors', `${path} → ${url}`);
      continue;
    }
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    links++;
    const [target, fragment] = url.split('#');
    const clean = target.split('?')[0];
    const isPage = pages.has(clean);
    const isFile = !isPage && existsSync(join(OUT, decodeURIComponent(clean))) && statSync(join(OUT, decodeURIComponent(clean))).isFile();
    if (!isPage && !isFile) report('Broken links', `${path} → ${url}`);
    else if (fragment && isPage && !idsOf(clean).has(decodeURIComponent(fragment))) report('Links to missing anchors', `${path} → ${url}`);
  }
}

console.log(`Checked ${pages.size.toLocaleString('en-US')} pages and ${links.toLocaleString('en-US')} internal links.`);
if (!problems.size) {
  console.log('No problems found.');
} else {
  for (const [kind, list] of problems) {
    console.log(`\n${kind}: ${list.length}`);
    for (const d of list.slice(0, 12)) console.log(`  ${d}`);
    if (list.length > 12) console.log(`  … and ${list.length - 12} more`);
  }
  process.exitCode = 1;
}
