// The explorer app. The build writes each app page with its view and starting state in data
// attributes on #app; this module loads the data, mounts the views and keeps the URL in step,
// so every state worth sharing has an address and the back button works.
import { announce, frameThrottle } from './dom.ts';
import { loadModel, loadStorylines, setDataBase } from './data.ts';
import { createCareers, type Careers, type CareersState } from './careers.ts';
import { createStatistics } from './statistics.ts';
import { createStorylines, type Storylines, type StorylinesState } from './storylines.ts';
import type { Model } from './model.ts';

type View = 'careers' | 'storylines';
type Mode = 'timeline' | 'statistics';

interface Route {
  view: View;
  mode: Mode;
  careers: CareersState;
  storylines: StorylinesState;
}

const SITE = 'Pro Wrestling Lore';
const app = document.getElementById('app');
if (app) {
  boot(app).catch((err) => {
    console.error(err);
    const status = app.querySelector<HTMLElement>('[data-status]');
    if (status) {
      status.hidden = false;
      status.textContent = 'The timeline didn’t load. Check your connection, then reload the page.';
    }
    // Show the static version of the page instead.
    document.documentElement.classList.remove('js');
  });
}

/** Reads an app address. Anything else is an ordinary page. */
function parse(url: URL): Route | null {
  const q = url.searchParams;
  const get = (k: string) => q.get(k) ?? undefined;
  const dates = { from: get('from'), to: get('to'), moment: get('moment') };
  if (url.pathname === '/') return { view: 'careers', mode: q.get('view') === 'statistics' ? 'statistics' : 'timeline', careers: dates, storylines: {} };
  const person = /^\/wrestlers\/([a-z0-9-]+)\/$/.exec(url.pathname);
  if (person) return { view: 'careers', mode: 'timeline', careers: { ...dates, person: person[1], year: get('year') }, storylines: {} };
  if (url.pathname === '/storylines/') return { view: 'storylines', mode: 'timeline', careers: {}, storylines: { promotion: get('promotion'), period: get('period') } };
  const story = /^\/storylines\/([a-z0-9-]+)\/$/.exec(url.pathname);
  if (story) return { view: 'storylines', mode: 'timeline', careers: {}, storylines: { story: story[1], chapter: get('chapter') } };
  return null;
}

