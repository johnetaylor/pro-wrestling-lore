// Shows: every series a promotion has run, as a grid of years and months with a chip for each
// show. Select a date to read that show's card below its year, as on v69.
import { announce, esc, fmtDate, num, plural, reducedMotion } from './dom.ts';
import { loadDetails, loadShowDetails } from './data.ts';
import type { DetailRow, Model, Moment, SeriesRef, ShowDetailRow, ShowRef } from './model.ts';
import { matchTypeLine, ratingMini, usefulContext } from './panels.ts';
import { promotionTabs } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';

/** Promotion tabs in v69's order; the rest follow when they have shows. */
const ORDER = ['wwe', 'aew', 'tna', 'njpw', 'aaa', 'roh', 'cmll', 'stardom', 'wcw', 'ecw', 'awa', 'indy'];
/** Each promotion's flagship series first, as on v69. */
const PREFERRED: Record<string, string[]> = {
  wwe: ['wwe/raw', 'wwe/smackdown', 'wwe/nxt', 'wwe/snme', 'wwe/wrestlemania', 'wwe/royal-rumble', 'wwe/summerslam', 'wwe/survivor-series'],
  aew: ['aew/dynamite', 'aew/collision'],
  wcw: ['wcw/nitro', 'wcw/thunder', 'wcw/saturday-night', 'wcw/starrcade'],
  aaa: ['aaa/lucha-libre-aaa', 'aaa/triplemania'],
};
const PRIMARY = 8;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KIND: Record<string, string> = { weekly: 'Weekly television', ple: 'Pay-per-view and premium live event', special: 'Television special', event: 'Event', arena: 'Arena card' };

