// The Careers section: the timeline and the Statistics table, which share the wrestler search.
import { announce } from './dom.ts';
import { loadStorylines } from './data.ts';
import { createCareers } from './careers.ts';
import { createStatistics } from './statistics.ts';
import { LEGEND } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';

type Mode = 'timeline' | 'statistics';

/** Promotions in the order the explorer lists them; the rest follow by name. */
export const PROMOTION_ORDER = ['wwe', 'aew', 'tna', 'njpw', 'aaa', 'roh', 'cmll', 'stardom', 'wcw', 'ecw', 'nwa', 'awa', 'indy'];

const TOOLS = `<div class="app-tools app-tools--labeled">
<div class="mode-field"><span class="mode-caption" aria-hidden="true">View</span><div class="mode-switch" role="group" aria-label="Show careers as">
<button type="button" data-mode="timeline" aria-pressed="true">Timeline</button>
<button type="button" data-mode="statistics" aria-pressed="false">Statistics</button>
</div></div>
<div class="filters">
<label class="f-search">Find a wrestler<input type="search" data-control="search" placeholder="Name, e.g. Randy Orton" autocomplete="off" spellcheck="false"></label>
<label>Promotion<select data-control="promotion"><option value="all">All promotions</option></select></label>
<label>Division<select data-control="division">
<option value="all">All divisions</option>
<option value="men">Men</option>
<option value="women">Women</option>
</select></label>
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
  // Promotions with televised moments or championships in the archive.
  const promotionSelect = control<HTMLSelectElement>('promotion');
  const present = new Set([...model.shows.filter((s) => s.moments.length).map((s) => s.promotion), ...model.titles.map((t) => t.promotion)]);
  const promotionIds = [...model.promotions.keys()]
    .filter((id) => present.has(id))
    .sort((a, b) => {
      const ai = PROMOTION_ORDER.indexOf(a);
      const bi = PROMOTION_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || model.promotions.get(a)!.name.localeCompare(model.promotions.get(b)!.name);
    });
  promotionSelect.insertAdjacentHTML('beforeend', promotionIds.map((id) => `<option value="${id}">${model.promotions.get(id)!.name}</option>`).join(''));
  const divisionSelect = control<HTMLSelectElement>('division');
  const filters = () => ({
    promotion: promotionSelect.value === 'all' ? undefined : promotionSelect.value,
    division: divisionSelect.value === 'all' ? undefined : divisionSelect.value,
  });
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
    controls: { search: control('search'), kind: control('kind'), from: control('from'), to: control('to'), month: control('month'), promotion: promotionSelect, division: divisionSelect },
    stickyHeight: ctx.stickyHeight,
    storylinesFor: async (kind, key) => {
      const ix = await stories();
      if (kind === 'moment') return ix.byMoment.get(key) ?? [];
      const p = model.byId.get(key);
      return p ? ix.byPerson.get(p.i) ?? [] : [];
    },
    openStoryline: (id) => ctx.go(`/storylines/${id}/`),
    openReign: (title, reign) => ctx.go(`/titles/${title}/${query({ reign })}`),
    dialog: ctx.dialog,
    changed: () => {
      if (!quiet) ctx.changed();
    },
  });
  const statistics = createStatistics({
    model,
    root: statsRoot,
    controls: { search: control('search'), records: control('records'), minimum: control('minimum'), format: control('format'), promotion: promotionSelect, division: divisionSelect },
    openPerson: (id) => ctx.go(`/wrestlers/${id}/${query(filters())}`),
  });
  let statsTimer = 0;
  control<HTMLInputElement>('search').addEventListener('input', () => {
    if (mode !== 'statistics') return;
    clearTimeout(statsTimer);
    statsTimer = window.setTimeout(() => statistics.render(), 120);
  });
  // The timeline follows the filters itself; Statistics redraws, and the address keeps them.
  for (const select of [promotionSelect, divisionSelect])
    select.addEventListener('change', () => {
      if (mode === 'statistics') {
        statistics.render();
        ctx.changed();
      }
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
        promotionSelect.value = p.promotion && promotionIds.includes(p.promotion) ? p.promotion : 'all';
        divisionSelect.value = p.division === 'men' || p.division === 'women' ? p.division : 'all';
        if (next !== mode) setMode(next);
        else if (next === 'statistics') statistics.render();
        if (next === 'timeline') careers.apply({ person: p.person, moment: p.moment, year: p.year, from: p.from, to: p.to, promotion: filters().promotion, division: filters().division });
      } finally {
        quiet = false;
      }
    },
    address: () => {
      if (mode === 'statistics') return `/${query({ view: 'statistics', ...filters() })}`;
      const s = careers.getState();
      return `${s.person ? `/wrestlers/${s.person}/` : '/'}${query({ moment: s.moment, year: s.year, from: s.from, to: s.to, promotion: s.promotion, division: s.division })}`;
    },
    subject: () => (mode === 'statistics' ? 'Career statistics' : careers.subject()),
  };
}
