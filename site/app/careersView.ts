// The Careers section: the timeline and the Statistics table, which share the wrestler search.
import { announce } from './dom.ts';
import { loadStorylines } from './data.ts';
import { createCareers } from './careers.ts';
import { createStatistics } from './statistics.ts';
import { LEGEND } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';

type Mode = 'timeline' | 'statistics';

const TOOLS = `<div class="app-tools">
<div class="mode-switch" role="group" aria-label="Show careers as">
<button type="button" data-mode="timeline" aria-pressed="true">Timeline</button>
<button type="button" data-mode="statistics" aria-pressed="false">Statistics</button>
</div>
<div class="filters">
<label class="f-search">Find a wrestler<input type="search" data-control="search" placeholder="Name, e.g. Randy Orton" autocomplete="off" spellcheck="false"></label>
<label data-for="timeline">Moments<select data-control="kind">
<option value="all">All moments</option>
<option value="match">Matches</option>
<option value="title">Title matches</option>
<option value="story">Promos and appearances</option>
<option value="promo">Promos and interviews</option>
<option value="appearance">Other appearances</option>
</select></label>
<label data-for="timeline">From<input type="date" data-control="from"></label>
<label data-for="timeline">To<input type="date" data-control="to"></label>
<label data-for="timeline">Month<select data-control="month"><option value="custom">Custom range</option></select></label>
<label data-for="statistics" hidden>Records<select data-control="records">
<option value="available">All available records</option>
<option value="career">Career totals</option>
<option value="archive">Indexed broadcasts</option>
</select></label>
<label data-for="statistics" hidden>Minimum matches<select data-control="minimum">
<option value="0">Any</option>
<option value="10">10</option>
<option value="25">25</option>
<option value="100">100</option>
<option value="500">500</option>
</select></label>
<label data-for="statistics" hidden>Results<select data-control="format">
<option value="counts">Counts</option>
<option value="percentages">Percentages</option>
</select></label>
</div>
</div>
<div class="app-key" data-for="timeline">${LEGEND}</div>
<div class="app-view" data-root="careers"></div>
<div class="app-view" data-root="statistics" hidden></div>`;

export function createCareersView(ctx: AppContext): AppView {
  const { model } = ctx;
  const el = section('careers', TOOLS);
  const control = <T extends HTMLElement>(name: string) => el.querySelector<T>(`[data-control="${name}"]`)!;
  const timelineRoot = el.querySelector<HTMLElement>('[data-root="careers"]')!;
  const statsRoot = el.querySelector<HTMLElement>('[data-root="statistics"]')!;
  let mode: Mode = 'timeline';
  let quiet = false;

  // Storylines each moment and wrestler appear in, for the panels' "Follow the storyline".
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

  const careers = createCareers({
    model,
    root: timelineRoot,
    controls: { search: control('search'), kind: control('kind'), from: control('from'), to: control('to'), month: control('month') },
    stickyHeight: ctx.stickyHeight,
    storylinesFor: async (kind, key) => {
      const ix = await stories();
      if (kind === 'moment') return ix.byMoment.get(key) ?? [];
      const p = model.byId.get(key);
      return p ? ix.byPerson.get(p.i) ?? [] : [];
    },
    openStoryline: (id) => ctx.go(`/storylines/${id}/`),
    dialog: ctx.dialog,
    changed: () => {
      if (!quiet) ctx.changed();
    },
  });
  const statistics = createStatistics({
    model,
    root: statsRoot,
    controls: { search: control('search'), records: control('records'), minimum: control('minimum'), format: control('format') },
    openPerson: (id) => ctx.go(`/wrestlers/${id}/`),
  });
  let statsTimer = 0;
  control<HTMLInputElement>('search').addEventListener('input', () => {
    if (mode !== 'statistics') return;
    clearTimeout(statsTimer);
    statsTimer = window.setTimeout(() => statistics.render(), 120);
  });

  function setMode(next: Mode) {
    mode = next;
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    for (const x of el.querySelectorAll<HTMLElement>('[data-for]')) x.hidden = x.dataset.for !== mode;
    timelineRoot.hidden = mode !== 'timeline';
    statsRoot.hidden = mode !== 'statistics';
    careers.hidePreview();
    if (mode === 'statistics') statistics.render();
    else careers.show();
  }
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    setMode(b.dataset.mode as Mode);
    ctx.changed();
    announce(mode === 'statistics' ? 'Statistics' : 'Timeline');
  });

  return {
    el,
    tab: '/',
    show: () => {
      if (mode === 'timeline') careers.show();
    },
    hide: () => careers.hidePreview(),
    apply: (p: Params) => {
      quiet = true;
      try {
        const next: Mode = p.mode === 'statistics' ? 'statistics' : 'timeline';
        if (next !== mode) setMode(next);
        if (next === 'timeline') careers.apply({ person: p.person, moment: p.moment, year: p.year, from: p.from, to: p.to });
      } finally {
        quiet = false;
      }
    },
    address: () => {
      if (mode === 'statistics') return '/?view=statistics';
      const s = careers.getState();
      return `${s.person ? `/wrestlers/${s.person}/` : '/'}${query({ moment: s.moment, year: s.year, from: s.from, to: s.to })}`;
    },
    subject: () => (mode === 'statistics' ? 'Career statistics' : careers.subject()),
  };
}