export function createShowsView(ctx: AppContext): AppView {
  const { model } = ctx;
  const asOfYear = Number(model.asOf.slice(0, 4));
  const promotions = [...new Set([...ORDER, ...model.series.map((s) => s.promotion)])]
    .filter((id) => model.promotions.has(id) && (model.series.some((s) => s.promotion === id) || ORDER.slice(0, 10).includes(id)))
    .map((id) => ({ id, name: model.promotions.get(id)!.name, color: `var(--p-${id}, var(--p-other))` }));

  const state = {
    promotion: promotions[0].id,
    series: null as SeriesRef | null,
    year: 'all',
    show: null as ShowRef | null,
  };
  const showDetails = new Map<string, ShowDetailRow>();
  const details = new Map<string, DetailRow>();

  const el = section('shows', `<div class="app-tools">${promotionTabs(promotions, state.promotion, 'Shows by promotion')}</div><div class="app-view shows-view"></div>`);
  const tabs = el.querySelector<HTMLElement>('.promo-tabs')!;
  const root = el.querySelector<HTMLElement>('.shows-view')!;

  const seriesOf = (promotion: string): SeriesRef[] => {
    const list = model.series.filter((s) => s.promotion === promotion && model.showsBySeries.get(s)?.length);
    const pref = PREFERRED[promotion] ?? [];
    const count = (s: SeriesRef) => model.showsBySeries.get(s)!.length;
    return list.sort((a, b) => {
      const ai = pref.indexOf(a.id);
      const bi = pref.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || count(b) - count(a) || a.name.localeCompare(b.name);
    });
  };
  /** The years a series' grid runs over: from its first show (or documented start) to its last, or to now while it's running. */
  const yearsOf = (s: SeriesRef, shows: ShowRef[]): number[] => {
    const firstShow = Number(shows[0].date.slice(0, 4));
    const lastShow = Number(shows.at(-1)!.date.slice(0, 4));
    const first = s.start > 0 ? Math.min(s.start, firstShow) : firstShow;
    const last = lastShow >= asOfYear - 1 ? asOfYear : lastShow;
    const years: number[] = [];
    for (let y = last; y >= first; y--) years.push(y);
    return years;
  };
  const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

  // ---------- Markup ----------
  function pickerHtml(list: SeriesRef[], current: SeriesRef): string {
    const primary = list.slice(0, PRIMARY);
    if (!primary.includes(current)) primary.push(current);
    const more = list.filter((s) => !primary.includes(s));
    const button = (s: SeriesRef) =>
      `<button type="button" data-series="${esc(s.id)}" aria-pressed="${s === current}" style="--c:${s.color || 'var(--accent)'}">${esc(s.name)}</button>`;
    return `<nav class="series-picker" aria-label="Shows and events"><p class="picker-label">Shows and events</p><div class="series-tabs">${primary.map(button).join('')}</div>${
      more.length ? `<details class="series-more"${more.includes(current) ? ' open' : ''}><summary>More shows and events (${more.length})</summary><div class="series-tabs">${more.map(button).join('')}</div></details>` : ''
    }</nav>`;
  }

  /** A short suffix for a show that shares its date or event with another: night 1 and 2, the pre-show. */
  const chipNote = (s: ShowRef) => {
    const n = s.name;
    if (/countdown|pre-?show|kickoff/i.test(n)) return 'Pre';
    if (/night 2|sunday/i.test(n)) return 'N2';
    if (/night 1|saturday/i.test(n) && !/saturday night/i.test(n)) return 'N1';
    if (/pilot/i.test(n)) return 'Pilot';
    return '';
  };

  function gridHtml(s: SeriesRef, shows: ShowRef[], years: number[]): string {
    const shown = state.year === 'all' ? years : years.filter((y) => String(y) === state.year);
    const asOfMonth = Number(model.asOf.slice(5, 7));
    return `<div class="show-grid" role="region" aria-label="${esc(s.name)} by year and month">
<div class="show-grid-head"><span>Year</span>${MONTHS.map((m) => `<span>${m}</span>`).join('')}</div>
${shown
  .map((year) => {
    const ofYear = shows.filter((x) => x.date.startsWith(String(year)));
    const months = MONTHS.map((m, i) => {
      const list = ofYear.filter((x) => Number(x.date.slice(5, 7)) === i + 1);
      const future = year === asOfYear && i + 1 > asOfMonth;
      return `<div class="show-month${future ? ' future' : ''}" aria-label="${m} ${year}">${
        list.length
          ? list
              .map((x) => {
                const note = chipNote(x);
                const card = x.moments.length ? plural(x.moments.length, 'segment') : 'card not indexed';
                return `<button type="button" class="show-chip${x.moments.length ? '' : ' listed'}${x === state.show ? ' active' : ''}" data-show="${esc(x.id)}" aria-expanded="${x === state.show}" aria-label="${esc(`${x.name}, ${fmtDate(x.date, true)}, ${card}`)}" title="${esc(`${x.name}, ${fmtDate(x.date)}`)}"><span>${Number(x.date.slice(8, 10))}</span>${note ? `<small>${note}</small>` : ''}</button>`;
              })
              .join('')
          : `<span class="show-none" aria-hidden="true">${future ? '' : '·'}</span>`
      }</div>`;
    }).join('');
    const open = state.show && state.show.date.startsWith(String(year)) && state.show.series === s;
    return `<section class="show-year${open ? ' open' : ''}" data-year="${year}"><div class="show-year-row"><div class="show-year-label"><strong>${year}</strong><small>${ofYear.length ? `${num(ofYear.length)} indexed` : 'None indexed'}</small></div>${months}</div>${open ? `<div class="detail inline show-detail" aria-label="Show details">${showHtml(state.show!)}</div>` : ''}</section>`;
  })
  .join('')}
</div>`;
  }

  function showHtml(sh: ShowRef): string {
    const d = showDetails.get(sh.id);
    const loading = !d;
    const [recorded, coverage, watch, watchLabel, notes, sources, numbered] = d ?? ['', '', '', '', [], [], 0];
    const matches = sh.moments.filter((m) => m.kind <= 1).length;
    const others = sh.moments.length - matches;
    const counts = [matches ? plural(matches, 'match', 'matches') : '', others ? plural(others, 'other segment') : ''].filter(Boolean).join(' and ');
    const list = model.showsBySeries.get(sh.series!) ?? [];
    const at = list.indexOf(sh);
    const prev = at > 0 ? list[at - 1] : null;
    const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
    const dated = `${sh.recorded ? 'Taped' : sh.series?.kind === 'weekly' ? 'Aired' : 'Held'} ${weekday(sh.date)}, ${fmtDate(sh.date, true)}${recorded && recorded !== sh.date ? `. Taped ${fmtDate(recorded, true)}` : ''}`;
    const item = (m: Moment) => {
      const row = details.get(m.id);
      const [result, context, matchType, duration, , , order, guests] = row ?? ['', '', '', '', [], [], 0, ''];
      const type = matchTypeLine(m.kind, matchType, duration);
      const why = usefulContext(context, result, matchType);
      return `<li class="card-item k${m.kind}">${numbered ? `<span class="card-n">${order || ''}</span>` : ''}<div class="card-body">
${type ? `<p class="card-type">${esc(type)}</p>` : ''}<p class="card-title">${esc(m.title)}</p>
${result && result !== m.title ? `<p class="card-result">${esc(result)}</p>` : ''}
${why ? `<p class="card-context">${esc(why)}</p>` : ''}
<div class="chips">${[...m.people, ...m.involved].map((p) => `<button type="button" class="chip${m.involved.includes(p) ? ' involved' : ''}" data-person="${p}">${esc(model.people[p].name)}</button>`).join('')}</div>
${guests ? `<p class="hint">Also on screen: ${esc(guests)}</p>` : ''}
${row ? ratingMini(row) : ''}
<p class="card-actions"><button type="button" class="text-button" data-moment="${esc(m.id)}">Open in Careers</button></p>
</div></li>`;
    };
    return `<div class="panel-top"><span class="panel-kind">${sh.moments.length ? 'Results' : 'Show details'}</span><button type="button" class="panel-close" aria-label="Close this show">&times;</button></div>
<p class="panel-date">${esc(dated)}</p>
<h2>${esc(sh.name)}</h2>
${counts ? `<p class="hint">${esc(counts)} in this archive.</p>` : ''}
${coverage ? `<p class="hint">${esc(coverage)}</p>` : ''}
${watch ? `<p class="source-links"><a href="${esc(watch)}" rel="noopener" target="_blank">${esc(watchLabel || 'Where to watch')}</a></p>` : ''}
${
  sh.moments.length
    ? `<ol class="show-card">${sh.moments.map(item).join('')}</ol>`
    : loading
      ? '<p class="hint">Loading…</p>'
      : '<p>This date is listed with its sources; its card isn’t in the archive yet.</p>'
}
${notes.length ? notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('') : ''}
${sources.length ? `<p class="source-links">${sources.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${sources.length > 1 ? `Source ${i + 1}` : 'Source'}</a>`).join('')}</p>` : ''}
${prev || next ? `<nav class="panel-pager" aria-label="Other ${esc(sh.series?.name ?? '')} shows">${prev ? `<button type="button" class="app-button" data-show="${esc(prev.id)}">Previous: ${esc(fmtDate(prev.date))}</button>` : ''}${next ? `<button type="button" class="app-button" data-show="${esc(next.id)}">Next: ${esc(fmtDate(next.date))}</button>` : ''}</nav>` : ''}`;
  }

  function render() {
    const p = promotions.find((x) => x.id === state.promotion) ?? promotions[0];
    for (const b of tabs.querySelectorAll<HTMLElement>('[data-promotion]')) b.setAttribute('aria-pressed', String(b.dataset.promotion === p.id));
    const list = seriesOf(p.id);
    const head = `<div class="explorer-head"><div><h1 class="view-title">${esc(p.name)} shows</h1><p class="view-subtitle">Choose a show or event, then a date for its card.</p></div></div>`;
    if (!list.length) {
      root.innerHTML = `${head}<div class="lanes-empty"><h2>No ${esc(p.name)} shows indexed yet</h2><p>Dated shows and their cards appear here as they are added.</p></div>`;
      return;
    }
    if (!state.series || state.series.promotion !== p.id) state.series = list[0];
    const s = state.series;
    const shows = model.showsBySeries.get(s) ?? [];
    const years = yearsOf(s, shows);
    if (state.year !== 'all' && !years.includes(Number(state.year))) state.year = 'all';
    const first = shows[0];
    root.style.setProperty('--series', s.color || 'var(--accent)');
    root.innerHTML = `${head}${pickerHtml(list, s)}
<section class="series-head" aria-label="Selected series"><div><h2>${esc(s.name)}</h2><p>${esc(KIND[s.kind] ?? 'Show')}. ${esc(s.note)}${s.source ? ` <a href="${esc(s.source)}" rel="noopener" target="_blank">Source</a>` : ''}</p></div><p class="series-total"><strong>${num(shows.length)}</strong><span>indexed ${shows.length === 1 ? 'show' : 'shows'}</span></p></section>
<div class="filters series-filters"><label>Year<select data-control="show-year"><option value="all">All years</option>${years.map((y) => `<option value="${y}"${String(y) === state.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label><button type="button" class="app-button" data-show="${esc(first.id)}">First indexed show</button></div>
<p class="range-hint">Years run down the page and months across. Select a date to open that show’s card below its year. A dimmed date is listed with sources but its card isn’t indexed yet.</p>
${gridHtml(s, shows, years)}`;
  }

  async function openShow(sh: ShowRef, scroll = true) {
    state.show = sh;
    if (sh.series) {
      state.series = sh.series;
      state.promotion = sh.series.promotion;
    }
    if (state.year !== 'all' && !sh.date.startsWith(state.year)) state.year = 'all';
    render();
    pointAtChip();
    ctx.changed();
    if (scroll) scrollToShow();
    const year = sh.date.slice(0, 4);
    const [rows, moments] = await Promise.all([loadShowDetails(year), loadDetails(year)]);
    for (const [id, row] of Object.entries(rows)) showDetails.set(id, row);
    for (const [id, row] of Object.entries(moments)) details.set(id, row);
    if (state.show !== sh) return;
    const panel = root.querySelector<HTMLElement>('.show-detail');
    if (panel) panel.innerHTML = showHtml(sh);
    pointAtChip();
    announce(`${sh.name}, ${fmtDate(sh.date, true)}`);
  }
  /** Points the panel's arrow at the selected date. */
  function pointAtChip() {
    const panel = root.querySelector<HTMLElement>('.show-detail');
    const chip = root.querySelector<HTMLElement>('.show-chip.active');
    if (!panel || !chip) return;
    const x = chip.getBoundingClientRect().left + chip.offsetWidth / 2 - panel.getBoundingClientRect().left;
    panel.style.setProperty('--pointer', `${Math.max(18, Math.min(panel.offsetWidth - 18, x))}px`);
  }
  function scrollToShow() {
    requestAnimationFrame(() => {
      const row = root.querySelector<HTMLElement>('.show-year.open');
      if (!row) return;
      const top = row.getBoundingClientRect().top + window.scrollY - ctx.stickyHeight() - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  // ---------- Events ----------
  tabs.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-promotion]');
    if (!b || b.dataset.promotion === state.promotion) return;
    state.promotion = b.dataset.promotion!;
    state.series = null;
    state.show = null;
    state.year = 'all';
    render();
    ctx.changed();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const series = t.closest<HTMLElement>('[data-series]');
    if (series) {
      state.series = model.seriesById.get(series.dataset.series!) ?? state.series;
      state.show = null;
      state.year = 'all';
      render();
      ctx.changed();
      return;
    }
    const chip = t.closest<HTMLElement>('[data-show]');
    if (chip) {
      const sh = model.showById.get(chip.dataset.show!);
      if (!sh) return;
      if (sh === state.show && chip.classList.contains('show-chip')) {
        state.show = null;
        render();
        ctx.changed();
        return;
      }
      void openShow(sh);
      return;
    }
    if (t.closest('.panel-close')) {
      state.show = null;
      render();
      ctx.changed();
      return;
    }
    const person = t.closest<HTMLElement>('.chip[data-person]');
    if (person) return ctx.go(`/wrestlers/${model.people[Number(person.dataset.person)].id}/`);
    const moment = t.closest<HTMLElement>('[data-moment]');
    if (moment) return ctx.go(`/${query({ moment: moment.dataset.moment })}`);
  });
  root.addEventListener('change', (e) => {
    const select = (e.target as Element).closest<HTMLSelectElement>('[data-control="show-year"]');
    if (!select) return;
    state.year = select.value;
    if (state.show && state.year !== 'all' && !state.show.date.startsWith(state.year)) state.show = null;
    render();
    ctx.changed();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.show) {
      state.show = null;
      render();
      ctx.changed();
    }
  });

  return {
    el,
    tab: '/shows/',
    show: () => {
      if (!root.childElementCount) render();
    },
    hide: () => {},
    apply: (p: Params) => {
      const sh = p.show ? model.showById.get(p.show) : undefined;
      if (sh) {
        state.year = 'all';
        void openShow(sh, false).then(() => {
          const row = root.querySelector<HTMLElement>('.show-year.open');
          if (row) window.scrollTo({ top: Math.max(0, row.getBoundingClientRect().top + window.scrollY - ctx.stickyHeight() - 12), behavior: 'auto' });
        });
        return;
      }
      state.show = null;
      const s = p.series ? model.seriesById.get(p.series) : undefined;
      if (s) {
        state.promotion = s.promotion;
        state.series = s;
      } else {
        state.promotion = promotions.some((x) => x.id === p.promotion) ? p.promotion! : promotions[0].id;
        state.series = null;
      }
      state.year = p.year && /^\d{4}$/.test(p.year) ? p.year : 'all';
      render();
    },
    address: () => {
      if (state.show) return `/shows/${state.show.id}/`;
      if (state.series) {
        const isDefault = state.series === seriesOf(state.promotion)[0];
        const base = isDefault && state.year === 'all' ? (state.promotion === promotions[0].id ? '/shows/' : `/shows/${state.promotion}/`) : `/shows/${state.series.id}/`;
        return `${base}${query({ year: state.year === 'all' ? undefined : state.year })}`;
      }
      return state.promotion === promotions[0].id ? '/shows/' : `/shows/${state.promotion}/`;
    },
    subject: () => (state.show ? `${state.show.name}, ${fmtDate(state.show.date)}` : state.series ? `${state.series.name} shows` : `${model.promotions.get(state.promotion)?.name ?? ''} shows`),
  };
}
