// Calendar: the wrestling year week by week, one row per promotion, with its premium live
// events, tournaments and weekly shows, and where to watch them.
import { esc, fmtDate, frameThrottle, plural } from './dom.ts';
import type { CalendarBundle, CalendarEvent, Model } from './model.ts';
import { section, type AppContext, type AppView, type Params } from './views.ts';

const DAY = 86400000;
const LABEL = 148;
/** Regular television, as v69 listed it, with where each schedule comes from. */
const WEEKLY_GUIDE: Record<string, { text: string; source: string }> = {
  wwe: { text: 'Raw, Monday 8 PM ET on Netflix. SmackDown, Friday 8 PM ET on USA Network.', source: 'https://www.wwe.com/article/how-to-watch' },
  nxt: { text: 'NXT, Tuesday 8 PM ET on The CW.', source: 'https://www.wwe.com/article/how-to-watch' },
  aaa: { text: 'AAA, Saturday 10 PM ET on YouTube (check regional availability).', source: 'https://www.wwe.com/article/how-to-watch' },
  aew: { text: 'Dynamite, Wednesday 8 PM ET on TBS and HBO Max. Collision, Saturday 8 PM ET on TNT and HBO Max.', source: 'https://www.allelitewrestling.com/aew-how-to-watch' },
  tna: { text: 'Thursday Night iMPACT!, Thursday on AMC and TNA+ (check local listings).', source: 'https://tnawrestling.com/news/tna-wrestling-to-make-history-over-two-special-nights-in-dallas' },
  roh: { text: 'ROH on HonorClub: streaming episodes and replays.', source: 'https://www.ringofhonor.com/' },
};
/** Archived weekly series that fill the calendar's weekly lanes. */
const ARCHIVE_LANES: Record<string, { promotion: string; series: string; watch: string; label: string }> = {
  'wwe/raw': { promotion: 'wwe', series: 'Raw', watch: 'raw', label: 'Raw on Netflix (U.S.)' },
  'wwe/smackdown': { promotion: 'wwe', series: 'SmackDown', watch: 'smackdown', label: 'SmackDown on USA (U.S.)' },
  'wwe/nxt': { promotion: 'nxt', series: 'NXT', watch: 'nxt', label: 'NXT on The CW (U.S.)' },
};
const tidy = (s: string) => s.replace(/\s+·\s+/g, ', ');
const dateNum = (s: string) => Date.parse(`${s}T12:00:00Z`);

/** ISO weeks: week 1 holds January 4. */
function yearBounds(year: number) {
  const monday = (d: number) => d - ((new Date(d).getUTCDay() || 7) - 1) * DAY;
  const start = monday(dateNum(`${year}-01-04`));
  const end = monday(dateNum(`${year + 1}-01-04`));
  return { start, end, weeks: Math.round((end - start) / (7 * DAY)) };
}

