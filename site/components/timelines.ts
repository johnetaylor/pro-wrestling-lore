// Build-time SVG timelines for championships and for the whole archive.
import type { Title } from '../../scripts/lib/types.ts';
import { escapeHtml, html, raw, type Raw } from '../lib/html.ts';
import { formatDate } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';

const W = 1200;
const t = (iso: string) => Date.parse(iso.length === 4 ? `${iso}-07-01` : iso.length === 7 ? `${iso}-15` : iso);

function yearTicks(t0: number, t1: number, x: (ms: number) => number, top: number, bottom: number): string {
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const span = y1 - y0;
  const step = span <= 6 ? 1 : span <= 14 ? 2 : span <= 30 ? 5 : 10;
  let out = '';
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const ms = Date.UTC(y, 0, 1);
    if (ms < t0) continue;
    const xx = x(ms).toFixed(1);
    out += `<line class="grid-line" x1="${xx}" x2="${xx}" y1="${top}" y2="${bottom}"/><text class="axis-label" x="${xx}" y="${top - 4}" text-anchor="middle">${y}</text>`;
  }
  return out;
}

/** Every reign of one title as a bar on a single line; gaps are reigns not yet in the archive. */
export function reignStrip(title: Title, today: string): Raw | null {
  // Lineal reigns only: interim and unrecognized ones run beside them and are listed below.
  const reigns = title.reigns.filter((r) => !r.kind);
  if (!reigns.length) return null;
  const now = t(today);
  const traced = !!title.established;
  const spans = reigns.map((r) => ({ r, start: t(r.start), end: r.end ? t(r.end) : title.retired ? t(title.retired) : now }));
  let t0 = Math.min(...spans.map((s) => s.start));
  let t1 = Math.max(...spans.map((s) => s.end));
  const pad = Math.max((t1 - t0) * 0.01, 15 * 86400000);
  t0 -= pad;
  t1 += pad;
  const L = 8;
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0)) * (W - 2 * L);
  const top = 24;
  const bars = spans
    .map(({ r, start, end }, i) => {
      const x0 = x(start);
      const w = Math.max(2.5, x(end) - x0);
      const tip = `${r.holder}: ${formatDate(r.start)} to ${r.end ? formatDate(r.end) : 'present'}`;
      const label = w > r.holder.length * 6.4 + 10 ? `<text class="reign-label" x="${(x0 + 5).toFixed(1)}" y="${top + 17}">${escapeHtml(r.holder)}</text>` : '';
      return `<a href="#${r.id}" aria-label="${escapeHtml(tip)}"><rect class="reign" style="opacity:${i % 2 ? 0.72 : 1}" x="${x0.toFixed(1)}" y="${top + 4}" width="${w.toFixed(1)}" height="20" rx="2"><title>${escapeHtml(tip)}</title></rect>${label}</a>`;
    })
    .join('');
  const height = top + 34;
  const svg = `<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeHtml(`${reigns.length} reigns of the ${title.name}`)}">${yearTicks(t0, t1, x, top, height - 2)}${bars}</svg>`;
  return html`<figure class="strip">${raw(svg)}<figcaption>Each bar is one reign; select a bar to jump to it below. ${traced ? 'Gaps are vacancies and the times the title was inactive.' : 'Gaps are reigns not yet in the archive, not vacancies.'}</figcaption></figure>`;
}

const LANE_ORDER = ['awa', 'wwe', 'wcw', 'ecw', 'tna', 'aew', 'roh', 'njpw', 'aaa', 'cmll', 'stardom', 'indy'];

/** The shape of the archive: shows per month for each promotion. */
export function archiveChart(site: SiteData): Raw {
  const counts = new Map<string, Map<string, number>>();
  let first = '9999';
  let last = '0000';
  for (const s of site.shows.values()) {
    const m = s.date.slice(0, 7);
    if (!counts.has(s.promotion)) counts.set(s.promotion, new Map());
    const c = counts.get(s.promotion)!;
    c.set(m, (c.get(m) ?? 0) + 1);
    if (m < first) first = m;
    if (m > last) last = m;
  }
  const lanes = LANE_ORDER.filter((p) => counts.has(p));
  const t0 = Date.UTC(Number(first.slice(0, 4)), 0, 1);
  const t1 = Date.UTC(Number(last.slice(0, 4)) + 1, 0, 1);
  const L = 70;
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0)) * (W - L - 4);
  const LANE = 26;
  const top = 22;
  const monthW = (W - L - 4) / ((t1 - t0) / (30.44 * 86400000));
  const max = Math.max(...[...counts.values()].flatMap((c) => [...c.values()]));
  let body = '';
  lanes.forEach((p, i) => {
    const y = top + i * LANE;
    const name = site.promotions.get(p)?.name ?? p;
    body += `<text class="lane-label" x="0" y="${y + LANE - 9}">${escapeHtml(name)}</text>`;
    body += `<line class="axis-line" x1="${L}" x2="${W - 4}" y1="${y + LANE - 4}" y2="${y + LANE - 4}"/>`;
    for (const [m, n] of counts.get(p)!) {
      const h = Math.max(1.5, (Math.sqrt(n) / Math.sqrt(max)) * (LANE - 8));
      const ms = Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
      body += `<rect x="${x(ms).toFixed(1)}" y="${(y + LANE - 4 - h).toFixed(1)}" width="${Math.max(1, monthW - 0.4).toFixed(2)}" height="${h.toFixed(1)}" style="fill:var(--p-${p}, var(--text-3))"><title>${escapeHtml(`${name}, ${formatDate(m)}: ${n} show${n === 1 ? '' : 's'}`)}</title></rect>`;
    }
  });
  const height = top + lanes.length * LANE + 4;
  const svg = `<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Indexed shows per month by promotion, ${first.slice(0, 4)} to ${last.slice(0, 4)}">${yearTicks(t0, t1, x, top, height - 4)}${body}</svg>`;
  return html`<figure class="strip">${raw(svg)}<figcaption>Indexed shows per month for each promotion. Taller bars are busier months; empty stretches are history still to be added.</figcaption></figure>`;
}
