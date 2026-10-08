// The career strip: one person's whole career on one time axis, drawn as SVG at build time.
// Rows, top to bottom: title reigns, every indexed match and segment (stacked by date),
// and runs in each promotion.
import type { Person, Promotion, PromotionPeriod, Reign, Title } from '../../scripts/lib/types.ts';
import { escapeHtml, html, raw, type Raw } from '../lib/html.ts';
import { formatDate, isPle } from '../lib/format.ts';
import type { Appearance, SiteData } from '../lib/load.ts';
import { titleUrl } from '../lib/urls.ts';
import { promotionNameAt, showLabel, titleNameAt } from './bits.ts';

const W = 1200;
const LEFT = 84;
const RIGHT = 8;
const PLOT = W - LEFT - RIGHT;
const DAY = 86400000;
const t = (iso: string) => Date.parse(iso.length === 4 ? `${iso}-07-01` : iso.length === 7 ? `${iso}-15` : iso);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Band {
  promotion: string; // promotion id, or 'other' for territories and promotions we don't track
  label: string;
  start: number;
  end: number;
  note?: string;
  period?: PromotionPeriod;
}

/** The promotion id behind a free-text name such as "WWF/WWE" or "NJPW", if it is one we track. */
export function promotionIdFor(name: string, promotions: Map<string, Promotion>): string | undefined {
  const parts = name.split('/').map((x) => x.trim().toLowerCase());
  for (const p of promotions.values()) {
    const names = [p.id, p.name, ...(p.aliases ?? [])].map((x) => x.toLowerCase());
    if (parts.some((x) => names.includes(x))) return p.id;
  }
  return undefined;
}

/** Runs in each promotion: curated periods when we have them, otherwise derived from appearances. */
export function promotionBands(person: Person, apps: Appearance[], promotions: Map<string, Promotion>, today: string): Band[] {
  const curated = person.curated?.promotionPeriods ?? [];
  if (curated.length) {
    // An open-ended period is a run still going: draw it to today, or to the end of the career.
    const openEnd = t(person.displayThrough && person.displayThrough < today ? person.displayThrough : today);
    return curated
      .filter((p) => p.start)
      .map((p) => {
        const id = promotionIdFor(p.name, promotions);
        const label = id ? promotionNameAt(id, p.start!, p.name) : p.name;
        return { promotion: id ?? 'other', label, start: t(p.start!), end: p.end ? t(p.end) : openEnd, note: p.fullName ?? p.name, period: p };
      });
  }
  const byPromotion = new Map<string, number[]>();
  for (const a of apps) {
    if (!byPromotion.has(a.show.promotion)) byPromotion.set(a.show.promotion, []);
    byPromotion.get(a.show.promotion)!.push(t(a.show.date));
  }
  const bands: Band[] = [];
  for (const [promotion, times] of byPromotion) {
    times.sort((a, b) => a - b);
    let start = times[0];
    let prev = times[0];
    for (const x of [...times.slice(1), Infinity]) {
      if (x - prev > 540 * DAY) {
        const label = promotionNameAt(promotion, iso(start), promotions.get(promotion)?.name ?? promotion);
        bands.push({ promotion, label, start, end: prev });
        start = x;
      }
      prev = x;
    }
  }
  return bands;
}

/** Packs intervals into as few rows as possible. */
function pack<T extends { start: number; end: number }>(items: T[], gap: number): T[][] {
  const rows: T[][] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const row = rows.find((r) => r.at(-1)!.end + gap <= item.start);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows;
}

const DOT_R = 1.6;
const DOT_STEP = 3.7; // vertical distance between stacked dots
const BIN = 3.7; // horizontal width of one stack
const MAX_STACK = 22;