export function createCalendarView(ctx: AppContext, data: CalendarBundle): AppView {
  const model: Model = ctx.model;
  const state = { promotion: 'all', zoom: 'year' as 'year' | 'weeks', weekly: true };
  const { start, end, weeks } = yearBounds(data.year);

  // Weekly shows: the calendar's own list, plus archived Raw, SmackDown and NXT episodes that year.
  const weekly = new Map<string, CalendarEvent>();
  for (const sh of model.shows) {
    const lane = sh.series ? ARCHIVE_LANES[sh.series.id] : undefined;
    if (!lane || !sh.date.startsWith(String(data.year))) continue;
    weekly.set(`${sh.date}:${lane.series}`, {
      id: `archive-${sh.id}`,
      promotion: lane.promotion,
      series: lane.series,
      date: sh.date,
      name: sh.name,
      kind: 'weekly',
      source: '',
      watch: data.viewing[lane.watch],
      watchLabel: lane.label,
      show: sh.id,
      note: 'Broadcast date. Open the show for its card and results.',
    });
  }
  for (const e of data.weeklyEvents) weekly.set(`${e.date}:${e.series}`, e);
  const weeklyList = [...weekly.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.series ?? '').localeCompare(b.series ?? ''));
  const all = [...data.events, ...weeklyList];
  const byId = new Map(all.map((e) => [e.id, e]));

  const el = section(
    'calendar',
    `<div class="app-tools"><div class="filters">
<label>Promotion<select data-control="cal-promotion"><option value="all">All promotions</option>${data.promotions.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
<div class="mode-switch" role="group" aria-label="Calendar scale"><button type="button" data-zoom="year" aria-pressed="true">Year</button><button type="button" data-zoom="weeks" aria-pressed="false">Week by week</button></div>
<button type="button" class="app-button" data-today>This week</button>
<label class="check"><input type="checkbox" data-control="cal-weekly" checked> Weekly shows</label>
</div></div>
<div class="app-view calendar-view"></div>`,
  );
  const root = el.querySelector<HTMLElement>('.calendar-view')!;
  const promotionSelect = el.querySelector<HTMLSelectElement>('[data-control="cal-promotion"]')!;
  const weeklyBox = el.querySelector<HTMLInputElement>('[data-control="cal-weekly"]')!;

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const shortDate = (s: string) => new Date(dateNum(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  function render() {
    const scroll = root.querySelector<HTMLElement>('.calendar-scroll')?.scrollLeft ?? 0;
    root.innerHTML = `<div class="explorer-head"><div><h1 class="view-title">${data.year} calendar</h1><p class="view-subtitle">Premium live events, tournaments and weekly shows, week by week. Hover or select an event for its date, venue and where to watch.</p></div></div>
<ul class="legend calendar-legend"><li><i class="cal-key major" aria-hidden="true"></i>Major event</li><li><i class="cal-key series" aria-hidden="true"></i>Tournament or multi-week event</li>${state.weekly ? '<li><i class="cal-key weekly" aria-hidden="true"></i>Weekly show</li>' : ''}<li><i class="cal-key now" aria-hidden="true"></i>This week</li></ul>
<details class="lineage-background calendar-guide"><summary>Where to watch past premium live events and full shows</summary><p>U.S. viewing guide, checked ${esc(fmtDate(data.checked))}. Libraries and rights differ by country.</p><div class="guide-grid">${data.viewingGuide
      .map((g) => `<article><h3>${esc(tidy(g.title))}</h3><p>${esc(g.text)}</p><p class="source-links">${g.links.map((l) => `<a href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)}</a>`).join('')}</p></article>`)
      .join('')}</div></details>
<div class="calendar-scroll" tabindex="0" role="region" aria-label="${data.year} wrestling calendar by promotion and week"><div class="calendar-canvas"></div></div>
<p class="story-footnote">${plural(data.events.length, 'major event')} and ${plural(weeklyList.length, 'weekly show')} from ${plural(data.promotions.length, 'promotion and brand', 'promotions and brands')}, checked ${esc(fmtDate(data.checked))}. Major events are a curated list, not every show worldwide, and upcoming dates can change: each event links to its source. Weeks run Monday to Sunday (ISO week numbers). Dashed markers are announced shows or tapings.</p>`;
    layout();
    const scroller = root.querySelector<HTMLElement>('.calendar-scroll')!;
    scroller.scrollLeft = scroll;
    scroller.addEventListener('scroll', () => hidePop(), { passive: true });
  }

  function layout() {
    const scroller = root.querySelector<HTMLElement>('.calendar-scroll');
    const canvas = root.querySelector<HTMLElement>('.calendar-canvas');
    if (!scroller || !canvas) return;
    const week = state.zoom === 'weeks' ? 76 : Math.max(18, ((scroller.clientWidth || 1100) - LABEL) / weeks);
    const width = week * weeks;
    const card = state.zoom === 'weeks' ? 112 : Math.min(84, Math.max(56, week * 3.4));
    const x = (s: string) => ((dateNum(s) - start) / (7 * DAY)) * week;
    canvas.style.width = `${LABEL + width}px`;
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = `${data.year}-${String(i + 1).padStart(2, '0')}-01`;
      const next = i === 11 ? `${data.year + 1}-01-01` : `${data.year}-${String(i + 2).padStart(2, '0')}-01`;
      return `<span style="left:${LABEL + x(d)}px;width:${x(next) - x(d)}px">${new Date(dateNum(d)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>`;
    }).join('');
    let html = `<div class="cal-axis"><div class="cal-axis-label">Promotion <small>Week</small></div><div class="cal-months">${months}</div><div class="cal-weeks">${Array.from(
      { length: weeks },
      (_, i) => `<span style="left:${LABEL + i * week}px;width:${week}px" title="Week ${i + 1}, from ${fmtDate(new Date(start + i * 7 * DAY).toISOString().slice(0, 10))}">${i + 1}</span>`,
    ).join('')}</div></div>`;
    const promotions = data.promotions.filter((p) => state.promotion === 'all' || p.id === state.promotion);
    for (const p of promotions) {
      const events = all.filter((e) => e.promotion === p.id && (state.weekly || e.kind !== 'weekly'));
      // Major events stack into tracks where they would overlap.
      const ends: number[] = [];
      const placed = events
        .filter((e) => e.kind !== 'weekly')
        .map((e) => {
          const multi = !!e.end && dateNum(e.end) - dateNum(e.date) > 7 * DAY;
          const left = Math.max(0, Math.min(width - card, x(e.date) - card / 2));
          const w = multi ? Math.max(card, Math.min(width - left, x(e.end!) - x(e.date))) : card;
          let track = ends.findIndex((n) => n + 8 <= left);
          if (track < 0) track = ends.length;
          ends[track] = left + w;
          return { e, left, w, track, multi };
        });
      const majorHeight = Math.max(118, ends.length * 88 + 22);
      // Weekly shows: one lane per series, markers stacked where two fall in the same week.
      const series = [...new Set(events.filter((e) => e.kind === 'weekly').map((e) => e.series ?? ''))];
      const marker = Math.min(state.zoom === 'weeks' ? 58 : 24, week - 2);
      const markers: { e: CalendarEvent; left: number; top: number }[] = [];
      const lanes: { name: string; top: number; height: number }[] = [];
      let top = majorHeight;
      for (const name of series) {
        const laneEnds: number[] = [];
        for (const e of events.filter((x) => x.kind === 'weekly' && (x.series ?? '') === name)) {
          const center = Math.max(marker / 2 + 2, Math.min(width - marker / 2 - 2, x(e.date)));
          const left = center - marker / 2;
          let track = laneEnds.findIndex((n) => n + 2 <= left);
          if (track < 0) track = laneEnds.length;
          laneEnds[track] = left + marker;
          markers.push({ e, left: center, top: top + track * 36 });
        }
        lanes.push({ name, top, height: Math.max(1, laneEnds.length) * 36 });
        top += Math.max(1, laneEnds.length) * 36;
      }
      const guide = WEEKLY_GUIDE[p.id];
      const height = state.weekly ? top + 40 : majorHeight;
      html += `<section class="cal-row" style="height:${height}px"><div class="cal-promotion"><div class="cal-promotion-main" style="height:${majorHeight}px"><strong>${esc(p.name)}</strong><small>${esc(p.fullName)}</small><a href="${esc(p.schedule)}" rel="noopener" target="_blank">Full schedule</a></div>${
        state.weekly ? lanes.map((l) => `<span class="cal-lane-label" style="top:${l.top}px;height:${l.height}px">${esc(l.name)}</span>`).join('') : ''
      }</div><div class="cal-track" style="width:${width}px">${placed
        .map(
          ({ e, left, w, track, multi }) =>
            `<button type="button" class="cal-event${multi ? ' series' : ''}${e.status === 'scheduled' ? ' scheduled' : ''}" style="left:${left.toFixed(1)}px;top:${12 + track * 88}px;width:${w.toFixed(1)}px" data-event="${esc(e.id)}" aria-label="${esc(`${e.name}, ${fmtDate(e.date, true)}, ${p.name}`)}"><strong>${esc(tidy(e.name))}</strong><small>${shortDate(e.date)}${e.end ? ` to ${shortDate(e.end)}` : ''}</small></button>`,
        )
        .join('')}${markers
        .map(
          ({ e, left, top: t }) =>
            `<button type="button" class="cal-weekly${e.status === 'scheduled' ? ' scheduled' : ''}" style="left:${left.toFixed(1)}px;top:${t}px;width:${marker}px" data-event="${esc(e.id)}" aria-label="${esc(`${e.name}, ${fmtDate(e.date, true)}`)}"><span>${state.zoom === 'weeks' ? shortDate(e.date) : Number(e.date.slice(8))}</span></button>`,
        )
        .join('')}${state.weekly ? `<p class="cal-guide" style="top:${height - 32}px">${guide ? `<a href="${esc(guide.source)}" rel="noopener" target="_blank">${esc(guide.text)}</a>` : `<a href="${esc(p.schedule)}" rel="noopener" target="_blank">Dates vary; see the official schedule</a>`}</p>` : ''}</div></section>`;
    }
    const now = dateNum(today());
    const current = now >= start && now < end;
    if (current) {
      const index = Math.floor((now - start) / (7 * DAY));
      html += `<div class="cal-week-now" style="left:${LABEL + index * week}px;width:${week}px" aria-hidden="true"></div><div class="cal-now" style="left:${LABEL + x(today())}px" role="note" aria-label="This week, week ${index + 1}"><span>This week, ${index + 1}</span></div>`;
    }
    canvas.innerHTML = html;
    el.querySelector<HTMLButtonElement>('[data-today]')!.disabled = !current;
  }

  // ---------- Event details ----------
  const pop = document.createElement('aside');
  pop.className = 'moment-preview cal-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Event details');
  document.body.appendChild(pop);
  let anchor: HTMLElement | null = null;
  let pinned = false;
  let hideTimer = 0;
  function hidePop() {
    clearTimeout(hideTimer);
    pop.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    anchor = null;
    pinned = false;
  }
  function showPop(e: CalendarEvent, button: HTMLElement, pin: boolean) {
    clearTimeout(hideTimer);
    if (pinned && !pin && anchor !== button) return;
    anchor?.setAttribute('aria-expanded', 'false');
    anchor = button;
    pinned = pin || pinned;
    button.setAttribute('aria-expanded', 'true');
    const p = data.promotions.find((x) => x.id === e.promotion);
    const past = (e.end ?? e.date) < today();
    const kind = e.kind === 'weekly' ? (e.status === 'scheduled' ? 'Announced show or taping' : 'Weekly show') : past ? 'Past event' : 'Upcoming event';
    const recaps = e.recaps ?? (e.recap ? [{ url: e.recap, label: 'Official recap and results' }] : []);
    const show = e.show ? model.showById.get(e.show) : undefined;
    pop.innerHTML = `<div class="cal-pop-body"><div class="panel-top"><span class="panel-kind">${esc(p?.name ?? '')}, ${esc(kind.toLowerCase())}</span><button type="button" class="panel-close" aria-label="Close event details">&times;</button></div>
<h2>${esc(tidy(e.name))}</h2>
<dl class="dl-facts"><dt>Date</dt><dd>${esc(fmtDate(e.date, true))}${e.end && e.end !== e.date ? ` to ${esc(fmtDate(e.end, true))}` : ''}</dd><dt>Time</dt><dd>${esc(e.time ? tidy(e.time) : past ? 'Start time not indexed' : 'Start time not yet confirmed')}</dd><dt>Place</dt><dd>${esc([e.venue, e.city].filter(Boolean).join(', ') || (past ? 'Venue not indexed' : 'Venue not yet confirmed'))}</dd></dl>
${e.note ? `<p class="hint">${esc(tidy(e.note))}</p>` : ''}${e.watchNote ? `<p class="hint">${esc(e.watchNote)}</p>` : ''}
<p class="source-links">${show ? `<a href="/shows/${esc(show.id)}/">Card and results</a>` : ''}${recaps.map((r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(tidy(r.label))}</a>`).join('')}${e.watch ? `<a href="${esc(e.watch)}" rel="noopener" target="_blank">${esc(e.watchLabel ?? 'Where to watch')}</a>` : ''}${e.source && e.source !== e.recap ? `<a href="${esc(e.source)}" rel="noopener" target="_blank">${e.status === 'scheduled' ? 'Official schedule' : 'Event source'}</a>` : ''}</p>
<p class="hint">Availability varies by region; a subscription or a separate purchase may be needed.</p></div>`;
    pop.hidden = false;
    const r = button.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    const h = pop.offsetHeight;
    pop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    pop.style.top = `${r.bottom + 8 + h <= window.innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - h - 8)}px`;
  }
  pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  pop.addEventListener('pointerleave', () => {
    if (!pinned) hideTimer = window.setTimeout(hidePop, 200);
  });
  pop.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.panel-close')) hidePop();
    if ((e.target as Element).closest('a[href^="/"]')) hidePop();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as Element).closest?.('[data-event]')) hidePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      const a = anchor;
      hidePop();
      a?.focus();
    }
  });
  window.addEventListener('scroll', () => {
    if (!pinned) hidePop();
  }, { passive: true });

  root.addEventListener('pointerover', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-event]');
    if (b && e.pointerType !== 'touch' && b !== anchor) showPop(byId.get(b.dataset.event!)!, b, false);
  });
  root.addEventListener('pointerout', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-event]');
    if (b && !b.contains(e.relatedTarget as Node) && !pinned) hideTimer = window.setTimeout(hidePop, 200);
  });
  root.addEventListener('focusin', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-event]');
    if (b && b.matches(':focus-visible')) showPop(byId.get(b.dataset.event!)!, b, false);
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-event]');
    if (b) showPop(byId.get(b.dataset.event!)!, b, true);
  });

  // ---------- Controls ----------
  function scrollToToday() {
    const scroller = root.querySelector<HTMLElement>('.calendar-scroll');
    const line = root.querySelector<HTMLElement>('.cal-now');
    if (scroller && line) scroller.scrollLeft = Math.max(0, parseFloat(line.style.left) - scroller.clientWidth / 2);
  }
  promotionSelect.addEventListener('change', () => {
    state.promotion = promotionSelect.value;
    hidePop();
    render();
    ctx.changed();
  });
  weeklyBox.addEventListener('change', () => {
    state.weekly = weeklyBox.checked;
    hidePop();
    render();
  });
  el.addEventListener('click', (e) => {
    const z = (e.target as Element).closest<HTMLElement>('[data-zoom]');
    if (z) {
      state.zoom = z.dataset.zoom as 'year' | 'weeks';
      for (const b of el.querySelectorAll<HTMLElement>('[data-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.zoom === state.zoom));
      hidePop();
      render();
      if (state.zoom === 'weeks') scrollToToday();
      return;
    }
    if ((e.target as Element).closest('[data-today]')) {
      if (state.zoom !== 'weeks') {
        state.zoom = 'weeks';
        for (const b of el.querySelectorAll<HTMLElement>('[data-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.zoom === state.zoom));
        render();
      }
      scrollToToday();
    }
  });
  let lastWidth = 0;
  new ResizeObserver(
    frameThrottle(() => {
      if (root.clientWidth === lastWidth || el.hidden) return;
      lastWidth = root.clientWidth;
      hidePop();
      layout();
    }),
  ).observe(root);

  return {
    el,
    tab: '/calendar/',
    show: () => {
      if (!root.childElementCount) render();
    },
    hide: hidePop,
    apply: (p: Params) => {
      state.promotion = p.promotion && data.promotions.some((x) => x.id === p.promotion) ? p.promotion : 'all';
      promotionSelect.value = state.promotion;
      render();
    },
    address: () => `/calendar/${state.promotion !== 'all' ? `?promotion=${state.promotion}` : ''}`,
    subject: () => `${data.year} wrestling calendar`,
  };
}
