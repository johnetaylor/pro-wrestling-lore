// The time navigator: a scrub bar like a video editor's. The window is the visible range;
// drag an edge to zoom, drag the middle to move, click the track to jump there. Behind the
// window, a density strip shows where the archive has moments.
import { fmtDate } from './dom.ts';
import { isoDay } from './model.ts';

export interface NavigatorOptions {
  /** Whole span the navigator covers, as day numbers. */
  domain(): [number, number];
  /** Current visible range, as day numbers. */
  range(): [number, number];
  /** Called while dragging (final = false) and when a change settles (final = true). */
  change(from: number, to: number, final: boolean): void;
  /** Moment counts across the domain, any number of bins. */
  density?(): number[];
  label?: string;
}

export interface Navigator {
  el: HTMLElement;
  sync(): void;
  drawDensity(): void;
}

const MIN_SPAN = 7; // days

export function createNavigator(o: NavigatorOptions): Navigator {
  const el = document.createElement('section');
  el.className = 'navigator';
  el.setAttribute('aria-label', o.label ?? 'Timeline zoom and navigation');
  el.innerHTML = `<div class="nav-bar">
<div class="nav-track">
<canvas class="nav-density" aria-hidden="true"></canvas>
<div class="nav-window">
<button type="button" class="nav-handle nav-start" role="slider" aria-label="Start of the visible time range"></button>
<button type="button" class="nav-move" aria-label="Move the visible time range"><span class="nav-move-label">Drag to move</span></button>
<button type="button" class="nav-handle nav-end" role="slider" aria-label="End of the visible time range"></button>
</div>
</div>
<button type="button" class="nav-all">Full range</button>
</div>
<div class="nav-labels"><span class="nav-first"></span><output class="nav-dates" aria-live="off"></output><span class="nav-last"></span></div>`;
  const track = el.querySelector<HTMLElement>('.nav-track')!;
  const win = el.querySelector<HTMLElement>('.nav-window')!;
  const canvas = el.querySelector<HTMLCanvasElement>('.nav-density')!;
  const moveLabel = el.querySelector<HTMLElement>('.nav-move-label')!;

  /** Track width and the smallest the window can get: wide enough for its label, except on a
   * narrow track, where the label goes so the window can still show a short range. */
  const metrics = () => {
    const width = track.clientWidth || 1;
    const narrow = width < 380;
    moveLabel.hidden = narrow;
    const minimum = Math.min(width - 1, narrow ? 18 : Math.ceil(moveLabel.getBoundingClientRect().width) + 52);
    return { width, minimum, travel: Math.max(1, width - minimum) };
  };

  function sync() {
    const [first, last] = o.domain();
    const [from, to] = o.range();
    const span = Math.max(1, last - first);
    const a = Math.max(0, (from - first) / span);
    const b = Math.min(1, (to - first) / span);
    const { width, minimum, travel } = metrics();
    win.style.left = `${((a * travel) / width) * 100}%`;
    win.style.width = `${((minimum + (b - a) * travel) / width) * 100}%`;
    el.querySelector('.nav-dates')!.textContent = `${fmtDate(isoDay(from))} to ${fmtDate(isoDay(to))}`;
    el.querySelector('.nav-first')!.textContent = isoDay(first).slice(0, 4);
    el.querySelector('.nav-last')!.textContent = isoDay(last).slice(0, 4);
    for (const [cls, d] of [['.nav-start', from], ['.nav-end', to]] as const) {
      const h = el.querySelector(cls)!;
      h.setAttribute('aria-valuemin', String(first));
      h.setAttribute('aria-valuemax', String(last));
      h.setAttribute('aria-valuenow', String(d));
      h.setAttribute('aria-valuetext', fmtDate(isoDay(d)));
    }
  }

  function drawDensity() {
    if (!o.density) return;
    const counts = o.density();
    const ratio = window.devicePixelRatio || 1;
    const w = track.clientWidth;
    const h = track.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(1, ...counts);
    const bw = w / counts.length;
    ctx.fillStyle = getComputedStyle(el).getPropertyValue('--nav-density').trim() || 'rgba(155,170,188,.35)';
    counts.forEach((c, i) => {
      if (!c) return;
      const bh = Math.max(1, Math.sqrt(c / max) * (h - 6));
      ctx.fillRect(i * bw, h - 3 - bh, Math.max(1, bw - 0.5), bh);
    });
  }

  // ---------- Dragging ----------
  type Drag = { mode: 'start' | 'end' | 'move'; x: number; a: number; b: number; first: number; last: number; travel: number };
  let drag: Drag | null = null;
  let frame = 0;
  const apply = (x: number): [number, number] => {
    const d = drag!;
    const delta = ((x - d.x) / d.travel) * (d.last - d.first);
    let a = d.a;
    let b = d.b;
    if (d.mode === 'start') a = Math.max(d.first, Math.min(b - MIN_SPAN, a + delta));
    else if (d.mode === 'end') b = Math.min(d.last, Math.max(a + MIN_SPAN, b + delta));
    else {
      const move = Math.max(d.first - a, Math.min(d.last - b, delta));
      a += move;
      b += move;
    }
    return [Math.round(a), Math.round(b)];
  };
  for (const [cls, mode] of [['.nav-start', 'start'], ['.nav-end', 'end'], ['.nav-move', 'move']] as const) {
    const handle = el.querySelector<HTMLElement>(cls)!;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const [first, last] = o.domain();
      const [a, b] = o.range();
      drag = { mode, x: e.clientX, a, b, first, last, travel: metrics().travel };
      handle.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || frame) return;
      const next = apply(e.clientX);
      frame = requestAnimationFrame(() => {
        frame = 0;
        o.change(next[0], next[1], false);
        sync();
      });
    });
    const end = (e: PointerEvent) => {
      if (!drag) return;
      cancelAnimationFrame(frame);
      frame = 0;
      const next = apply(e.clientX);
      drag = null;
      el.classList.remove('dragging');
      o.change(next[0], next[1], true);
      sync();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', () => {
      drag = null;
      el.classList.remove('dragging');
    });
    handle.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const [first, last] = o.domain();
      const [a, b] = o.range();
      const step = Math.max(1, Math.round((b - a) / 10)) * (e.shiftKey ? 10 : 1);
      const delta = e.key === 'ArrowLeft' ? -step : step;
      let x = a;
      let y = b;
      if (mode === 'start') x = e.key === 'Home' ? first : e.key === 'End' ? b - MIN_SPAN : Math.max(first, Math.min(b - MIN_SPAN, a + delta));
      else if (mode === 'end') y = e.key === 'End' ? last : e.key === 'Home' ? a + MIN_SPAN : Math.min(last, Math.max(a + MIN_SPAN, b + delta));
      else {
        const move = e.key === 'Home' ? first - a : e.key === 'End' ? last - b : Math.max(first - a, Math.min(last - b, delta));
        x += move;
        y += move;
      }
      o.change(x, y, true);
      sync();
    });
  }
  // Clicking the track outside the window centers the window there.
  track.addEventListener('pointerdown', (e) => {
    if (e.target !== track && e.target !== canvas) return;
    const [first, last] = o.domain();
    const [a, b] = o.range();
    const rect = track.getBoundingClientRect();
    const at = first + ((e.clientX - rect.left) / rect.width) * (last - first);
    const half = (b - a) / 2;
    const from = Math.max(first, Math.min(last - (b - a), Math.round(at - half)));
    o.change(from, from + (b - a), true);
    sync();
  });
  el.querySelector('.nav-all')!.addEventListener('click', () => {
    const [first, last] = o.domain();
    o.change(first, last, true);
    sync();
  });
  new ResizeObserver(() => {
    sync();
    drawDensity();
  }).observe(track);
  return { el, sync, drawDensity };
}