export function careerStrip(person: Person, site: SiteData, opts: { signature?: Set<string>; today?: string } = {}): Raw | null {
  const today = opts.today ?? iso(Date.now());
  const now = t(today);
  const apps = site.appearances.get(person.id) ?? [];
  const reigns: { title: Title; reign: Reign }[] = site.reignsByPerson.get(person.id) ?? [];
  const bandsRaw = promotionBands(person, apps, site.promotions, today);
  if (!apps.length && !reigns.length && !bandsRaw.length) return null;

  // Time domain: everything we know about the career, padded to at least two years.
  const times = [
    ...apps.map((a) => t(a.show.date)),
    ...reigns.flatMap((r) => [t(r.reign.start), r.reign.end ? t(r.reign.end) : now]),
    ...bandsRaw.flatMap((b) => [b.start, b.end]),
  ];
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 - t0 < 730 * DAY) {
    const mid = (t0 + t1) / 2;
    t0 = mid - 365 * DAY;
    t1 = mid + 365 * DAY;
  }
  const pad = (t1 - t0) * 0.01;
  t0 -= pad;
  t1 += pad;
  const x = (ms: number) => LEFT + ((ms - t0) / (t1 - t0)) * PLOT;

  // Year ticks at a readable interval.
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const span = y1 - y0;
  const step = span <= 6 ? 1 : span <= 14 ? 2 : span <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let yr = Math.ceil(y0 / step) * step; yr <= y1; yr += step) if (Date.UTC(yr, 0, 1) >= t0) ticks.push(yr);

  const parts: string[] = [];
  let y = 22;

  // Row: title reigns.
  const reignRows = pack(
    reigns.map((r) => ({ ...r, start: t(r.reign.start), end: r.reign.end ? t(r.reign.end) : now })),
    2 * DAY,
  );
  const reignTop = y;
  for (const row of reignRows) {
    for (const r of row) {
      const x0 = x(r.start);
      const w = Math.max(3, x(r.end) - x0);
      const label = titleNameAt(r.title, r.reign.start, r.title.short ?? r.title.name.replace(/ Championship.*$/, ''));
      const tip = `${titleNameAt(r.title, r.reign.start)}: ${formatDate(r.reign.start)} to ${r.reign.end ? formatDate(r.reign.end) : 'present'}`;
      parts.push(
        `<a href="${titleUrl(r.title.id)}#${r.reign.id}" aria-label="${escapeHtml(tip)}"><rect class="reign" x="${x0.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="14" rx="2"><title>${escapeHtml(tip)}</title></rect>${
          w > label.length * 6.4 + 10 ? `<text class="reign-label" x="${(x0 + 5).toFixed(1)}" y="${y + 11}">${escapeHtml(label)}</text>` : ''
        }</a>`,
      );
    }
    y += 18;
  }
  if (reignRows.length) parts.push(`<text class="lane-label" x="0" y="${reignTop + 11}">Titles</text>`);

  // Row: matches and segments, stacked by date. The row is as tall as its tallest stack.
  const placed: { a: Appearance; bin: number; k: number }[] = [];
  const stacks = new Map<number, number>();
  let hidden = 0;
  for (const a of apps) {
    const bin = Math.round((x(t(a.show.date)) - LEFT) / BIN);
    const k = stacks.get(bin) ?? 0;
    stacks.set(bin, k + 1);
    if (k >= MAX_STACK) hidden++;
    else placed.push({ a, bin, k });
  }
  const tallest = Math.min(MAX_STACK, Math.max(1, ...stacks.values()));
  const dotsTop = y + 8;
  const base = dotsTop + Math.max(18, tallest * DOT_STEP + 2);
  const rings: string[] = [];
  for (const { a, bin, k } of placed) {
    const kind = site.series.get(a.show.series)?.kind;
    const cls = a.role === 'involved' ? 'dot dot--involved' : a.seg.type !== 'match' ? 'dot dot--segment' : isPle(a.show, kind) ? 'dot dot--ple' : 'dot';
    const tip = `${showLabel(a.show, site)}, ${formatDate(a.show.date)}: ${a.seg.title}`;
    const px = (LEFT + bin * BIN).toFixed(1);
    const py = (base - DOT_STEP / 2 - 0.4 - k * DOT_STEP).toFixed(1);
    if (opts.signature?.has(`${a.show.id}#${a.seg.key}`)) rings.push(`<circle class="signature-ring" cx="${px}" cy="${py}" r="4"/>`);
    parts.push(`<circle class="${cls}" cx="${px}" cy="${py}" r="${DOT_R}" data-href="/shows/${a.show.id}/#${a.seg.key}"><title>${escapeHtml(tip)}</title></circle>`);
  }
  parts.push(...rings);
  parts.push(`<line class="axis-line" x1="${LEFT}" x2="${W - RIGHT}" y1="${base}" y2="${base}"/>`);
  if (apps.length) parts.push(`<text class="lane-label" x="0" y="${base - 4}">Matches</text>`);
  y = base + 10;

  // Row: promotion runs.
  const bandRows = pack(bandsRaw, 6 * DAY);
  const bandTop = y;
  for (const row of bandRows) {
    for (const b of row) {
      const x0 = x(b.start);
      const w = Math.max(3, x(b.end) - x0);
      const tip = `${b.note ?? b.label}: ${formatDate(iso(b.start))} to ${b.end >= now - DAY ? 'present' : formatDate(iso(b.end))}`;
      parts.push(
        `<g><rect class="band" x="${x0.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="15" rx="2" style="fill:var(--p-${b.promotion}, var(--p-other))"><title>${escapeHtml(tip)}</title></rect>${
          w > b.label.length * 6.4 + 10 ? `<text class="band-label" x="${(x0 + 5).toFixed(1)}" y="${y + 11.5}">${escapeHtml(b.label)}</text>` : ''
        }</g>`,
      );
    }
    y += 19;
  }
  if (bandRows.length) parts.push(`<text class="lane-label" x="0" y="${bandTop + 12}">Promotions</text>`);
  const height = y + 4;

  // Axis on top, with faint year lines through all rows.
  const axis = ticks
    .map((yr) => {
      const xx = x(Date.UTC(yr, 0, 1));
      return `<line class="grid-line" x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="14" y2="${height - 4}"/><text class="axis-label" x="${xx.toFixed(1)}" y="10" text-anchor="middle">${yr}</text>`;
    })
    .join('');

  const matches = apps.filter((a) => a.seg.type === 'match' && a.role === 'competitor').length;
  const others = apps.length - matches;
  const label = `Career timeline for ${person.name}, ${new Date(t0 + pad).getUTCFullYear()} to ${new Date(t1 - pad).getUTCFullYear()}: ${matches} matches, ${others} other appearances, ${reigns.length} title reigns.`;
  const svg = `<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeHtml(label)}">${axis}${parts.join('')}</svg>`;
  const keys: [string, string][] = [];
  if (apps.some((a) => a.seg.type === 'match' && a.role === 'competitor')) {
    keys.push(['<circle class="dot" cx="6" cy="6" r="3"/>', 'Match']);
    keys.push(['<circle class="dot dot--ple" cx="6" cy="6" r="3"/>', 'Pay-per-view or special']);
  }
  if (apps.some((a) => a.seg.type !== 'match')) keys.push(['<circle class="dot dot--segment" cx="6" cy="6" r="3"/>', 'Promo or appearance']);
  if (apps.some((a) => a.role === 'involved')) keys.push(['<circle class="dot dot--involved" cx="6" cy="6" r="2.6"/>', 'Involved, not competing']);
  if (rings.length) keys.push(['<circle class="signature-ring" cx="6" cy="6" r="4.6"/><circle class="dot" cx="6" cy="6" r="2"/>', 'Signature match']);
  if (reigns.length) keys.push(['<rect class="reign" x="0" y="3" width="12" height="6" rx="1"/>', 'Title reign']);
  if (bandsRaw.length) keys.push(['<rect x="0" y="3" width="6" height="6" style="fill:var(--p-wwe)"/><rect x="6" y="3" width="6" height="6" style="fill:var(--p-wcw)"/>', 'Run in a promotion, by color']);
  const legend = keys.map(([shape, text]) => `<li><svg class="key" viewBox="0 0 12 12" aria-hidden="true">${shape}</svg>${escapeHtml(text)}</li>`).join('');
  const note = hidden ? `<p>${hidden} more on the busiest dates are not drawn; every one is listed below.</p>` : '';
  return html`<figure class="strip career-strip"><div class="strip__scroll">${raw(svg)}</div><figcaption><ul class="legend">${raw(legend)}</ul>${raw(note)}</figcaption></figure>`;
}
