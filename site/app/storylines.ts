// Storylines: each promotion's storylines as lanes on one timeline, with the same scrub bar as
// Careers. Select a storyline for its recap, or a mark for that chapter's story and source.
import { announce, esc, fmtDate, frameThrottle, plural, reducedMotion } from './dom.ts';
import { loadDetails } from './data.ts';
import { dayNum, isoDay, type DetailRow, type Model, type StorylineBundle } from './model.ts';
import { createNavigator } from './navigator.ts';
import { chapterChoice, chapterPanel, chapterPreview, recapPanel, type Chapter, type Story, type StoryPromotion } from './panels.ts';
import { STAR } from './ui.ts';

const ROW = 112; // lane height
const RAIL = 62; // rail position inside a lane
const GROUP_PX = 40; // chapters closer than this share a mark, as in v69
const MONTH_PX = 100; // width of a month at the month-by-month scale

const FOOTNOTES: Record<string, string> = {
  wwe: 'Selected major feuds and story arcs from WWE history, the WWWF and WWF years included. WCW and the original ECW keep their own collections; the 2001 Invasion belongs to WWE programming.',
  aew: 'Selected major feuds, teams, factions and championship arcs from AEW’s 2019 launch onward.',
  tna: 'Selected major rivalries, Knockouts stories, tag teams, factions and championship arcs from TNA and Impact, 2002 onward.',
  njpw: 'Selected major rivalries, junior heavyweight and tag team stories, factions and championship arcs from NJPW’s 1972 founding onward.',
  wcw: 'Selected major rivalries, factions, cruiserweight, women’s and tag team stories, from the Jim Crockett Promotions roots in 1987 to the final Nitro on March 26, 2001.',
  ecw: 'Selected major rivalries, teams, factions and championship arcs from Eastern Championship Wrestling in 1992 to the original ECW’s final event on January 13, 2001. WWE’s later ECW brand is separate.',
};
const FOOTNOTE =
  'Each bar runs from the first to the last researched milestone. That isn’t a definitive start and end, and a gap doesn’t mean the story stopped. Stories still going run through the archive date. Select a moment to read its source.';

export interface StorylinesState {
  promotion?: string;
  story?: string;
  chapter?: string;
  period?: string;
}

export interface StorylinesOptions {
  model: Model;
  bundle: StorylineBundle;
  root: HTMLElement;
  controls: { tabs: HTMLElement; brand: HTMLSelectElement; period: HTMLSelectElement; order: HTMLSelectElement; scale: HTMLSelectElement };
  stickyHeight(): number;
  /** "Open connected careers": the chapter's archived moment on the Careers timeline. */
  openMoment(id: string): void;
  openPerson(id: string): void;
  changed?(): void;
}

type Group = { x: number; cs: Chapter[] };

