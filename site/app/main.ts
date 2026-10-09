// The explorer app. Each explorer page is the same small shell with its own address in
// data-path; this module loads the data, opens the view that address names, and keeps the
// address in step as people explore, so every state worth sharing has a link and the back
// button works.
import { frameThrottle } from './dom.ts';
import { loadCalendar, loadFamilies, loadModel, loadStorylines, loadTitles, setDataBase } from './data.ts';
import { createCareersView } from './careersView.ts';
import { createStorylinesView } from './storylinesView.ts';
import { createShowsView } from './shows.ts';
import { createTitlesView } from './titles.ts';
import { createFamiliesView } from './families.ts';
import { createCalendarView } from './calendar.ts';
import type { Model } from './model.ts';
import type { AppContext, AppView, Params, ViewName } from './views.ts';

const SITE = 'Pro Wrestling Lore';

/** The app's addresses: which view each path opens, and with what. */
const ROUTES: [ViewName, RegExp, (m: RegExpExecArray, q: (k: string) => string | undefined) => Params][] = [
  ['careers', /^\/$/, (_, q) => ({ mode: q('view'), moment: q('moment'), from: q('from'), to: q('to') })],
  ['careers', /^\/wrestlers\/([a-z0-9-]+)\/$/, (m, q) => ({ person: m[1], moment: q('moment'), year: q('year'), from: q('from'), to: q('to') })],
  ['storylines', /^\/storylines\/$/, (_, q) => ({ promotion: q('promotion'), period: q('period') })],
  ['storylines', /^\/storylines\/([a-z0-9-]+)\/$/, (m, q) => ({ story: m[1], chapter: q('chapter') })],
  ['shows', /^\/shows\/$/, () => ({})],
  ['shows', /^\/shows\/([a-z0-9-]+)\/$/, (m) => ({ promotion: m[1] })],
  ['shows', /^\/shows\/([a-z0-9-]+\/[a-z0-9-]+)\/$/, (m, q) => ({ series: m[1], year: q('year') })],
  ['shows', /^\/shows\/([a-z0-9-]+\/[a-z0-9-]+)\/(\d{4})\/$/, (m) => ({ series: m[1], year: m[2] })],
  ['shows', /^\/shows\/([a-z0-9-]+\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}(?:-\d+)?)\/$/, (m) => ({ show: m[1] })],
  ['titles', /^\/titles\/$/, () => ({})],
  ['titles', /^\/titles\/([a-z0-9-]+)\/$/, (m, q) => ({ title: m[1], mode: q('view'), reign: q('reign'), from: q('from'), to: q('to') })],
  ['calendar', /^\/calendar\/$/, (_, q) => ({ promotion: q('promotion') })],
  ['dynasties', /^\/families\/$/, () => ({})],
  ['dynasties', /^\/families\/([a-z0-9-]+)\/$/, (m, q) => ({ family: m[1], member: q('member') })],
];

function parse(url: URL): { view: ViewName; params: Params } | null {
  const q = (k: string) => url.searchParams.get(k) ?? undefined;
  for (const [view, pattern, read] of ROUTES) {
    const m = pattern.exec(url.pathname);
    if (m) return { view, params: read(m, q) };
  }
  return null;
}

const root = document.getElementById('app');
if (root) {
  boot(root).catch((err) => {
    console.error(err);
    const status = root.querySelector<HTMLElement>('[data-status]');
    if (status) {
      status.hidden = false;
      status.textContent = 'The explorer didn’t load. Check your connection, then reload the page.';
    }
    // Show the static version of the page instead.
    document.documentElement.classList.remove('js');
  });
}