async function boot(root: HTMLElement) {
  setDataBase(root.dataset.data!);
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  // The design preview serves pages under other paths; there the app runs without changing the URL.
  const routing = !!canonical && new URL(canonical).pathname === location.pathname;
  const homeTitle = root.dataset.homeTitle ?? SITE;

  const first: Route = (routing && parse(new URL(location.href))) || {
    view: root.dataset.view === 'storylines' ? 'storylines' : 'careers',
    mode: 'timeline',
    careers: { person: root.dataset.person },
    storylines: { story: root.dataset.story, promotion: root.dataset.promotion },
  };

  const model: Model = await loadModel();
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  status.hidden = true;
  status.textContent = '';

  const control = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-control="${name}"]`)!;
  const tools = {
    careers: root.querySelector<HTMLElement>('[data-tools="careers"]')!,
    storylines: root.querySelector<HTMLElement>('[data-tools="storylines"]')!,
  };
  const views = {
    careers: root.querySelector<HTMLElement>('[data-root="careers"]')!,
    statistics: root.querySelector<HTMLElement>('[data-root="statistics"]')!,
    storylines: root.querySelector<HTMLElement>('[data-root="storylines"]')!,
  };
  const key = root.querySelector<HTMLElement>('.app-key')!;

  // ---------- Dialog for reigns and promotion runs ----------
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="Close">&times;</button><div class="dialog-body"></div>';
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || (e.target as Element).closest('.dialog-close')) dialog.close();
  });
  const openDialog = (html: string) => {
    dialog.querySelector('.dialog-body')!.innerHTML = html;
    dialog.showModal();
  };

  // ---------- Storyline lookups for the Careers panels, loaded on first use ----------
  type StoryRef = { id: string; title: string };
  let storyIndex: Promise<{ byMoment: Map<string, StoryRef[]>; byPerson: Map<number, StoryRef[]> }> | null = null;
  const stories = () =>
    (storyIndex ??= loadStorylines().then((b) => {
      const byMoment = new Map<string, StoryRef[]>();
      const byPerson = new Map<number, StoryRef[]>();
      const add = <K>(map: Map<K, StoryRef[]>, k: K, ref: StoryRef) => {
        const list = map.get(k) ?? [];
        if (!list.some((x) => x.id === ref.id)) list.push(ref);
        map.set(k, list);
      };
      for (const s of b.storylines) {
        const ref = { id: s.id, title: s.title };
        for (const c of s.chapters) if (c.moment) add(byMoment, c.moment, ref);
        for (const p of s.people) add(byPerson, p, ref);
      }
      return { byMoment, byPerson };
    }));

  // ---------- Sticky tools ----------
  const activeTools = () => (view === 'storylines' ? tools.storylines : tools.careers);
  const stickyTools = () => {
    const t = activeTools();
    return getComputedStyle(t).position === 'sticky' ? t.offsetHeight : 0;
  };
  const measureTools = () => root.style.setProperty('--tools-h', `${stickyTools()}px`);
  const toolsObserver = new ResizeObserver(frameThrottle(measureTools));
  toolsObserver.observe(tools.careers);
  toolsObserver.observe(tools.storylines);
  window.addEventListener('resize', frameThrottle(measureTools));

  // ---------- Views ----------
  let view: View = first.view;
  let mode: Mode = 'timeline';
  let applying = false;
  const quietly = (fn: () => void) => {
    const was = applying;
    applying = true;
    try {
      fn();
    } finally {
      applying = was;
    }
  };

  const careers: Careers = createCareers({
    model,
    root: views.careers,
    controls: {
      search: control<HTMLInputElement>('search'),
      kind: control<HTMLSelectElement>('kind'),
      from: control<HTMLInputElement>('from'),
      to: control<HTMLInputElement>('to'),
      month: control<HTMLSelectElement>('month'),
    },
    stickyHeight: stickyTools,
    storylinesFor: async (kind, k) => {
      const ix = await stories();
      if (kind === 'moment') return ix.byMoment.get(k) ?? [];
      const p = model.byId.get(k);
      return p ? ix.byPerson.get(p.i) ?? [] : [];
    },
    openStoryline: (id) => void openStory(id),
    dialog: openDialog,
    changed: () => {
      if (!applying) writeUrl();
    },
  });
  const statistics = createStatistics({
    model,
    root: views.statistics,
    controls: {
      search: control<HTMLInputElement>('search'),
      records: control<HTMLSelectElement>('records'),
      minimum: control<HTMLSelectElement>('minimum'),
      format: control<HTMLSelectElement>('format'),
    },
    openPerson: (id) => {
      // One history entry: the career, not the switch back to the timeline.
      quietly(() => setMode('timeline'));
      careers.focusPerson(id);
    },
  });
  let statsTimer = 0;
  control<HTMLInputElement>('search').addEventListener('input', () => {
    if (mode !== 'statistics') return;
    clearTimeout(statsTimer);
    statsTimer = window.setTimeout(() => statistics.render(), 120);
  });

  let storylines: Storylines | null = null;
  async function ensureStorylines(): Promise<Storylines> {
    if (storylines) return storylines;
    const bundle = await loadStorylines();
    storylines ??= createStorylines({
      model,
      bundle,
      root: views.storylines,
      controls: {
        tabs: tools.storylines.querySelector<HTMLElement>('.promo-tabs')!,
        brand: control<HTMLSelectElement>('brand'),
        period: control<HTMLSelectElement>('period'),
        order: control<HTMLSelectElement>('order'),
        scale: control<HTMLSelectElement>('scale'),
      },
      stickyHeight: stickyTools,
      openMoment: (id) => {
        quietly(() => {
          setMode('timeline');
          showView('careers');
          careers.apply({ moment: id });
        });
        writeUrl();
      },
      openPerson: (id) => {
        quietly(() => {
          setMode('timeline');
          showView('careers');
        });
        careers.focusPerson(id);
      },
      changed: () => {
        if (!applying) writeUrl();
      },
    });
    return storylines;
  }
  async function openStory(id: string) {
    const s = await ensureStorylines();
    quietly(() => showView('storylines'));
    s.focus(id);
  }

  /** Shows one view's tools and lanes, and marks its section tab as current. */
  function showView(next: View) {
    view = next;
    tools.careers.hidden = view !== 'careers';
    tools.storylines.hidden = view !== 'storylines';
    views.careers.hidden = view !== 'careers' || mode !== 'timeline';
    views.statistics.hidden = view !== 'careers' || mode !== 'statistics';
    views.storylines.hidden = view !== 'storylines';
    key.hidden = view === 'careers' && mode === 'statistics';
    careers.hidePreview();
    storylines?.hidePreview();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
      const path = new URL(a.href).pathname;
      const current = view === 'storylines' ? path === '/storylines/' : path === '/';
      if (current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    measureTools();
    if (view === 'careers') {
      if (mode === 'timeline') careers.show();
    } else storylines?.show();
  }

  // ---------- Timeline and Statistics ----------
  function setMode(next: Mode) {
    if (mode === next) return;
    mode = next;
    for (const b of root.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    for (const el of root.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== mode;
    if (mode === 'statistics') statistics.render();
    showView('careers');
    if (!applying) {
      writeUrl();
      announce(mode === 'statistics' ? 'Statistics' : 'Timeline');
    }
  }
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });

  // ---------- Addresses ----------
  let current = location.pathname + location.search;
  function address(): string {
    const q = new URLSearchParams();
    let path = '/';
    if (view === 'storylines' && storylines) {
      const s = storylines.getState();
      path = s.story ? `/storylines/${s.story}/` : '/storylines/';
      if (s.promotion) q.set('promotion', s.promotion);
      if (s.chapter) q.set('chapter', s.chapter);
      if (s.period) q.set('period', s.period);
    } else if (mode === 'statistics') q.set('view', 'statistics');
    else {
      const s = careers.getState();
      if (s.person) path = `/wrestlers/${s.person}/`;
      for (const k of ['moment', 'year', 'from', 'to'] as const) if (s[k]) q.set(k, s[k]!);
    }
    const query = q.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }
  function writeTitle() {
    const subject = view === 'storylines' ? storylines?.subject() : mode === 'timeline' ? careers.subject() : 'Career statistics';
    document.title = subject ? `${subject} | ${SITE}` : homeTitle;
  }
  function writeUrl() {
    writeTitle();
    if (!routing) return;
    const next = address();
    if (next === current) return;
    const path = (u: string) => u.split('?')[0];
    const params = (u: string) => new URLSearchParams(u.split('?')[1] ?? '');
    // A new page, wrestler, moment, chapter or view is a new history entry; new dates replace it.
    const push = path(next) !== path(current) || (['moment', 'chapter', 'view', 'promotion'] as const).some((k) => params(next).get(k) !== params(current).get(k));
    history[push ? 'pushState' : 'replaceState'](null, '', next);
    current = next;
  }
  async function applyRoute(r: Route) {
    if (r.view === 'storylines') {
      const s = await ensureStorylines();
      quietly(() => {
        showView('storylines');
        s.apply(r.storylines);
      });
    } else {
      quietly(() => {
        setMode(r.mode);
        showView('careers');
        if (r.mode === 'timeline') careers.apply(r.careers);
      });
    }
    current = location.pathname + location.search;
    writeTitle();
  }
  window.addEventListener('popstate', () => {
    const r = parse(new URL(location.href));
    if (r) void applyRoute(r);
    else location.reload();
  });

  // Links to app addresses open in place. In the design preview, where pages live under other
  // paths, the app still follows them in place but leaves the address bar alone, and links the
  // app wrote to pages outside the preview lead to its notice.
  const previewRoot = new URL('./', document.baseURI).href;
  /** In the design preview, a page's address as the site writes it: wrestlers/x/index.html is /wrestlers/x/. */
  const sitePath = (url: URL): URL => {
    if (routing || !url.href.startsWith(previewRoot)) return url;
    const rest = url.href.slice(previewRoot.length).split(/[?#]/)[0].replace(/index\.html$/, '');
    return new URL(`/${rest}${url.search}`, location.origin);
  };
  const navigate = (href: string, raw = href): boolean => {
    const url = sitePath(new URL(href, location.href));
    if (url.origin !== location.origin) return false;
    const r = parse(url);
    if (!r) {
      if (routing || !raw.startsWith('/')) return false;
      location.href = new URL('not-in-preview.html', document.baseURI).href;
      return true;
    }
    if (routing) {
      history.pushState(null, '', url.pathname + url.search);
      current = url.pathname + url.search;
    }
    void applyRoute(r).then(() => {
      if (!r.careers.person && !r.careers.moment && !r.storylines.story) window.scrollTo({ top: 0 });
    });
    return true;
  };
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    if (navigate(a.href, a.getAttribute('href') ?? '')) e.preventDefault();
  });
  // The site search asks before it leaves the page.
  window.addEventListener('pwl:navigate', (e) => {
    if (navigate((e as CustomEvent<string>).detail)) e.preventDefault();
  });

  // ---------- Start ----------
  await applyRoute(first);
  document.documentElement.classList.add('app-ready');
}
