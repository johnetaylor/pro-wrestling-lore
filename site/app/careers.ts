// Careers: every wrestler's career on one timeline. Lanes A to Z, a scrub bar to zoom and move
// through time, moments you can select to bring everyone in them together, and a career
// explorer for any wrestler.
import { announce, esc, fmtDate, fmtMonth, frameThrottle, num, plural, reducedMotion } from './dom.ts';
import { loadDetails, loadProfile, loadRatings } from './data.ts';
import { dayNum, isoDay, memberStart, normalize, type DetailRow, type Model, type Moment, type Period, type Person, type ProfileBundle, type Reign } from './model.ts';
import { createNavigator, type Navigator } from './navigator.ts';
import { avatarHtml, careerPanel, careerSpan, choicePanel, momentPanel, periodDialog, previewList, type CareerSpan } from './panels.ts';
import { BELT, STAR } from './ui.ts';

export type KindFilter = 'all' | 'match' | 'title' | 'story' | 'promo' | 'appearance';
export type DivisionFilter = 'all' | 'men' | 'women';

const ROW = 92; // base lane height
const COMPACT = 52; // a lane with title reigns and nothing else in the dates
const RAIL = 62; // rail position inside a lane, below its reign tracks
const REIGN_TRACK = 22;
const BRACKET_TRACK = 32;
const BUFFER = 600; // px of lanes rendered above and below the viewport
const CLUSTER_PX = 14; // marks closer than this merge into one, with a count

export interface CareersOptions {
  model: Model;
  root: HTMLElement;
  controls: { search: HTMLInputElement; kind: HTMLSelectElement; from: HTMLInputElement; to: HTMLInputElement; month: HTMLSelectElement; promotion: HTMLSelectElement; division: HTMLSelectElement };
  /** Height of the sticky bar above the axis, so selections scroll into view below it. */
  stickyHeight(): number;
  storylinesFor(kind: 'moment' | 'person', key: string): Promise<{ id: string; title: string }[]>;
  openStoryline(id: string): void;
  /** Opens a title reign in Championships. */
  openReign(title: string, reign: string): void;
  dialog(html: string): void;
  /** Called after each settled change, so the page can keep its URL in step. */
  changed?(): void;
}

/** What the URL records: the focused wrestler, a selected moment, a career year, the dates and
 * the promotion and division filters. */
export interface CareersState {
  person?: string;
  moment?: string;
  year?: string;
  from?: string;
  to?: string;
  promotion?: string;
  division?: string;
}

interface Row {
  p: number;
  /** Title reigns and nothing else in the dates: a short lane with no rail. */
  compact: boolean;
  moments: Moment[];
  reignTracks: number;
  brackets: { period: Period; track: number; left: number; width: number; line: number; span: number }[];
  bracketTracks: number;
  height: number;
  top: number;
}

interface Focus {
  person: number;
  span: CareerSpan;
  from: number;
  to: number;
  year: string | null;
}