export function createStorylines(o: StorylinesOptions) {
  const { model, bundle, root, controls } = o;
  const asOf = dayNum(model.asOf);
  const byId = new Map(bundle.storylines.map((s) => [s.id, s]));
  const dayOf = new Map<Chapter, number>();
  for (const s of bundle.storylines) for (const c of s.chapters) dayOf.set(c, dayNum(c.date));
  const bounds = (s: Story) => ({ start: dayNum(s.start), end: s.end ? dayNum(s.end) : asOf });

  const state = {
    promotion: bundle.promotions[0].id,
    brand: 'all',
    period: 'all',
    order: 'oldest' as 'oldest' | 'newest',
    scale: 'overview' as 'overview' | 'months',
    focus: null as Story | null,
    selected: null as { story: Story; chapter: Chapter | null; group: Chapter[] } | null,
    from: 0,
    to: 0,
    previous: null as { period: string; scale: 'overview' | 'months'; from: number; to: number; scroll: number; ids: string[] } | null,
  };
  const details = new Map<string, DetailRow>();

  root.innerHTML = `<div class="explorer-head"><div><h1 class="view-title"></h1><p class="view-subtitle"></p></div>
<div class="head-controls"><button type="button" class="restore" hidden>All storylines</button></div></div>
<p class="range-hint"></p>
<div class="axis"><div class="axis-name">Storyline</div><div class="ticks"></div></div>
<div class="story-lanes"><div class="grid" aria-hidden="true"></div><div class="story-rows"></div></div>
<p class="story-footnote"></p>`;
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const lanes = q('.story-lanes');
  const rowsEl = q('.story-rows');
  const grid = q('.grid');
  const ticksEl = q('.ticks');

  // ---------- Geometry ----------
  let geometry = { width: 1000, left: 280, right: 980 };
  const measure = () => {
    const width = lanes.clientWidth || 1000;
    const label = parseFloat(getComputedStyle(root).getPropertyValue('--label-w')) || 260;
    geometry = { width, left: label + 20, right: width - 26 };
  };
  const xPos = (day: number) => geometry.left + ((day - state.from) / Math.max(1, state.to - state.from)) * (geometry.right - geometry.left);

  // ---------- Which storylines and dates ----------
  const promotion = (): StoryPromotion => bundle.promotions.find((p) => p.id === state.promotion) ?? bundle.promotions[0];
  const pool = () => bundle.storylines.filter((s) => s.promotion === state.promotion);
  const span = (list: Story[]): [number, number] => {
    if (!list.length) return [asOf - 3650, asOf];
    return [Math.min(...list.map((s) => bounds(s).start)), Math.max(...list.map((s) => bounds(s).end))];
  };
  /** A storyline's span with a little room either side, as in v69. */
  const focusRange = (s: Story): [number, number] => {
    const b = bounds(s);
    const pad = Math.min(180, Math.max(21, Math.round((b.end - b.start) * 0.035)));
    return [b.start - pad, Math.min(asOf, b.end + 14)];
  };
  const periodRange = (period: string): [number, number] => {
    if (period === 'all') return state.focus ? focusRange(state.focus) : span(pool());
    const year = parseInt(period, 10);
    const last = period.endsWith('s') ? year + 9 : year;
    return [dayNum(`${year}-01-01`), Math.min(asOf, dayNum(`${last}-12-31`))];
  };
  /** The navigator covers the whole collection (or the focused storyline), and the range in view. */
  const navDomain = (): [number, number] => {
    const [a, b] = state.focus ? focusRange(state.focus) : span(pool());
    return [Math.min(a, state.from), Math.max(b, state.to)];
  };
  /** Month by month: about a hundred pixels a month from the start of the range. */
  function applyScale() {
    if (state.scale !== 'months') return;
    const [first, last] = navDomain();
    const months = Math.max(1, Math.floor((geometry.right - geometry.left) / MONTH_PX));
    const length = Math.round(months * 30.44);
    state.to = Math.min(last, state.from + length);
    state.from = Math.max(first, state.to - length);
  }

  const brandOk = (s: Story) => state.brand === 'all' || s.brands.includes(state.brand);
  function visibleStories(): Story[] {
    const keep = state.focus && state.previous ? new Set([...state.previous.ids, state.focus.id]) : null;
    return pool()
      .filter((s) => brandOk(s) && (keep ? keep.has(s.id) : bounds(s).start <= state.to && bounds(s).end >= state.from))
      .sort((a, b) => (state.order === 'newest' ? -1 : 1) * (bounds(a).start - bounds(b).start) || a.title.localeCompare(b.title));
  }

  // ---------- Marks ----------
  const kindCode = (c: Chapter) => (c.kind === 'title' ? 1 : c.kind === 'match' ? 0 : 2);
  const rank = (c: Chapter) => (c.ple ? 4 : c.kind === 'title' ? 3 : c.kind === 'match' ? 2 : 1);
  function representative(cs: Chapter[]): Chapter {
    const counts = [0, 0, 0, 0, 0];
    for (const c of cs) counts[rank(c)]++;
    let best = 1;
    for (let k = 2; k <= 4; k++) if (counts[k] >= counts[best]) best = k;
    return cs.find((c) => rank(c) === best)!;
  }
  function groupsFor(s: Story): Group[] {
    const groups: Group[] = [];
    for (const c of s.chapters) {
      const d = dayOf.get(c)!;
      if (d < state.from || d > state.to) continue;
      const x = xPos(d);
      const last = groups.at(-1);
      if (last && x - last.x < GROUP_PX) {
        last.cs.push(c);
        last.x = last.cs.reduce((sum, e) => sum + xPos(dayOf.get(e)!), 0) / last.cs.length;
      } else groups.push({ x, cs: [c] });
    }
    return groups;
  }

  function rowHtml(s: Story): string {
    const b = bounds(s);
    const groups = groupsFor(s);
    const count = groups.reduce((n, g) => n + g.cs.length, 0);
    const focused = state.focus?.id === s.id || state.selected?.story === s;
    const muted = (state.focus || state.selected) && !focused;
    let bar = '';
    if (b.start <= state.to && b.end >= state.from) {
      const clipStart = b.start < state.from;
      const clipEnd = b.end > state.to;
      const left = xPos(Math.max(b.start, state.from));
      const right = xPos(Math.min(b.end, state.to));
      const startLabel = clipStart ? `Indexed from ${fmtDate(s.start)}` : `First milestone ${fmtDate(s.start)}`;
      const endLabel = clipEnd ? 'Continues beyond this view' : s.end ? `Last milestone ${fmtDate(s.end)}` : `Through ${fmtDate(model.asOf)}`;
      // The first milestone is labelled above the bar where it starts, the last one below where it ends.
      const startX = Math.max(geometry.left - 8, Math.min(left - 8, geometry.right - (startLabel.length * 6.4 + 8)));
      const endX = Math.min(geometry.right + 8, Math.max(right + 8, geometry.left + endLabel.length * 6.4));
      bar = `<div class="story-span${s.end ? '' : ' open'}${clipStart ? ' clip-start' : ''}${clipEnd ? ' clip-end' : ''}" style="left:${left.toFixed(1)}px;width:${Math.max(2, right - left).toFixed(1)}px;top:${RAIL - 3}px" role="img" aria-label="${esc(`${s.title}: ${startLabel}. ${endLabel}.`)}"></div>
<span class="story-span-label" style="left:${startX.toFixed(1)}px;top:${RAIL - 36}px">${esc(startLabel)}</span>
<span class="story-span-label end" style="left:${endX.toFixed(1)}px;top:${RAIL + 14}px">${esc(endLabel)}</span>`;
    }
    const nodes = groups
      .map((g) => {
        const active = state.selected?.story === s && (state.selected.chapter ? g.cs.includes(state.selected.chapter) : state.selected.group === g.cs || sameGroup(state.selected.group, g.cs));
        const pick = (state.selected?.chapter && g.cs.includes(state.selected.chapter) ? state.selected.chapter : null) ?? representative(g.cs);
        const cls = ['node', `k${kindCode(pick)}`, pick.ple ? 'ple' : '', g.cs.length > 1 ? 'multi' : '', active ? 'active' : ''].filter(Boolean).join(' ');
        const label = g.cs.map((c) => `${fmtDate(c.date)}: ${c.title}`).join('; ');
        return `<button type="button" class="${cls}" style="left:${(g.x - 15).toFixed(1)}px;width:30px;top:${RAIL - 22}px" data-story-id="${esc(s.id)}" data-cs="${esc(g.cs.map((c) => c.id).join(','))}"${g.cs.length > 1 ? ` data-count="${g.cs.length}"` : ''} aria-label="${esc(`${s.title}. ${label}`)}">${pick.ple ? STAR : ''}</button>`;
      })
      .join('');
    const years = `${s.start.slice(0, 4)}${(s.end || model.asOf).slice(0, 4) !== s.start.slice(0, 4) ? `–${(s.end || model.asOf).slice(0, 4)}` : ''}`;
    return `<section class="story-row${focused ? ' focused' : ''}${muted ? ' muted' : ''}" data-row="${esc(s.id)}" style="height:${ROW}px">
<button type="button" class="story-name" data-story-name="${esc(s.id)}" aria-pressed="${state.focus?.id === s.id}"><strong>${esc(s.title)}</strong><small>${years}, ${plural(count, 'chapter')}${count !== s.chapters.length ? ` of ${s.chapters.length}` : ''}</small></button>
<div class="rail" style="top:${RAIL}px"></div>${bar}${nodes}${groups.length ? '' : `<span class="no-moments" style="left:${geometry.left}px;top:${RAIL - 9}px">No indexed chapters in these dates</span>`}
</section>`;
  }
  const sameGroup = (a: Chapter[], b: Chapter[]) => a.length === b.length && a.every((c, i) => c === b[i]);

  // ---------- Axis ----------
  function paintTicks() {
    const fromIso = isoDay(state.from);
    const toIso = isoDay(state.to);
    const fy = Number(fromIso.slice(0, 4));
    const ty = Number(toIso.slice(0, 4));
    const room = Math.max(2, Math.floor((geometry.right - geometry.left) / 78));
    const days = state.to - state.from;
    const ticks: { d: string; text: string; year?: string }[] = [];
    if (days < 1100) {
      const months: string[] = [];
      for (let y = fy; y <= ty; y++)
        for (let m = 1; m <= 12; m++) {
          const d = `${y}-${String(m).padStart(2, '0')}-01`;
          if (d >= fromIso && d <= toIso) months.push(d);
        }
      const every = Math.max(1, Math.ceil(months.length / room));
      months.forEach((d, i) => {
        if (i % every) return;
        const m = new Date(`${d}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        ticks.push({ d, text: d.endsWith('-01-01') || i === 0 ? `${m} ${d.slice(0, 4)}` : m });
      });
    } else {
      const step = [1, 2, 5, 10, 20].find((st) => (ty - fy) / st <= room) ?? 25;
      for (let y = Math.ceil(fy / step) * step; y <= ty; y += step) {
        const d = `${y}-01-01`;
        if (d >= fromIso && d <= toIso) ticks.push({ d, text: String(y), year: String(y) });
      }
    }
    const clickable = state.period === 'all' && !state.focus;
    ticksEl.innerHTML = ticks
      .map((t) => {
        const x = xPos(dayNum(t.d)).toFixed(1);
        return clickable && t.year ? `<button type="button" class="tick year-tick" style="left:${x}px" data-year="${t.year}" aria-label="Show ${t.year}">${t.text}</button>` : `<span class="tick" style="left:${x}px">${t.text}</span>`;
      })
      .join('');
    grid.innerHTML = ticks.map((t) => `<i style="left:${xPos(dayNum(t.d)).toFixed(1)}px"></i>`).join('');
  }

  const nav = createNavigator({
    label: 'Storyline dates: zoom and move',
    domain: navDomain,
    range: () => [state.from, state.to],
    change: (from, to, final) => {
      state.from = from;
      state.to = to;
      state.period = 'all';
      state.scale = 'overview';
      root.classList.toggle('scrubbing', !final);
      refresh(final ? 'settle' : 'drag');
    },
    density: () => {
      const [first, last] = navDomain();
      const bins = new Array(240).fill(0);
      for (const s of state.focus ? [state.focus] : pool().filter(brandOk))
        for (const c of s.chapters) {
          const d = dayOf.get(c)!;
          if (d >= first && d <= last) bins[Math.min(239, Math.floor(((d - first) / Math.max(1, last - first)) * 240))]++;
        }
      return bins;
    },
  });
  q('.axis').appendChild(nav.el);

  // ---------- Panel ----------
  let panelToken = 0;
  function panelHtml(): { html: string; after: Story; anchor: number } | null {
    const sel = state.selected;
    if (sel) {
      const anchorDay = sel.chapter ? dayOf.get(sel.chapter)! : dayOf.get(sel.group[0])!;
      const html = sel.chapter ? chapterPanel(model, sel.story, sel.chapter, sel.chapter.moment ? details.get(sel.chapter.moment) : undefined) : chapterChoice(sel.story, sel.group);
      return { html, after: sel.story, anchor: Math.max(geometry.left, Math.min(geometry.right, xPos(anchorDay))) };
    }
    if (state.focus) return { html: recapPanel(model, promotion(), state.focus), after: state.focus, anchor: (geometry.left - 20) / 2 };
    return null;
  }
  function placePanel(panel: HTMLElement, anchor: number) {
    const viewport = lanes.clientWidth;
    const width = Math.min(620, viewport - 24);
    const left = Math.max(12, Math.min(viewport - width - 12, anchor - width * 0.5));
    panel.style.width = `${width}px`;
    panel.style.marginLeft = `${left}px`;
    panel.style.setProperty('--pointer', `${Math.max(18, Math.min(width - 18, anchor - left))}px`);
  }
  /** Ratings for a chapter that links to an archived match, loaded when it opens. */
  async function loadChapterDetails(c: Chapter) {
    if (!c.moment || details.has(c.moment)) return;
    const token = ++panelToken;
    const rows = await loadDetails(c.date.slice(0, 4));
    for (const [id, row] of Object.entries(rows)) details.set(id, row);
    if (token === panelToken && state.selected?.chapter === c) refresh('settle');
  }

  // ---------- Head, controls and footnote ----------
  function syncHead(list: Story[]) {
    const p = promotion();
    q('.view-title').textContent = state.focus ? state.focus.title : `${p.name} storylines`;
    q('.view-subtitle').textContent = state.focus
      ? `${p.name}. ${plural(state.focus.chapters.length, 'chapter')}. Select a mark for its story and source.`
      : `${plural(list.length, 'storyline')}, ${state.order === 'oldest' ? 'oldest' : 'newest'} first. Select a storyline for its recap, or a mark for that moment’s story and source.`;
    q('.range-hint').textContent = `${fmtDate(isoDay(state.from))} to ${fmtDate(isoDay(state.to))}. Selected chapters only. Drag the bar or scroll sideways to move through time.`;
    q('.restore').hidden = !state.focus && !state.selected;
    q('.story-footnote').textContent = `${FOOTNOTES[p.id] ?? ''} ${FOOTNOTE}`;
    for (const b of controls.tabs.querySelectorAll<HTMLElement>('[data-promotion]')) b.setAttribute('aria-pressed', String(b.dataset.promotion === p.id));
    controls.brand.closest('label')!.hidden = p.id !== 'wwe';
    controls.order.value = state.order;
    controls.scale.value = state.scale;
    controls.brand.value = state.brand;
    syncPeriods();
  }
  let periodKey = '';
  function syncPeriods() {
    const [a, b] = state.focus ? [bounds(state.focus).start, bounds(state.focus).end] : span(pool());
    const first = Number(isoDay(a).slice(0, 4));
    const last = Number(isoDay(b).slice(0, 4));
    const key = `${state.promotion}:${state.focus?.id ?? ''}:${first}:${last}`;
    if (key !== periodKey) {
      const decades: number[] = [];
      for (let y = Math.floor(first / 10) * 10; y <= last; y += 10) decades.push(y);
      const years: number[] = [];
      for (let y = first; y <= last; y++) years.push(y);
      controls.period.innerHTML = `<option value="all">${state.focus ? 'Whole storyline' : 'Full history'}</option><optgroup label="Decades">${decades.map((y) => `<option value="${y}s">${y}s</option>`).join('')}</optgroup><optgroup label="Years">${years.map((y) => `<option value="${y}">${y}</option>`).join('')}</optgroup>`;
      periodKey = key;
    }
    controls.period.value = [...controls.period.options].some((x) => x.value === state.period) ? state.period : 'all';
  }

  // ---------- The render cycle ----------
  /** The lane to hold still while the range changes, as on the Careers timeline. */
  function anchorRow(): { id: string; screen: number } | null {
    const target = state.selected?.story.id ?? state.focus?.id;
    const rows = [...rowsEl.querySelectorAll<HTMLElement>('.story-row')];
    let row = target ? rows.find((r) => r.dataset.row === target) : undefined;
    if (!row) {
      const top = o.stickyHeight() + q('.axis').offsetHeight;
      row = rows.find((r) => r.getBoundingClientRect().bottom > top);
    }
    return row ? { id: row.dataset.row!, screen: row.getBoundingClientRect().top } : null;
  }

  let stale = false;
  function refresh(mode: 'full' | 'drag' | 'settle' = 'full') {
    if (root.closest('[hidden]')) {
      stale = true;
      return;
    }
    stale = false;
    const anchor = mode === 'full' ? null : anchorRow();
    measure();
    const list = visibleStories();
    const panel = panelHtml();
    rowsEl.innerHTML =
      list
        .map((s) => rowHtml(s) + (panel && panel.after === s ? `<section class="detail inline" aria-label="${state.selected ? 'Selected chapter' : 'Storyline recap'}">${panel.html}</section>` : ''))
        .join('') || `<p class="story-empty">No storylines in these dates${state.brand !== 'all' ? ` on ${esc(state.brand)}` : ''}. Try a wider period or another brand.</p>`;
    const panelEl = rowsEl.querySelector<HTMLElement>('.detail');
    if (panel && panelEl) placePanel(panelEl, panel.anchor);
    paintTicks();
    syncHead(list);
    nav.sync();
    if (anchor) {
      const row = rowsEl.querySelector<HTMLElement>(`[data-row="${CSS.escape(anchor.id)}"]`);
      if (row) {
        const shift = row.getBoundingClientRect().top - anchor.screen;
        if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
      }
    }
    if (mode !== 'drag') {
      nav.drawDensity();
      o.changed?.();
    }
  }

  function scrollToRow(id: string | undefined, instant = false) {
    if (!id) return;
    requestAnimationFrame(() => {
      const row = rowsEl.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
      if (!row) return;
      const y = row.getBoundingClientRect().top + window.scrollY - o.stickyHeight() - q('.axis').offsetHeight - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  // ---------- Actions ----------
  function setPeriod(period: string) {
    state.period = period;
    [state.from, state.to] = periodRange(period);
    measure();
    applyScale();
    state.selected = null;
  }

  function focus(s: Story) {
    if (state.focus === s && !state.selected) return clearFocus();
    if (!state.previous) state.previous = { period: state.period, scale: state.scale, from: state.from, to: state.to, scroll: window.scrollY, ids: visibleStories().map((x) => x.id) };
    state.focus = s;
    state.selected = null;
    state.scale = 'overview';
    setPeriod('all');
    refresh();
    scrollToRow(s.id);
    announce(`${s.title}. Recap open; select a mark for its story and source.`);
  }

  function clearFocus() {
    const prev = state.previous;
    state.focus = null;
    state.selected = null;
    state.previous = null;
    if (prev) {
      state.period = prev.period;
      state.scale = prev.scale;
      state.from = prev.from;
      state.to = prev.to;
    } else setPeriod(state.period);
    refresh();
    if (prev) window.scrollTo({ top: prev.scroll, behavior: 'auto' });
    announce('Storyline closed. Previous view restored.');
  }

  function selectChapter(s: Story, c: Chapter | null, group: Chapter[]) {
    state.selected = { story: s, chapter: c, group };
    if (c) {
      const d = dayOf.get(c)!;
      if (d < state.from || d > state.to) {
        const len = state.to - state.from;
        state.from = Math.max(navDomain()[0], d - Math.round(len / 2));
        state.to = state.from + len;
      }
      void loadChapterDetails(c);
    }
    refresh();
    requestAnimationFrame(() => {
      const panel = rowsEl.querySelector<HTMLElement>('.detail');
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const top = o.stickyHeight() + q('.axis').offsetHeight;
      if (rect.top < top || rect.top > window.innerHeight - 160) {
        window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - top - 140), behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    });
    if (c) announce(`${c.title}. ${fmtDate(c.date, true)}.`);
  }

  function setPromotion(id: string) {
    if (!bundle.promotions.some((p) => p.id === id)) return;
    state.promotion = id;
    state.brand = 'all';
    state.focus = null;
    state.selected = null;
    state.previous = null;
    state.scale = 'overview';
    setPeriod('all');
  }

  // ---------- Hover preview ----------
  const preview = document.createElement('div');
  preview.className = 'moment-preview';
  preview.hidden = true;
  preview.setAttribute('role', 'dialog');
  preview.setAttribute('aria-label', 'Chapters at this point');
  document.body.appendChild(preview);
  let previewFor: HTMLElement | null = null;
  let hideTimer = 0;
  const hidePreview = () => {
    clearTimeout(hideTimer);
    preview.hidden = true;
    previewFor = null;
  };
  const deferHide = () => {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hidePreview, 260);
  };
  const chaptersOf = (node: HTMLElement) => {
    const s = byId.get(node.dataset.storyId!)!;
    const ids = node.dataset.cs!.split(',');
    return { s, cs: s.chapters.filter((c) => ids.includes(c.id)) };
  };
  function showPreview(node: HTMLElement) {
    clearTimeout(hideTimer);
    previewFor = node;
    const { cs } = chaptersOf(node);
    preview.innerHTML = chapterPreview(cs);
    preview.hidden = false;
    const rect = node.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    preview.style.width = `${width}px`;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const height = preview.offsetHeight;
    const below = rect.bottom + 10 + height <= window.innerHeight - 12 || rect.top - height - 10 < 0;
    preview.style.left = `${left}px`;
    preview.style.top = `${Math.max(12, below ? rect.bottom + 10 : rect.top - height - 10)}px`;
  }
  preview.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  preview.addEventListener('pointerleave', deferHide);
  preview.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-chapter]');
    if (!b || !previewFor) return;
    const { s, cs } = chaptersOf(previewFor);
    hidePreview();
    const c = s.chapters.find((x) => x.id === b.dataset.chapter);
    if (c) selectChapter(s, c, cs);
  });
  window.addEventListener('scroll', hidePreview, { passive: true });

  // ---------- Events ----------
  // A mark that was just selected gets redrawn under the pointer; it shows no preview until the
  // pointer leaves it.
  let quietMark: string | null = null;
  const markKey = (node: HTMLElement) => `${node.dataset.storyId}:${node.dataset.cs}`;
  root.addEventListener('pointerover', (e) => {
    const node = (e.target as Element).closest<HTMLElement>('.node');
    if (node && e.pointerType !== 'touch' && node !== previewFor && markKey(node) !== quietMark) showPreview(node);
  });
  root.addEventListener('pointerout', (e) => {
    const node = (e.target as Element).closest<HTMLElement>('.node');
    if (!node || node.contains(e.relatedTarget as Node)) return;
    deferHide();
    if (markKey(node) === quietMark) quietMark = null;
  });
  root.addEventListener('focusin', (e) => {
    const node = (e.target as Element).closest<HTMLElement>('.node');
    if (node && node.matches(':focus-visible')) showPreview(node);
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const node = t.closest<HTMLElement>('.node');
    if (node) {
      hidePreview();
      quietMark = markKey(node);
      const { s, cs } = chaptersOf(node);
      selectChapter(s, cs.length === 1 ? cs[0] : null, cs);
      return;
    }
    const name = t.closest<HTMLElement>('[data-story-name]');
    if (name) return focus(byId.get(name.dataset.storyName!)!);
    const chapter = t.closest<HTMLElement>('[data-chapter]');
    if (chapter) {
      const s = state.selected?.story ?? state.focus;
      const c = s?.chapters.find((x) => x.id === chapter.dataset.chapter);
      if (s && c) selectChapter(s, c, state.selected?.group ?? [c]);
      return;
    }
    const moment = t.closest<HTMLElement>('[data-open-moment]');
    if (moment) return o.openMoment(moment.dataset.openMoment!);
    const chip = t.closest<HTMLElement>('.chip[data-person], .cast-person[data-person]');
    if (chip) return o.openPerson(model.people[Number(chip.dataset.person)].id);
    if (t.closest('[data-recap]') && state.selected) {
      const s = state.selected.story;
      state.selected = null;
      if (state.focus !== s) return focus(s);
      return refresh();
    }
    const year = t.closest<HTMLElement>('.year-tick');
    if (year) {
      setPeriod(year.dataset.year!);
      refresh();
      announce(`Storylines in ${year.dataset.year}`);
      return;
    }
    if (t.closest('.panel-close')) {
      if (state.selected && state.focus) {
        state.selected = null;
        refresh();
      } else if (state.selected) {
        state.selected = null;
        refresh();
      } else clearFocus();
      return;
    }
    if (t.closest('.restore')) return clearFocus();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (!state.selected && !state.focus)) return;
    if (state.selected) {
      state.selected = null;
      refresh();
    } else clearFocus();
  });

  controls.tabs.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-promotion]');
    if (!b) return;
    setPromotion(b.dataset.promotion!);
    refresh();
    announce(`${promotion().name} storylines`);
  });
  controls.brand.addEventListener('change', () => {
    state.brand = controls.brand.value;
    state.selected = null;
    refresh();
  });
  controls.period.addEventListener('change', () => {
    setPeriod(controls.period.value);
    refresh();
  });
  controls.order.addEventListener('change', () => {
    state.order = controls.order.value as 'oldest' | 'newest';
    refresh();
  });
  controls.scale.addEventListener('change', () => {
    state.scale = controls.scale.value as 'overview' | 'months';
    if (state.scale === 'overview') [state.from, state.to] = periodRange(state.period);
    else applyScale();
    refresh();
  });

  // Sideways scrolling moves through time; pinch or ctrl-scroll zooms around the pointer.
  let wheelTimer = 0;
  const throttledDrag = frameThrottle(() => refresh('drag'));
  lanes.addEventListener(
    'wheel',
    (e) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!sideways && !e.ctrlKey) return;
      e.preventDefault();
      const [first, last] = navDomain();
      const len = state.to - state.from;
      if (e.ctrlKey) {
        const x = e.clientX - lanes.getBoundingClientRect().left;
        const at = state.from + ((x - geometry.left) / (geometry.right - geometry.left)) * len;
        const next = Math.max(7, Math.min(last - first, len * Math.exp(e.deltaY * 0.01)));
        const ratio = (at - state.from) / len;
        state.from = Math.round(Math.max(first, at - ratio * next));
        state.to = Math.round(Math.min(last, state.from + next));
      } else {
        const delta = ((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / (geometry.right - geometry.left)) * len;
        const move = Math.max(first - state.from, Math.min(last - state.to, delta));
        state.from = Math.round(state.from + move);
        state.to = Math.round(state.to + move);
      }
      state.period = 'all';
      root.classList.add('scrubbing');
      throttledDrag();
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        root.classList.remove('scrubbing');
        refresh('settle');
      }, 180);
    },
    { passive: false },
  );
  let lastWidth = 0;
  new ResizeObserver(
    frameThrottle(() => {
      if (lanes.clientWidth === lastWidth) return;
      lastWidth = lanes.clientWidth;
      refresh('settle');
    }),
  ).observe(lanes);

  // ---------- State for the URL ----------
  function getState(): StorylinesState {
    const out: StorylinesState = {};
    if (state.promotion !== bundle.promotions[0].id) out.promotion = state.promotion;
    const story = state.selected?.story ?? state.focus;
    if (story) {
      out.story = story.id;
      delete out.promotion;
    }
    if (state.selected?.chapter) out.chapter = state.selected.chapter.id;
    if (state.period !== 'all') out.period = state.period;
    return out;
  }

  function apply(s: StorylinesState) {
    const story = s.story ? byId.get(s.story) : undefined;
    setPromotion(story?.promotion ?? s.promotion ?? bundle.promotions[0].id);
    if (story) {
      state.previous = { period: 'all', scale: 'overview', from: state.from, to: state.to, scroll: 0, ids: visibleStories().map((x) => x.id) };
      state.focus = story;
      setPeriod('all');
      const c = s.chapter ? story.chapters.find((x) => x.id === s.chapter) : undefined;
      if (c) {
        state.selected = { story, chapter: c, group: [c] };
        void loadChapterDetails(c);
      }
    } else if (s.period && /^\d{4}s?$/.test(s.period)) setPeriod(s.period);
    refresh();
    if (story) scrollToRow(story.id, true);
  }

  setPromotion(state.promotion);

  return {
    refresh,
    show: () => {
      if (stale || !rowsEl.childElementCount) refresh();
    },
    apply,
    getState,
    focus: (id: string) => {
      const s = byId.get(id);
      if (!s) return;
      if (s.promotion !== state.promotion) setPromotion(s.promotion);
      focus(s);
    },
    subject: () => {
      const story = state.selected?.story ?? state.focus;
      return story ? story.title : `${promotion().name} storylines`;
    },
    hidePreview,
  };
}

export type Storylines = ReturnType<typeof createStorylines>;
