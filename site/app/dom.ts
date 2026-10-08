// Small browser helpers shared by the explorer views.

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Mar 10, 1997" (short) or "March 10, 1997"; month and year precision print as "Mar 1997" and "1997". */
export function fmtDate(iso: string | undefined, long = false): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = long ? LONG : MONTHS;
  if (!m) return String(y);
  if (!d) return `${months[m - 1]} ${y}`;
  return `${months[m - 1]} ${d}, ${y}`;
}

export const fmtMonth = (iso: string) => `${LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export const num = (n: number) => n.toLocaleString('en-US');

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs fn at most once per animation frame. */
export function frameThrottle(fn: () => void): () => void {
  let pending = 0;
  return () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      fn();
    });
  };
}

/** The live-region announcer for screen readers. */
export function announce(text: string) {
  const el = document.getElementById('announcer');
  if (el) el.textContent = text;
}