export function createCareers(o: CareersOptions) {
  const { model, root, controls } = o;
  const asOf = dayNum(model.asOf);
  const archiveFirst = dayNum(model.first);
  const state = {
    from: dayNum(`${Number(model.asOf.slice(0, 4)) - 2}-01-01`),
    to: asOf,
    kind: 'all' as KindFilter,
    promotion: 'all',
    division: 'all' as DivisionFilter,
    search: '',
    selected: null as Moment | null,
    anchor: null as number | null,
    choice: null as { person: number; moments: Moment[] } | null,
    focus: null as Focus | null,
    previous: null as { from: number; to: number; scroll: number } | null,
    rival: null as { name: string; ids: Set<number>; matches: Set<number> } | null,
    profile: null as ProfileBundle | null,
  };
  const details = new Map<string, DetailRow>();

  root.innerHTML = `<div class="explorer-head"><div><h1 class="view-title">Every career on one timeline</h1><p class="view-subtitle"></p></div>
<div class="head-controls"><label class="career-year" hidden>Career view <select></select></label><button type="button" class="restore" hidden>Restore A to Z</button></div></div>
<div class="axis"><div class="axis-name">Wrestler <span>A to Z</span></div><div class="ticks" aria-hidden="true"></div></div>
<div class="lanes"><div class="grid" aria-hidden="true"></div><svg class="connections" aria-hidden="true"></svg><div class="rows"></div><section class="detail" aria-label="Selected moment or career" hidden></section></div>
<div class="lanes-empty" hidden><h2>No wrestlers match</h2><p>Try another name or a wider date range.</p><button type="button" class="reset">Reset filters</button></div>
<div class="explorer-foot"><span>Scroll sideways or drag the bar to move through time. Hover a mark for a preview, select it for details.</span><span class="counts"></span></div>`;
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const lanes = q('.lanes');
  const rowsEl = q('.rows');
  const grid = q('.grid');
  const ticksEl = q('.ticks');
  const svg = q<SVGSVGElement>('.connections');
  const detail = q('.detail');
  const yearSelect = q<HTMLSelectElement>('.career-year select');

  // ---------- Geometry ----------
  let geometry = { width: 1000, label: 220, left: 244, right: 976 };
  const measure = () => {
    const width = lanes.clientWidth || 1000;
    const label = parseFloat(getComputedStyle(root).getPropertyValue('--label-w')) || 220;
    geometry = { width, label, left: label + 20, right: width - 20 };
  };
  const xPos = (day: number) => geometry.left + ((day - state.from) / Math.max(1, state.to - state.from)) * (geometry.right - geometry.left);
  const dayAt = (x: number) => state.from + ((x - geometry.left) / (geometry.right - geometry.left)) * (state.to - state.from);

  // ---------- Which moments and rows are shown ----------
  const kindOk = (m: Moment) =>
    state.kind === 'all' ||
    (state.kind === 'match' && m.kind <= 1) ||
    (state.kind === 'title' && m.kind === 1) ||
    (state.kind === 'story' && m.kind >= 2) ||
    (state.kind === 'promo' && m.kind === 2) ||
    (state.kind === 'appearance' && m.kind === 3);
  const promotionOk = (m: Moment) => state.promotion === 'all' || m.show.promotion === state.promotion;
  const momentOk = (m: Moment) => kindOk(m) && promotionOk(m);
  /** A person in the chosen division. Someone with no recorded gender is in neither. */
  const divisionOk = (p: Person) => state.division === 'all' || p.gender === (state.division === 'women' ? 'f' : 'm');
  const promotionName = () => (state.promotion === 'all' ? '' : model.promotions.get(state.promotion)?.name ?? state.promotion);
  /** Whether the chosen promotion has a moment or a title reign between two days. */
  function promotionHasRecords(from: number, to: number): boolean {
    if (state.promotion === 'all') return true;
    for (let i = lowerBound(model.moments, from); i < model.moments.length && model.moments[i].day <= to; i++) if (model.moments[i].show.promotion === state.promotion) return true;
    return model.reigns.some((r) => r.title.promotion === state.promotion && dayNum(r.start) <= to && dayNum(r.end || model.asOf) >= from);
  }
  /** When the dates hold nothing from the chosen promotion, moves them to span its records. */
  function fitPromotion() {
    if (state.promotion === 'all' || state.focus || state.selected || promotionHasRecords(state.from, state.to)) return;
    let first = Infinity;
    let last = -Infinity;
    for (const m of model.moments)
      if (m.show.promotion === state.promotion) {
        first = Math.min(first, m.day);
        last = Math.max(last, m.day);
      }
    for (const r of model.reigns)
      if (r.title.promotion === state.promotion) {
        first = Math.min(first, dayNum(r.start));
        last = Math.max(last, dayNum(r.end || model.asOf));
      }
    if (!Number.isFinite(first)) return;
    const pad = Math.max(60, Math.round((last - first) * 0.03));
    state.from = Math.max(dayNum('1900-01-01'), first - pad);
    state.to = Math.min(asOf, last + pad);
  }
  const lowerBound = (list: Moment[], day: number) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].day < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const momentsInRange = (p: number) => {
    const list = model.byPerson[p];
    const slice = list.slice(lowerBound(list, state.from), lowerBound(list, state.to + 1));
    return state.kind === 'all' && state.promotion === 'all' ? slice : slice.filter(momentOk);
  };
  const reignsInRange = (p: number) =>
    model.reignsByPerson[p].filter((r) => (state.promotion === 'all' || r.title.promotion === state.promotion) && dayNum(memberStart(r, p)) <= state.to && dayNum(r.end || model.asOf) >= state.from);

  let rows: Row[] = [];
  let panelAfter = -1; // index of the row the detail panel opens below
  let panelGap = 0;
  let total = 0;
  const participants = () => (state.selected ? [...new Set([...state.selected.people, ...state.selected.involved])] : []);

  function bracketsFor(p: number) {
    const periods = model.periodsByPerson.get(p) ?? [];
    const tracks: [number, number][][] = [];
    const out: Row['brackets'] = [];
    for (const period of periods) {
      if (state.promotion !== 'all' && period.promotion !== state.promotion) continue;
      const s = dayNum(period.start);
      const e = dayNum(period.end || model.asOf);
      if (s > state.to || e < state.from) continue;
      const left = xPos(Math.max(s, state.from));
      const right = xPos(Math.min(e, state.to));
      const span = Math.max(2, right - left);
      const hit = Math.min(geometry.right - geometry.left, Math.max(span, period.name.length * 7.5 + 18));
      const box = Math.max(geometry.left, Math.min(geometry.right - hit, left + (span - hit) / 2));
      let track = tracks.findIndex((list) => list.every(([a, b]) => box + hit + 8 <= a || box >= b + 8));
      if (track < 0) {
        track = tracks.length;
        tracks.push([]);
      }
      tracks[track].push([box, box + hit]);
      out.push({ period, track, left: box, width: hit, line: left - box, span });
    }
    return { brackets: out, tracks: tracks.length };
  }

  /** When each career starts: the debut if known, else the first record of any kind. */
  const careerStart = model.people.map((p) => {
    const dates = [model.spans.get(p.i)?.debut, model.byPerson[p.i][0]?.date, model.reignsByPerson[p.i][0]?.start, ...(model.periodsByPerson.get(p.i) ?? []).map((x) => x.start)].filter((d): d is string => !!d);
    return dates.length ? dayNum(dates.sort()[0]) : asOf;
  });

  function computeRows() {
    const search = normalize(state.search);
    const sel = participants();
    const focusP = state.focus?.person;
    const list: Row[] = [];
    for (const person of model.people) {
      // The people in a selected moment and the focused wrestler stay, whatever the filters.
      const pinned = sel.includes(person.i) || focusP === person.i;
      if (!pinned && !divisionOk(person)) continue;
      const moments = momentsInRange(person.i);
      const reigns = reignsInRange(person.i);
      // Everyone with a moment or a reign in the dates, and (across all promotions) the current
      // roster as far back as their careers go, so a gap in the records shows as an empty lane
      // rather than no lane.
      const keep = search
        ? person.search.includes(search)
        : moments.length > 0 || reigns.length > 0 || (state.promotion === 'all' && person.roster && careerStart[person.i] <= state.to);
      if (!keep && !pinned) continue;
      // A champion the archive has no televised moments for in these dates gets a short lane:
      // their reigns, without an empty rail.
      const compact = !moments.length && reigns.length > 0 && !person.roster && !pinned;
      const ends: number[] = [];
      for (const r of reigns.sort((a, b) => memberStart(a, person.i).localeCompare(memberStart(b, person.i)))) {
        const start = dayNum(memberStart(r, person.i));
        let t = ends.findIndex((e) => e <= start);
        if (t < 0) t = ends.length;
        ends[t] = dayNum(r.end || model.asOf);
      }
      const { brackets, tracks } = compact ? { brackets: [], tracks: 0 } : bracketsFor(person.i);
      const reignTracks = ends.length;
      const height = compact ? COMPACT + Math.max(0, reignTracks - 1) * REIGN_TRACK : ROW + Math.max(0, reignTracks - 1) * REIGN_TRACK + (tracks ? 26 + tracks * BRACKET_TRACK : 0);
      list.push({ p: person.i, compact, moments, reignTracks, brackets, bracketTracks: tracks, height, top: 0 });
    }
    list.sort((a, b) => model.people[a.p].sort.localeCompare(model.people[b.p].sort));
    // A selected moment brings its participants together where its anchor sits alphabetically.
    if (state.selected) {
      const anchorAt = Math.max(0, list.findIndex((r) => r.p === state.anchor));
      const linked = sel.map((p) => list.find((r) => r.p === p)).filter((r): r is Row => !!r);
      const rest = list.filter((r) => !sel.includes(r.p));
      const before = list.slice(0, anchorAt).filter((r) => !sel.includes(r.p)).length;
      rest.splice(before, 0, ...linked);
      rows = rest;
    } else rows = list;
    // Where the detail panel opens: below the selection's second participant, the focused
    // wrestler or the wrestler whose marks are being chosen.
    if (state.selected) {
      const idx = sel.map((p) => rows.findIndex((r) => r.p === p)).filter((i) => i >= 0).sort((a, b) => a - b);
      panelAfter = idx[Math.min(1, idx.length - 1)] ?? -1;
    } else if (state.choice) panelAfter = rows.findIndex((r) => r.p === state.choice!.person);
    else if (state.focus) panelAfter = rows.findIndex((r) => r.p === state.focus!.person);
    else panelAfter = -1;
  }

  function layoutRows() {
    let y = 0;
    rows.forEach((r, i) => {
      r.top = y;
      y += r.height;
      if (i === panelAfter) y += panelGap;
    });
    total = Math.max(240, y);
    lanes.style.height = `${total}px`;
  }

  // ---------- Painting ----------
  let version = 0;
  const rendered = new Map<number, HTMLElement>();
  const railY = (r: Row) => Math.max(0, r.reignTracks - 1) * REIGN_TRACK + RAIL;

  /** How notable a moment is: a pay-per-view match, then a title match, a match, a segment. */
  const rank = (m: Moment) => (m.kind <= 1 && m.show.ple ? 4 : m.kind === 1 ? 3 : m.kind === 0 ? 2 : 1);

  /** The mark a merged group shows: its most common kind of moment, and on a tie the more
   * notable one. */
  function representative(ms: Moment[]): Moment {
    if (ms.length === 1) return ms[0];
    const counts = [0, 0, 0, 0, 0];
    for (const m of ms) counts[rank(m)]++;
    let best = 1;
    for (let k = 2; k <= 4; k++) if (counts[k] >= counts[best]) best = k;
    return ms.find((m) => rank(m) === best)!;
  }

  /** The moment a click on a merged mark opens: of the kind the mark shows, the one nearest the
   * pointer's date, and on a tie one the wrestler competed in. v69 opened the mark under the
   * pointer the same way, so a click always brings a match's wrestlers together. */
  function momentAt(ms: Moment[], day: number, p: number): Moment {
    const shown = rank(ms.find((m) => m === state.selected) ?? representative(ms));
    const pool = ms.filter((m) => rank(m) === shown);
    const score = (m: Moment) => Math.abs(m.day - day) + (m.people.includes(p) ? 0 : 0.5);
    return pool.reduce((best, m) => (score(m) < score(best) ? m : best));
  }

  function nodesHtml(r: Row): string {
    if (!r.moments.length) return `<span class="no-moments" style="left:${geometry.left}px;top:${railY(r) - 9}px">No indexed ${state.promotion === 'all' ? '' : `${esc(promotionName())} `}moments in these dates</span>`;
    const clusters: { x: number; ms: Moment[] }[] = [];
    for (const m of r.moments) {
      const x = xPos(m.day);
      const last = clusters.at(-1);
      if (last && x - last.x < CLUSTER_PX) last.ms.push(m);
      else clusters.push({ x, ms: [m] });
    }
    const y = railY(r);
    const rival = state.rival && state.focus?.person === r.p ? state.rival : null;
    return clusters
      .map((c, i) => {
        const pick = c.ms.find((m) => m === state.selected) ?? representative(c.ms);
        const before = i ? c.x - clusters[i - 1].x : 44;
        const after = i < clusters.length - 1 ? clusters[i + 1].x - c.x : 44;
        const w = Math.max(12, Math.min(40, before, after));
        const involved = !pick.people.includes(r.p);
        const lit = rival ? c.ms.some((m) => rival.matches.has(m.i)) : true;
        const cls = [
          'node',
          `k${pick.kind}`,
          pick.show.ple && pick.kind <= 1 ? 'ple' : '',
          c.ms.length > 1 ? 'multi' : '',
          c.ms.includes(state.selected!) ? 'active' : '',
          involved ? 'involved' : '',
          rival ? (lit ? 'lit' : 'faded') : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = c.ms.length === 1 ? `${fmtDate(pick.date)}, ${pick.show.label}: ${pick.title}` : `${c.ms.length} moments, ${fmtDate(c.ms[0].date)} to ${fmtDate(c.ms.at(-1)!.date)}`;
        return `<button type="button" class="${cls}" style="left:${(c.x - w / 2).toFixed(1)}px;width:${w.toFixed(1)}px;top:${y - 22}px" data-p="${r.p}" data-ms="${c.ms.map((m) => m.i).join(',')}"${c.ms.length > 1 ? ` data-count="${c.ms.length > 99 ? '99+' : c.ms.length}"` : ''} aria-label="${esc(label)}">${pick.show.ple && pick.kind <= 1 ? STAR : ''}</button>`;
      })
      .join('');
  }

  /** The title's name if it fits along the reign, else its short name, else nothing. */
  const reignLabel = (reign: Reign, span: number) => (reign.name.length * 6.4 + 36 <= span ? reign.name : span >= 64 ? reign.short : '');

  function reignsHtml(r: Row): string {
    const ends: number[] = [];
    return reignsInRange(r.p)
      .sort((a, b) => memberStart(a, r.p).localeCompare(memberStart(b, r.p)))
      .map((reign) => {
        const start = dayNum(memberStart(reign, r.p));
        const end = dayNum(reign.end || model.asOf);
        let t = ends.findIndex((e) => e <= start);
        if (t < 0) t = ends.length;
        ends[t] = end;
        const left = xPos(Math.max(start, state.from));
        const right = xPos(Math.min(end, state.to));
        const span = Math.max(3, right - left);
        const label = `${reign.name}: ${fmtDate(memberStart(reign, r.p))} to ${reign.end ? fmtDate(reign.end) : 'present'}`;
        return `<button type="button" class="reign${reign.end ? '' : ' ongoing'}${start < state.from ? ' clipped' : ''}" style="left:${left.toFixed(1)}px;width:${Math.max(span, 26).toFixed(1)}px;top:${6 + t * REIGN_TRACK}px;--span:${span.toFixed(1)}px" data-reign="${esc(reign.title.id)}#${esc(reign.id)}" data-p="${r.p}" aria-label="${esc(label)}. Open it in Championships">${BELT}<span>${esc(reignLabel(reign, span))}</span></button>`;
      })
      .join('');
  }

  function spanHtml(r: Row): string {
    const f = state.focus;
    if (!f || f.person !== r.p) return '';
    const s = dayNum(f.span.start);
    const e = dayNum(f.span.end);
    if (e < state.from || s > state.to) return '';
    const left = xPos(Math.max(s, state.from));
    const right = xPos(Math.min(e, state.to));
    const y = railY(r);
    return `<div class="career-span${f.span.debut ? '' : ' uncertain'}" style="left:${left.toFixed(1)}px;width:${Math.max(2, right - left).toFixed(1)}px;top:${y - 3}px" role="img" aria-label="${esc(`${f.span.startLabel}. ${f.span.endLabel}.`)}"></div><div class="span-labels" style="left:${Math.min(left, geometry.right - Math.max(120, right - left)).toFixed(1)}px;width:${Math.max(120, right - left).toFixed(1)}px;top:${y + 8}px"><span>${esc(s < state.from ? `Continues from before ${isoDay(state.from).slice(0, 4)}` : f.span.startLabel)}</span><span>${esc(e > state.to ? `Continues after ${isoDay(state.to).slice(0, 4)}` : f.span.endLabel)}</span></div>`;
  }

  function bracketsHtml(r: Row): string {
    if (!r.brackets.length) return '';
    const top = railY(r) + 30;
    return `<span class="bracket-heading" style="left:${geometry.left}px;top:${top}px">Promotion runs, overlapping</span>${r.brackets
      .map(
        (b) =>
          `<button type="button" class="bracket${b.period.end ? '' : ' ongoing'}" style="left:${b.left.toFixed(1)}px;width:${b.width.toFixed(1)}px;top:${top + 20 + b.track * BRACKET_TRACK}px;--line-left:${b.line.toFixed(1)}px;--line-span:${b.span.toFixed(1)}px;--c:var(--p-${b.period.promotion || 'other'}, var(--p-other))" data-period="${model.periodsByPerson.get(r.p)!.indexOf(b.period)}" data-p="${r.p}" aria-label="${esc(`${b.period.fullName}. Open the run`)}"><span class="bracket-line" aria-hidden="true"></span><span class="bracket-name">${esc(b.period.name)}</span></button>`,
      )
      .join('')}`;
  }

  function laneClass(r: Row): string {
    const sel = participants();
    const muted = (sel.length && !sel.includes(r.p)) || (state.focus && state.focus.person !== r.p) || (state.choice && state.choice.person !== r.p);
    return ['lane', r.compact ? 'compact' : '', muted ? 'muted' : '', sel.includes(r.p) ? 'related' : '', state.focus?.person === r.p || state.choice?.person === r.p ? 'focused' : ''].filter(Boolean).join(' ');
  }

  function laneHtml(r: Row): string {
    const person = model.people[r.p];
    const what = r.compact ? plural(reignsInRange(r.p).length, 'title reign') : plural(r.moments.length, 'moment');
    const label = `<button type="button" class="lane-label" style="height:${r.compact ? r.height : Math.min(r.height, railY(r) + 30)}px" data-person="${r.p}" aria-label="${esc(`${person.name}, ${what}. Open the career`)}" aria-pressed="${state.focus?.person === r.p}">${avatarHtml(person)}<span class="person-name">${esc(person.name)}</span>${r.compact ? '' : `<span class="tally">${num(r.moments.length)}</span>`}</button>`;
    if (r.compact) return `${label}${reignsHtml(r)}`;
    return `${label}
<div class="rail" style="top:${railY(r)}px"></div>${spanHtml(r)}${reignsHtml(r)}${nodesHtml(r)}${bracketsHtml(r)}`;
  }

  /** Puts the lanes in and near the viewport into the page; leaves the rest out. Lanes that
   * stay in the page keep their element, so a change of position slides rather than jumps. */
  function paintRows() {
    const top = window.scrollY - (lanes.getBoundingClientRect().top + window.scrollY) - BUFFER;
    const bottom = top + window.innerHeight + 2 * BUFFER;
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top + rows[mid].height < top) lo = mid + 1;
      else hi = mid;
    }
    const keep = new Set<number>();
    for (let i = lo; i < rows.length && rows[i].top <= bottom; i++) {
      const r = rows[i];
      keep.add(r.p);
      let el = rendered.get(r.p);
      if (!el) {
        el = document.createElement('div');
        el.dataset.row = String(r.p);
        el.style.transform = `translateY(${r.top}px)`;
        el.dataset.top = String(r.top);
        rowsEl.appendChild(el);
        rendered.set(r.p, el);
      }
      if (el.dataset.v !== String(version)) {
        el.className = laneClass(r);
        el.style.height = `${r.height}px`;
        el.innerHTML = laneHtml(r);
        el.dataset.v = String(version);
      }
      if (el.dataset.top !== String(r.top)) {
        el.style.transform = `translateY(${r.top}px)`;
        el.dataset.top = String(r.top);
      }
    }
    for (const [p, el] of rendered) {
      if (!keep.has(p)) {
        el.remove();
        rendered.delete(p);
      }
    }
    drawConnections();
  }
  const onScroll = frameThrottle(paintRows);

  function paintTicks() {
    const span = state.to - state.from;
    const dates: string[] = [];
    const fromIso = isoDay(state.from);
    const toIso = isoDay(state.to);
    const fy = Number(fromIso.slice(0, 4));
    const ty = Number(toIso.slice(0, 4));
    const room = Math.max(2, Math.floor((geometry.right - geometry.left) / 72));
    let mode: 'day' | 'month' | 'year' = 'year';
    if (span < 50) {
      mode = 'day';
      for (let d = state.from; d <= state.to; d += 7) dates.push(isoDay(d));
    } else if (span < 1100) {
      mode = 'month';
      for (let y = fy; y <= ty; y++) for (let m = 1; m <= 12; m++) {
        const d = `${y}-${String(m).padStart(2, '0')}-01`;
        if (d >= fromIso && d <= toIso) dates.push(d);
      }
    } else {
      const step = [1, 2, 5, 10, 20].find((s) => (ty - fy) / s <= room) ?? 25;
      for (let y = Math.ceil(fy / step) * step; y <= ty; y += step) {
        const d = `${y}-01-01`;
        if (d >= fromIso && d <= toIso) dates.push(d);
      }
    }
    const every = Math.max(1, Math.ceil(dates.length / room));
    const shown = dates.filter((_, i) => i % every === 0);
    const clickable = !!state.focus && mode === 'year' && !state.focus.year;
    ticksEl.innerHTML = shown
      .map((d) => {
        const text = mode === 'day' ? fmtDate(d).replace(/, \d{4}$/, '') : mode === 'month' ? (d.slice(5, 7) === '01' || d === shown[0] ? `${fmtMonth(d).slice(0, 3)} ${d.slice(0, 4)}` : fmtMonth(d).slice(0, 3)) : d.slice(0, 4);
        const x = xPos(dayNum(d));
        return clickable
          ? `<button type="button" class="tick year-tick" style="left:${x.toFixed(1)}px" data-year="${d.slice(0, 4)}" aria-label="Zoom to ${d.slice(0, 4)}">${text}</button>`
          : `<span class="tick" style="left:${x.toFixed(1)}px">${text}</span>`;
      })
      .join('');
    grid.innerHTML = shown.map((d) => `<i style="left:${xPos(dayNum(d)).toFixed(1)}px"></i>`).join('');
  }

  function drawConnections() {
    if (!state.selected) {
      svg.innerHTML = '';
      return;
    }
    const x = xPos(state.selected.day);
    const ys = participants()
      .map((p) => rows.find((r) => r.p === p))
      .filter((r): r is Row => !!r)
      .map((r) => r.top + railY(r));
    svg.setAttribute('viewBox', `0 0 ${geometry.width} ${total}`);
    svg.innerHTML = ys.length > 1 ? `<line x1="${x}" x2="${x}" y1="${Math.min(...ys)}" y2="${Math.max(...ys)}"/>` : '';
  }

  // ---------- Detail panel ----------
  async function relatedStorylines(): Promise<{ id: string; title: string }[]> {
    if (state.selected) return o.storylinesFor('moment', state.selected.id);
    if (state.focus) return o.storylinesFor('person', model.people[state.focus.person].id);
    return [];
  }

  function relatedMoments(m: Moment): Moment[] {
    const seen = new Set<number>([m.i]);
    const out: Moment[] = [];
    for (const p of m.people) for (const x of model.byPerson[p]) if (!seen.has(x.i) && x.people.some((id) => m.people.includes(id))) {
      seen.add(x.i);
      out.push(x);
    }
    return out.sort((a, b) => Math.abs(a.day - m.day) - Math.abs(b.day - m.day)).slice(0, 3);
  }

  // Each wrestler's PWL-rated matches, highest first, from the ratings file when first needed.
  let ratedIndex: Promise<Map<number, { m: Moment; score: number }[]>> | null = null;
  const ratedFor = async (p: number) => {
    ratedIndex ??= loadRatings()
      .then((b) => {
        const out = new Map<number, { m: Moment; score: number }[]>();
        for (const [id, score] of b.rated) {
          const m = model.momentById.get(id);
          if (m) for (const x of m.people) (out.get(x) ?? out.set(x, []).get(x)!).push({ m, score });
        }
        return out;
      })
      .catch(() => new Map());
    return (await ratedIndex).get(p) ?? [];
  };

  let panelToken = 0;
  async function renderPanel() {
    const token = ++panelToken;
    if (!state.selected && !state.choice && !state.focus) {
      detail.hidden = true;
      detail.innerHTML = '';
      panelGap = 0;
      return;
    }
    detail.hidden = false;
    const fill = (html: string) => {
      if (token !== panelToken) return;
      detail.innerHTML = html;
      placePanel();
    };
    if (state.choice) {
      fill(choicePanel(model, state.choice.person, state.choice.moments));
      return;
    }
    if (state.selected) {
      const m = state.selected;
      fill(momentPanel(model, m, details.get(m.id), relatedMoments(m), []));
      const [rows, stories] = await Promise.all([loadDetails(m.date.slice(0, 4)), relatedStorylines()]);
      for (const [id, row] of Object.entries(rows)) details.set(id, row);
      fill(momentPanel(model, m, details.get(m.id), relatedMoments(m), stories));
      return;
    }
    const f = state.focus!;
    const id = model.people[f.person].id;
    fill(careerPanel(model, f.person, state.profile?.id === id ? state.profile : null, { rival: state.rival?.name ?? null, momentsInRange: momentsInRange(f.person), storylines: [], topRated: [], promotion: promotionName() }));
    const [prof, stories, rated] = await Promise.all([loadProfile(id).catch(() => null), relatedStorylines(), ratedFor(f.person)]);
    if (token !== panelToken) return;
    state.profile = prof;
    fill(careerPanel(model, f.person, prof, { rival: state.rival?.name ?? null, momentsInRange: momentsInRange(f.person), storylines: stories, topRated: rated.slice(0, 5), promotion: promotionName() }));
  }

  /** Positions the panel under its row and opens a gap in the lanes for it. */
  function placePanel() {
    if (detail.hidden || panelAfter < 0) {
      panelGap = 0;
      layoutRows();
      paintRows();
      return;
    }
    const viewport = lanes.clientWidth;
    const width = Math.min(600, viewport - 24);
    let anchorX = geometry.left + 40;
    if (state.selected) anchorX = xPos(state.selected.day);
    else if (state.choice) anchorX = xPos(state.choice.moments[0].day);
    const left = Math.max(12, Math.min(viewport - width - 12, anchorX - width * 0.5));
    detail.style.width = `${width}px`;
    detail.style.left = `${left}px`;
    detail.style.setProperty('--pointer', `${Math.max(18, Math.min(width - 18, anchorX - left))}px`);
    panelGap = detail.offsetHeight + 40;
    layoutRows();
    const r = rows[panelAfter];
    detail.style.top = `${r.top + r.height + 18}px`;
    paintRows();
  }

  // ---------- Header, counts and controls ----------
  function syncHead() {
    const title = q('.view-title');
    const sub = q('.view-subtitle');
    const sel = participants();
    if (state.selected) {
      title.textContent = `${plural(sel.length, 'connected career')}`;
      sub.textContent = `${fmtDate(state.selected.date, true)}, ${state.selected.show.label}`;
    } else if (state.focus) {
      title.textContent = model.people[state.focus.person].name;
      const only = state.promotion === 'all' ? '' : ` ${promotionName()} marks and reigns only.`;
      sub.textContent =
        (state.rival
          ? `${plural(state.rival.matches.size, 'indexed match', 'indexed matches')} against ${state.rival.name}.`
          : state.focus.year
            ? `${state.focus.year}. Indexed moments only; earlier coverage is partial.`
            : state.focus.span.debut
              ? 'Whole career. Select a year to zoom in.'
              : 'Debut not yet verified, so the span starts at the first indexed record.') + only;
    } else {
      title.textContent = state.choice ? model.people[state.choice.person].name : 'Every career on one timeline';
      const who = state.division === 'women' ? 'Women' : state.division === 'men' ? 'Men' : 'Everyone';
      const where = state.promotion === 'all' ? '' : ` in ${promotionName()}`;
      sub.textContent = state.search
        ? `${state.division === 'all' ? 'Wrestlers' : who} matching “${state.search}”.${where ? ` Marks and reigns${where} only.` : ''}`
        : `${who} with a televised moment or a title reign${where} in the selected dates, A to Z. Select a name to open a career, or a mark to open the moment.`;
    }
    q('.restore').hidden = !(state.selected || state.focus || state.choice);
    const yearLabel = q('.career-year');
    yearLabel.hidden = !state.focus;
    if (state.focus) {
      if (yearSelect.dataset.person !== String(state.focus.person)) {
        const first = Number(state.focus.span.start.slice(0, 4));
        const last = Number(state.focus.span.through.slice(0, 4));
        const years: number[] = [];
        for (let y = first; y <= last; y++) years.push(y);
        yearSelect.innerHTML = `<option value="all">Whole career</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}`;
        yearSelect.dataset.person = String(state.focus.person);
      }
      yearSelect.value = state.focus.year ?? 'all';
    }
    const shown = new Set(rows.map((r) => r.p));
    const count = new Set(rows.flatMap((r) => r.moments.map((m) => m.i))).size;
    q('.counts').textContent = `${plural(shown.size, 'wrestler')}, ${plural(count, 'indexed moment')}`;
    q('.lanes-empty').hidden = rows.length > 0;
    controls.from.value = isoDay(state.from);
    controls.to.value = isoDay(state.to);
    // The month list names the range when it is exactly one month, or everything.
    const from = isoDay(state.from);
    const monthEnd = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10);
    controls.month.value =
      state.from === archiveFirst && state.to === asOf ? 'all' : from.endsWith('-01') && (isoDay(state.to) === monthEnd || (state.to === asOf && monthEnd > model.asOf)) ? from.slice(0, 7) : 'custom';
    if (!controls.month.value) controls.month.value = 'custom';
    controls.kind.value = state.kind;
    controls.promotion.value = state.promotion;
    controls.division.value = state.division;
  }

  // ---------- Navigator ----------
  const navDomain = (): [number, number] => (state.focus ? [state.focus.from, state.focus.to] : [Math.min(archiveFirst, state.from), asOf]);
  const nav: Navigator = createNavigator({
    domain: navDomain,
    range: () => [state.from, state.to],
    change: (from, to, final) => {
      state.from = from;
      state.to = to;
      if (state.focus) state.focus.year = null;
      state.choice = null;
      root.classList.toggle('scrubbing', !final);
      refresh(final ? 'settle' : 'drag');
    },
    density: () => {
      const [first, last] = navDomain();
      const bins = new Array(240).fill(0);
      const people = state.focus ? [state.focus.person] : null;
      const list = people ? model.byPerson[people[0]] : model.moments;
      const inDivision = (m: Moment) => people || state.division === 'all' || m.people.some((p) => divisionOk(model.people[p])) || m.involved.some((p) => divisionOk(model.people[p]));
      for (const m of list) {
        if (m.day < first || m.day > last || !momentOk(m) || !inDivision(m)) continue;
        bins[Math.min(239, Math.floor(((m.day - first) / Math.max(1, last - first)) * 240))]++;
      }
      return bins;
    },
  });
  q('.axis').appendChild(nav.el);

  // ---------- The render cycle ----------
  /** Recomputes everything after a state change. 'drag' skips the slower panel work. */
  /** The lane to hold still while the range changes: the focused or selected wrestler, or else
   * the first lane in view. Wrestlers come and go as the dates change, which would otherwise
   * move every lane under the pointer. */
  function anchorRow(): { p: number; screen: number } | null {
    const lanesTop = lanes.getBoundingClientRect().top;
    const target = state.focus?.person ?? (state.selected ? state.anchor : null) ?? state.choice?.person ?? null;
    let row = target !== null ? rows.find((r) => r.p === target) : undefined;
    if (!row) {
      const viewTop = o.stickyHeight() + q('.axis').offsetHeight - lanesTop;
      if (viewTop <= 0) return null;
      row = rows.find((r) => r.top + r.height > viewTop);
    }
    return row ? { p: row.p, screen: lanesTop + row.top } : null;
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
    version++;
    computeRows();
    layoutRows();
    if (anchor) {
      const r = rows.find((x) => x.p === anchor.p);
      if (r) {
        const shift = lanes.getBoundingClientRect().top + r.top - anchor.screen;
        if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
      }
    }
    paintTicks();
    syncHead();
    nav.sync();
    if (mode === 'full' || mode === 'settle') {
      nav.drawDensity();
      renderPanel();
      o.changed?.();
    } else placePanel();
    paintRows();
  }

  function scrollToRow(p: number | undefined, instant = false) {
    if (p === undefined) return;
    requestAnimationFrame(() => {
      const r = rows.find((x) => x.p === p);
      if (!r) return;
      const y = lanes.getBoundingClientRect().top + window.scrollY + r.top - o.stickyHeight() - q('.axis').offsetHeight - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  function remember() {
    if (!state.previous) state.previous = { from: state.from, to: state.to, scroll: window.scrollY };
  }

  // ---------- Actions ----------
  function select(m: Moment, anchor?: number) {
    remember();
    state.choice = null;
    const sel = [...new Set([...m.people, ...m.involved])];
    state.anchor = anchor !== undefined && sel.includes(anchor) ? anchor : state.focus && sel.includes(state.focus.person) ? state.focus.person : sel[0];
    state.focus = null;
    state.rival = null;
    state.selected = m;
    if (m.day < state.from || m.day > state.to) {
      const span = state.to - state.from;
      state.from = Math.max(archiveFirst, m.day - Math.round(span / 2));
      state.to = Math.min(asOf, state.from + span);
    }
    if (state.kind !== 'all' && !kindOk(m)) state.kind = 'all';
    if (!promotionOk(m)) state.promotion = 'all';
    refresh();
    scrollToRow(sel.map((p) => rows.find((r) => r.p === p)).filter((r): r is Row => !!r).sort((a, b) => a.top - b.top)[0]?.p);
    announce(`${m.title}. ${m.show.label}, ${fmtDate(m.date, true)}.`);
  }

  /** A career's whole span with a little room either side, as in v69. */
  function focusRange(span: CareerSpan): { from: number; to: number } {
    const a = dayNum(span.start);
    const b = Math.min(asOf, dayNum(span.through));
    const pad = Math.min(180, Math.max(21, Math.round((b - a) * 0.035)));
    return { from: Math.max(archiveFirst - 400, a - pad), to: Math.min(asOf, b + 30) };
  }

  function focusPerson(p: number, opts: { year?: string; quiet?: boolean } = {}) {
    remember();
    state.selected = null;
    state.choice = null;
    state.rival = null;
    const span = careerSpan(model, p);
    state.focus = { person: p, span, ...focusRange(span), year: null };
    state.from = state.focus.from;
    state.to = state.focus.to;
    if (state.profile?.id !== model.people[p].id) state.profile = null;
    if (opts.year) zoomYear(opts.year, false);
    refresh();
    scrollToRow(p);
    if (!opts.quiet) announce(`${model.people[p].name}, whole career`);
  }

  function zoomYear(year: string, render = true) {
    const f = state.focus;
    if (!f) return;
    if (year === 'all') {
      f.year = null;
      state.from = f.from;
      state.to = f.to;
    } else {
      f.year = year;
      state.from = dayNum(`${year}-01-01`);
      state.to = Math.min(asOf, dayNum(`${year}-12-31`));
    }
    if (render) {
      refresh();
      scrollToRow(f.person);
    }
  }

  function clear() {
    const prev = state.previous;
    state.selected = null;
    state.choice = null;
    state.focus = null;
    state.rival = null;
    state.previous = null;
    if (prev) {
      state.from = prev.from;
      state.to = prev.to;
    }
    fitPromotion();
    refresh();
    if (prev) window.scrollTo({ top: prev.scroll, behavior: 'auto' });
  }

  /** Every match where the focused wrestler and a rival were on opposite sides. */
  function focusRival(name: string) {
    const f = state.focus;
    if (!f) return;
    if (state.rival?.name === name) {
      state.rival = null;
      state.from = f.from;
      state.to = f.to;
      refresh();
      return;
    }
    const key = normalize(name.replace(/\s*\(.*\)$/, '').replace(/,.*$/, ''));
    const ids = new Set(model.people.filter((p) => normalize(p.name) === key || p.aliases.some((a) => normalize(a) === key)).map((p) => p.i));
    const matches = new Set<number>();
    for (const m of model.byPerson[f.person]) {
      if (m.kind > 1) continue;
      const rivals = m.people.filter((p) => ids.has(p));
      if (!rivals.length || !m.people.includes(f.person)) continue;
      const sides = m.title.split(/\s+vs\.?\s+/i);
      const me = model.people[f.person];
      const myNames = [me.name, ...me.aliases].map(normalize);
      const theirNames = rivals.flatMap((r) => [model.people[r].name, ...model.people[r].aliases]).map(normalize);
      const sideOf = (names: string[]) => sides.findIndex((s) => names.some((n) => ` ${normalize(s)} `.includes(` ${n} `)));
      const a = sideOf(myNames);
      const b = sideOf(theirNames);
      if (sides.length >= 2 && a >= 0 && b >= 0 ? a !== b : m.people.length === 2) matches.add(m.i);
    }
    state.rival = { name, ids, matches };
    const days = [...matches].map((i) => model.moments[i].day).sort((x, y) => x - y);
    if (days.length) {
      const pad = Math.max(45, Math.min(180, (days.at(-1)! - days[0]) * 0.04));
      state.from = Math.max(f.from, Math.round(days[0] - pad));
      state.to = Math.min(f.to, Math.round(days.at(-1)! + pad));
    }
    refresh();
    scrollToRow(f.person);
    announce(days.length ? `${plural(days.length, 'match', 'matches')} against ${name}. Other matches are faded.` : `No indexed matches against ${name} yet.`);
  }

  // ---------- Preview popover ----------
  const preview = document.createElement('div');
  preview.className = 'moment-preview';
  preview.hidden = true;
  preview.setAttribute('role', 'dialog');
  preview.setAttribute('aria-label', 'Moments at this point');
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
  async function showPreview(node: HTMLElement) {
    clearTimeout(hideTimer);
    previewFor = node;
    const ms = node.dataset.ms!.split(',').map((i) => model.moments[Number(i)]);
    const draw = () => {
      if (previewFor !== node) return;
      preview.innerHTML = previewList(ms, details);
      preview.hidden = false;
      const rect = node.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      preview.style.width = `${width}px`;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
      const height = preview.offsetHeight;
      const below = rect.bottom + 10 + height <= window.innerHeight - 12 || rect.top - height - 10 < 0;
      preview.style.left = `${left}px`;
      preview.style.top = `${Math.max(12, below ? rect.bottom + 10 : rect.top - height - 10)}px`;
      preview.classList.toggle('above', !below);
      preview.style.setProperty('--pointer', `${Math.max(16, Math.min(width - 16, rect.left + rect.width / 2 - left))}px`);
    };
    draw();
    const years = [...new Set(ms.slice(0, 40).map((m) => m.date.slice(0, 4)))];
    const loaded = await Promise.all(years.map((y) => loadDetails(y)));
    for (const rowsOfYear of loaded) for (const [id, row] of Object.entries(rowsOfYear)) details.set(id, row);
    draw();
  }
  preview.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  preview.addEventListener('pointerleave', deferHide);
  preview.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-moment]');
    if (!b) return;
    const anchor = previewFor ? Number(previewFor.dataset.p) : undefined;
    hidePreview();
    select(model.moments[Number(b.dataset.moment)], anchor);
  });
  window.addEventListener('scroll', hidePreview, { passive: true });

  // ---------- Events ----------
  // A mark that was just selected gets redrawn under the pointer; it shows no preview until the
  // pointer leaves it.
  let quietMark: string | null = null;
  const markKey = (node: HTMLElement) => `${node.dataset.p}:${node.dataset.ms}`;
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
      const ms = node.dataset.ms!.split(',').map((i) => model.moments[Number(i)]);
      const p = Number(node.dataset.p);
      // A pointer opens the moment under it; the keyboard, which has no position, gets the
      // list of everything merged into the mark.
      if (ms.length === 1) select(ms[0], p);
      else if (e.detail > 0) select(momentAt(ms, dayAt(e.clientX - lanes.getBoundingClientRect().left), p), p);
      else {
        remember();
        state.choice = { person: p, moments: ms };
        state.selected = null;
        refresh();
        scrollToRow(p);
      }
      return;
    }
    const label = t.closest<HTMLElement>('.lane-label');
    if (label) return focusPerson(Number(label.dataset.person));
    // A reign, on a lane or in the career panel, opens in Championships at the time it was held.
    const reign = t.closest<HTMLElement>('[data-reign]');
    if (reign) {
      hidePreview();
      const [titleId, reignId] = reign.dataset.reign!.split('#');
      if (titleId && reignId) o.openReign(titleId, reignId);
      return;
    }
    const bracket = t.closest<HTMLElement>('.bracket');
    if (bracket) {
      const p = Number(bracket.dataset.p);
      const period = model.periodsByPerson.get(p)![Number(bracket.dataset.period)];
      o.dialog(periodDialog(model, [period]));
      return;
    }
    const periodChip = t.closest<HTMLElement>('[data-period-name]');
    if (periodChip) {
      const p = Number(periodChip.dataset.person);
      const list = (model.periodsByPerson.get(p) ?? []).filter((x) => x.name === periodChip.dataset.periodName);
      if (list.length) o.dialog(periodDialog(model, list));
      return;
    }
    const year = t.closest<HTMLElement>('.year-tick');
    if (year) return zoomYear(year.dataset.year!);
    const moment = t.closest<HTMLElement>('[data-moment]');
    if (moment) return select(model.moments[Number(moment.dataset.moment)], moment.dataset.anchor ? Number(moment.dataset.anchor) : state.focus?.person);
    const chip = t.closest<HTMLElement>('.chip[data-person]');
    if (chip) return focusPerson(Number(chip.dataset.person));
    const rival = t.closest<HTMLElement>('[data-rival]');
    if (rival) return focusRival(rival.dataset.rival!);
    if (t.closest('[data-clear-rival]') && state.rival) return focusRival(state.rival.name);
    const story = t.closest<HTMLElement>('[data-storyline]');
    if (story) return o.openStoryline(story.dataset.storyline!);
    if (t.closest('.panel-close')) {
      if (state.choice) {
        state.choice = null;
        refresh();
      } else clear();
      return;
    }
    if (t.closest('.restore')) return clear();
    if (t.closest('.reset')) {
      controls.search.value = '';
      state.search = '';
      state.kind = 'all';
      state.promotion = 'all';
      state.division = 'all';
      refresh();
    }
  });
  detail.addEventListener('toggle', () => placePanel(), true);
  yearSelect.addEventListener('change', () => zoomYear(yearSelect.value));

  // Sideways scrolling moves through time; pinch or ctrl-scroll zooms around the pointer.
  lanes.addEventListener(
    'wheel',
    (e) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!sideways && !e.ctrlKey) return;
      e.preventDefault();
      const [first, last] = navDomain();
      const span = state.to - state.from;
      if (e.ctrlKey) {
        const at = dayAt(e.clientX - lanes.getBoundingClientRect().left);
        const factor = Math.exp(e.deltaY * 0.01);
        const next = Math.max(7, Math.min(last - first, span * factor));
        const ratio = (at - state.from) / span;
        state.from = Math.round(Math.max(first, at - ratio * next));
        state.to = Math.round(Math.min(last, state.from + next));
      } else {
        const delta = ((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / (geometry.right - geometry.left)) * span;
        const move = Math.max(first - state.from, Math.min(last - state.to, delta));
        state.from = Math.round(state.from + move);
        state.to = Math.round(state.to + move);
      }
      if (state.focus) state.focus.year = null;
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
  let wheelTimer = 0;
  const throttledDrag = frameThrottle(() => refresh('drag'));

  // Filters.
  let searchTimer = 0;
  controls.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = controls.search.value.trim();
      state.selected = null;
      state.choice = null;
      refresh();
    }, 120);
  });
  controls.kind.addEventListener('change', () => {
    state.kind = controls.kind.value as KindFilter;
    refresh();
  });
  controls.promotion.addEventListener('change', () => {
    state.promotion = controls.promotion.value;
    state.choice = null;
    // A selected moment from another promotion would vanish from its own lanes: let it go.
    if (state.selected && !promotionOk(state.selected)) {
      state.selected = null;
      state.anchor = null;
    }
    fitPromotion();
    refresh();
  });
  controls.division.addEventListener('change', () => {
    state.division = controls.division.value as DivisionFilter;
    state.choice = null;
    refresh();
  });
  const fromInputs = () => {
    const a = dayNum(controls.from.value);
    const b = dayNum(controls.to.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) return;
    state.focus = null;
    state.from = Math.max(dayNum('1900-01-01'), a);
    state.to = Math.min(asOf, b);
    refresh();
  };
  controls.from.addEventListener('change', fromInputs);
  controls.to.addEventListener('change', fromInputs);
  controls.month.addEventListener('change', () => {
    const v = controls.month.value;
    if (v === 'all') {
      state.from = archiveFirst;
      state.to = asOf;
    } else if (/^\d{4}-\d{2}$/.test(v)) {
      state.from = dayNum(`${v}-01`);
      const end = new Date(Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)), 0)).toISOString().slice(0, 10);
      state.to = Math.min(asOf, dayNum(end));
    } else return;
    state.focus = null;
    refresh();
  });
  // Month list, newest first.
  const months: string[] = [];
  for (let y = Number(model.asOf.slice(0, 4)); y >= Number(model.first.slice(0, 4)); y--) for (let m = 12; m >= 1; m--) {
    const v = `${y}-${String(m).padStart(2, '0')}`;
    if (v <= model.asOf.slice(0, 7) && v >= model.first.slice(0, 7)) months.push(v);
  }
  controls.month.innerHTML = `<option value="custom" disabled>Custom range</option><option value="all">All dates</option>${months.map((m) => `<option value="${m}">${fmtMonth(`${m}-01`)}</option>`).join('')}`;
  controls.from.min = model.first;
  controls.from.max = model.asOf;
  controls.to.min = model.first;
  controls.to.max = model.asOf;

  window.addEventListener('scroll', onScroll, { passive: true });
  // Lane height changes with every layout, so only a change of width means a new geometry.
  let lastWidth = 0;
  new ResizeObserver(
    frameThrottle(() => {
      if (lanes.clientWidth === lastWidth) return;
      lastWidth = lanes.clientWidth;
      refresh('settle');
    }),
  ).observe(lanes);

  const defaultFrom = state.from;
  const defaultTo = state.to;

  /** The state worth keeping in the URL. Dates are left out while they are the default ones. */
  function getState(): CareersState {
    const out: CareersState = {};
    if (state.focus) out.person = model.people[state.focus.person].id;
    if (state.selected) out.moment = state.selected.id;
    if (state.focus?.year) out.year = state.focus.year;
    const fitted = state.focus ? !state.focus.year && state.from === state.focus.from && state.to === state.focus.to : state.from === defaultFrom && state.to === defaultTo;
    if (!fitted && !state.focus?.year && !state.selected) {
      out.from = isoDay(state.from);
      out.to = isoDay(state.to);
    }
    if (state.promotion !== 'all') out.promotion = state.promotion;
    if (state.division !== 'all') out.division = state.division;
    return out;
  }

  /** Puts the timeline into a state read from a URL. Unknown ids are ignored. */
  function apply(s: CareersState) {
    state.selected = null;
    state.choice = null;
    state.rival = null;
    state.focus = null;
    state.previous = null;
    state.from = defaultFrom;
    state.to = defaultTo;
    state.promotion = s.promotion && model.promotions.has(s.promotion) ? s.promotion : 'all';
    state.division = s.division === 'men' || s.division === 'women' ? s.division : 'all';
    const person = s.person ? model.byId.get(s.person) : undefined;
    if (person) {
      const span = careerSpan(model, person.i);
      state.focus = { person: person.i, span, ...focusRange(span), year: null };
      state.from = state.focus.from;
      state.to = state.focus.to;
      if (s.year && /^\d{4}$/.test(s.year)) zoomYear(s.year, false);
    }
    const from = s.from ? dayNum(s.from) : NaN;
    const to = s.to ? dayNum(s.to) : NaN;
    if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
      state.from = Math.max(dayNum('1900-01-01'), from);
      state.to = Math.min(asOf, to);
    }
    const m = s.moment ? model.momentById.get(s.moment) : undefined;
    if (m) {
      if (!promotionOk(m)) state.promotion = 'all';
      const sel = [...new Set([...m.people, ...m.involved])];
      state.anchor = person && sel.includes(person.i) ? person.i : sel[0];
      state.focus = null;
      state.selected = m;
      if (m.day < state.from || m.day > state.to) {
        const span = state.to - state.from;
        state.from = Math.max(archiveFirst, m.day - Math.round(span / 2));
        state.to = Math.min(asOf, state.from + span);
      }
    }
    if (!s.from && !s.to) fitPromotion();
    // Coming back to the plain A to Z view restores the default dates.
    if (state.focus || state.selected) state.previous = { from: defaultFrom, to: defaultTo, scroll: 0 };
    refresh();
    const target = state.selected ? state.anchor : state.focus?.person;
    if (target !== undefined && target !== null) scrollToRow(target, true);
  }

  return {
    refresh,
    /** Repaints after the view was hidden, if anything changed meanwhile. */
    show: () => {
      if (stale || !rows.length) refresh();
    },
    focusPerson: (id: string, opts?: { year?: string }) => {
      const p = model.byId.get(id);
      if (p) focusPerson(p.i, { ...opts, quiet: true });
    },
    select: (id: string) => {
      const m = model.momentById.get(id);
      if (m) select(m);
    },
    getState,
    apply,
    /** Sets the promotion and division without other changes (the shared filters changed while
     * Statistics was showing). */
    setFilters: (promotion?: string, division?: string) => {
      state.promotion = promotion && model.promotions.has(promotion) ? promotion : 'all';
      state.division = division === 'men' || division === 'women' ? division : 'all';
      refresh();
    },
    /** What the page is about right now, for the document title. */
    subject: () => (state.focus ? model.people[state.focus.person].name : state.selected ? `${state.selected.title}, ${state.selected.show.label}` : null),
    hidePreview,
  };
}

export type Careers = ReturnType<typeof createCareers>;