async function boot(root: HTMLElement) {
  setDataBase(root.dataset.data!);
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  // The design preview serves pages under other paths; there the app runs without changing the URL.
  const routing = !!canonical && new URL(canonical).pathname === location.pathname;
  const homeTitle = root.dataset.homeTitle ?? SITE;
  const first = (routing && parse(new URL(location.href))) || parse(new URL(root.dataset.path ?? '/', location.origin)) || { view: 'careers' as ViewName, params: {} };

  const model: Model = await loadModel();
  const status = root.querySelector<HTMLElement>('[data-status]')!;

  // ---------- Dialog for reigns, promotion runs and other details ----------
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="Close">&times;</button><div class="dialog-body"></div>';
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || (e.target as Element).closest('.dialog-close')) dialog.close();
  });

  // ---------- Views, created when first opened ----------
  const views = new Map<ViewName, AppView>();
  let active: AppView | null = null;
  let applying = 0;
  const ctx: AppContext = {
    model,
    stickyHeight: () => {
      const tools = active?.el.querySelector<HTMLElement>('.app-tools');
      return tools && getComputedStyle(tools).position === 'sticky' ? tools.offsetHeight : 0;
    },
    dialog: (html) => {
      dialog.querySelector('.dialog-body')!.innerHTML = html;
      dialog.showModal();
    },
    changed: () => {
      if (!applying) writeUrl();
    },
    go: (address) => void open(new URL(address, location.origin), true),
  };
  const measureTools = frameThrottle(() => root.style.setProperty('--tools-h', `${ctx.stickyHeight()}px`));
  window.addEventListener('resize', measureTools);

  async function view(name: ViewName): Promise<AppView> {
    const made = views.get(name);
    if (made) return made;
    const v =
      name === 'storylines'
        ? createStorylinesView(ctx, await loadStorylines())
        : name === 'shows'
          ? createShowsView(ctx)
          : name === 'titles'
            ? createTitlesView(ctx, await loadTitles())
            : name === 'dynasties'
              ? createFamiliesView(ctx, await loadFamilies())
              : name === 'calendar'
                ? createCalendarView(ctx, await loadCalendar())
                : createCareersView(ctx);
    // Another call may have made it while the data loaded.
    if (views.has(name)) return views.get(name)!;
    views.set(name, v);
    root.append(v.el);
    new ResizeObserver(measureTools).observe(v.el.querySelector('.app-tools') ?? v.el);
    return v;
  }

  /** Shows a view, marks its section tab as current and puts it into a state. */
  async function show(name: ViewName, params: Params) {
    const v = await view(name);
    applying++;
    try {
      if (active !== v) {
        active?.hide();
        if (active) active.el.hidden = true;
        active = v;
        v.el.hidden = false;
        for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
          if (sitePath(new URL(a.href)).pathname === v.tab) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        }
        measureTools();
        v.show();
      }
      await v.apply(params);
    } finally {
      applying--;
    }
    writeTitle();
  }

  // ---------- Addresses ----------
  let current = location.pathname + location.search;
  function writeTitle() {
    const subject = active?.subject();
    document.title = subject ? `${subject} | ${SITE}` : homeTitle;
  }
  function writeUrl() {
    writeTitle();
    if (!routing || !active) return;
    const next = active.address();
    if (next === current) return;
    // New dates replace the history entry; anything else is a new one.
    const strip = (u: string) => {
      const url = new URL(u, location.origin);
      url.searchParams.delete('from');
      url.searchParams.delete('to');
      return url.pathname + url.search;
    };
    history[strip(next) === strip(current) ? 'replaceState' : 'pushState'](null, '', next);
    current = next;
  }
  /** The view may describe its state more precisely than the address that opened it. */
  function settleUrl() {
    if (!routing || !active) return;
    const address = active.address();
    if (address !== current) {
      history.replaceState(null, '', address);
      current = address;
    }
  }
  /** Opens an app address, as a new history entry when push is set. */
  async function open(url: URL, push: boolean): Promise<boolean> {
    const r = parse(url);
    if (!r) return false;
    // A link inside a dialog leads somewhere else: the dialog closes with the move.
    if (dialog.open) dialog.close();
    if (push && routing) {
      const address = url.pathname + url.search;
      if (address !== current) history.pushState(null, '', address);
      current = address;
    }
    await show(r.view, r.params);
    settleUrl();
    return true;
  }
  window.addEventListener('popstate', () => {
    current = location.pathname + location.search;
    void open(new URL(location.href), false).then((ok) => {
      if (!ok) location.reload();
    });
  });

  // Links to app addresses open in place. In the design preview, where pages live under other
  // paths, the app still follows them in place but leaves the address bar alone, and links the
  // app wrote to pages outside the preview lead to its notice.
  const previewRoot = new URL('./', document.baseURI).href;
  /** In the design preview, a page's address as the site writes it: wrestlers/x/index.html is /wrestlers/x/. */
  function sitePath(url: URL): URL {
    if (routing || !url.href.startsWith(previewRoot)) return url;
    const rest = url.href.slice(previewRoot.length).split(/[?#]/)[0].replace(/index\.html$/, '');
    return new URL(`/${rest}${url.search}`, location.origin);
  }
  function follow(href: string, raw: string): boolean {
    const url = sitePath(new URL(href, location.href));
    if (url.origin !== location.origin) return false;
    const r = parse(url);
    if (r) {
      void open(url, true).then(() => {
        if (!Object.values(r.params).some(Boolean)) window.scrollTo({ top: 0 });
      });
      return true;
    }
    if (routing || !raw.startsWith('/')) return false;
    location.href = new URL('not-in-preview.html', document.baseURI).href;
    return true;
  }
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    if (follow(a.href, a.getAttribute('href') ?? '')) e.preventDefault();
  });
  // The site search asks before it leaves the page.
  window.addEventListener('pwl:navigate', (e) => {
    const href = (e as CustomEvent<string>).detail;
    if (follow(href, href)) e.preventDefault();
  });

  // ---------- Start ----------
  await show(first.view, first.params);
  status.hidden = true;
  status.textContent = '';
  current = location.pathname + location.search;
  settleUrl();
  document.documentElement.classList.add('app-ready');
}
