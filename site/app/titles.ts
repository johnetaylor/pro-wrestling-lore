// Championships: every title's reigns on a timeline with the scrub bar, and for the titles v69
// traced, the tree of how the belts connect. Belt pictures stay out: v69's were WWE images.
import { announce, esc, fmtDate, frameThrottle, plural, reducedMotion } from './dom.ts';
import { dayNum, isoDay, type LineageNode, type Reign, type TitleBundle, type TitleRef } from './model.ts';
import { createNavigator } from './navigator.ts';
import { chips, eventCard } from './panels.ts';
import { fitDiagram, ZOOM } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';

type Mode = 'history' | 'reigns';

/** Promotion order for the championship list. */
const ORDER = ['wwe', 'aew', 'tna', 'njpw', 'aaa', 'roh', 'cmll', 'stardom', 'wcw', 'ecw', 'awa'];
const KIND: Record<string, string> = {
  origin: 'Title begins',
  merge: 'Titles unified',
  shared: 'Held together, two records',
  retire: 'One record ends',
  revive: 'Original title revived',
  split: 'Titles separated',
};
// Tree geometry, as v69 drew it, with cards shorter for having no belt pictures.
const CARD_W = 234;
const CARD_H = 132;
const GAP = 26;
const STEP = CARD_H + 92;

interface Placed extends LineageNode {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export function createTitlesView(ctx: AppContext, bundle: TitleBundle): AppView {
  const { model } = ctx;
  const L = bundle.lineage;
  const asOf = dayNum(model.asOf);
  const titleById = new Map(model.titles.map((t) => [t.id, t]));
  const reignsOf = new Map<TitleRef, Reign[]>();
  for (const r of model.reigns) {
    if (!reignsOf.has(r.title)) reignsOf.set(r.title, []);
    reignsOf.get(r.title)!.push(r);
  }
  for (const list of reignsOf.values()) list.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const promotionOf = (t: TitleRef) => bundle.titles[t.id]?.[0] ?? '';
  /** The lineage view whose tree ends in this title. */
  const treeFor = (t: TitleRef) => Object.entries(L.views).find(([vid, v]) => v.title === t.id && L.trees[vid])?.[0] ?? null;

  const state = {
    title: null as TitleRef | null,
    mode: 'history' as Mode,
    reign: null as Reign | null,
    node: null as string | null,
    from: 0,
    to: asOf,
  };

  const groups = [...new Set([...ORDER, ...model.titles.map(promotionOf)])]
    .map((p) => ({
      id: p,
      name: p ? model.promotions.get(p)?.name ?? p.toUpperCase() : 'Other promotions',
      titles: model.titles
        .filter((t) => promotionOf(t) === p && reignsOf.get(t)?.length)
        .sort((a, b) => (bundle.titles[b.id]?.[1] ?? 0) - (bundle.titles[a.id]?.[1] ?? 0) || Number(!!treeFor(b)) - Number(!!treeFor(a)) || reignsOf.get(b)!.length - reignsOf.get(a)!.length || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.titles.length)
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1));

  const el = section(
    'titles',
    `<div class="app-tools"><div class="filters">
<label class="f-title">Championship<select data-control="title"><option value="">All championships</option>${groups
      .map((g) => `<optgroup label="${esc(g.name)}">${g.titles.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup>`)
      .join('')}</select></label>
<label>View<select data-control="title-mode"><option value="history">Title history</option><option value="reigns">Champion reigns</option></select></label>
</div></div>
<div class="app-view titles-view"></div>`,
  );
  const select = el.querySelector<HTMLSelectElement>('[data-control="title"]')!;
  const modeSelect = el.querySelector<HTMLSelectElement>('[data-control="title-mode"]')!;
  const root = el.querySelector<HTMLElement>('.titles-view')!;

  // ---------- All championships ----------
  function directoryHtml(): string {
    const total = groups.reduce((n, g) => n + g.titles.length, 0);
    return `<div class="explorer-head"><div><h1 class="view-title">Championships</h1><p class="view-subtitle">${plural(total, 'championship')} with indexed reigns. Select one for its champions on a timeline; the six main WWE titles also show how their belts connect.</p></div></div>
${groups
  .map(
    (g) => `<section class="title-group"><h2 class="promo-head" style="--c:var(--p-${g.id || 'other'}, var(--p-other))">${esc(g.name)}</h2><ul class="title-list">${g.titles
      .map((t) => {
        const list = reignsOf.get(t)!;
        const current = list.filter((r) => !r.end);
        const first = list[0].start.slice(0, 4);
        const last = list.some((r) => !r.end) ? 'present' : list.map((r) => r.end).sort().at(-1)!.slice(0, 4);
        return `<li><button type="button" class="title-link" data-title="${esc(t.id)}"><strong>${esc(t.name)}</strong><span>${plural(list.length, 'reign')}, ${first}${first !== last ? ` to ${last}` : ''}${treeFor(t) ? ', with its title history' : ''}</span>${current.length ? `<span class="title-champ">Champion: ${esc(current.map((r) => r.holder).join(', '))}</span>` : ''}</button></li>`;
      })
      .join('')}</ul></section>`,
  )
  .join('')}`;
  }

  // ---------- Title history tree ----------
  const ev = (id: string) => L.events.find((e) => e.id === id);
  const evDate = (id: string) => {
    const e = ev(id);
    return e ? fmtDate(e.precision === 'year' ? e.date.slice(0, 4) : e.precision === 'month' ? e.date.slice(0, 7) : e.date) : '';
  };
  const nodeName = (n: LineageNode) => n.name || L.titles[n.track]?.name || n.track;
  const nodeType = (n: LineageNode) => n.type ?? (n.event ? ev(n.event)?.kind : undefined) ?? 'merge';
  const nodeCaption = (n: LineageNode) => {
    if (n.caption) return n.caption;
    if (nodeType(n) === 'origin' && !n.event && !n.events) {
      const t = L.titles[n.track];
      return t?.originLabel ?? `Established ${fmtDate(t?.precision === 'year' ? t.start.slice(0, 4) : t?.precision === 'month' ? t.start.slice(0, 7) : t?.start)}`;
    }
    return evDate(n.event ?? n.events?.[0] ?? '');
  };

  function layoutTree(root: LineageNode, outputs: LineageNode[] = []) {
    const nodes: Placed[] = [];
    const links: { from: Placed; to: Placed; label: string; type: string; onTarget?: boolean }[] = [];
    const measure = (n: LineageNode): Placed => {
      const parents = (n.parents ?? []).map(measure);
      const width = Math.max(CARD_W, parents.reduce((s, p) => s + p.width, 0) + Math.max(0, parents.length - 1) * GAP);
      const depth = parents.length ? 1 + Math.max(...parents.map((p) => p.depth)) : 0;
      return { ...n, parents, x: 0, y: 0, width, depth };
    };
    const top = measure(root);
    const width = Math.max(top.width, outputs.length * (CARD_W + GAP) - GAP) + 40;
    const place = (n: Placed, left: number) => {
      n.x = left + n.width / 2 - CARD_W / 2;
      n.y = 20 + n.depth * STEP;
      nodes.push(n);
      let next = left;
      for (const p of n.parents as Placed[]) {
        place(p, next);
        links.push({ from: p, to: n, label: p.edge ?? '', type: nodeType(n) });
        next += p.width + GAP;
      }
    };
    place(top, (width - top.width) / 2);
    if (outputs.length) {
      const left = (width - (outputs.length * CARD_W + (outputs.length - 1) * GAP)) / 2;
      outputs.forEach((o, i) => {
        const n: Placed = { ...o, x: left + i * (CARD_W + GAP), y: top.y + STEP, width: CARD_W, depth: top.depth + 1 };
        nodes.push(n);
        links.push({ from: top, to: n, label: o.edge ?? '', type: nodeType(o), onTarget: true });
      });
    }
    return { nodes, links, width, height: Math.max(...nodes.map((n) => n.y)) + CARD_H + 24 };
  }

  function treeHtml(vid: string): string {
    const tree = L.trees[vid];
    const g = layoutTree(tree.root, tree.outputs);
    const card = (n: Placed) => {
      const promo = L.promotions[n.track];
      return `<button type="button" class="lineage-card ${nodeType(n)}${state.node === n.id ? ' active' : ''}" style="left:${n.x}px;top:${n.y}px" data-node="${esc(n.id)}" aria-expanded="${state.node === n.id}"><span class="lineage-promo ${esc(promo?.tone ?? '')}">${esc(promo?.label ?? '')}</span><span class="lineage-kind">${esc(KIND[nodeType(n)] ?? 'Championship')}</span><strong>${esc(nodeName(n))}</strong><span class="lineage-date">${esc(nodeCaption(n))}</span><span class="lineage-more">Details and sources</span></button>`;
    };
    const connector = (l: { from: Placed; to: Placed; label: string; type: string; onTarget?: boolean }) => {
      const x1 = l.from.x + CARD_W / 2;
      const y1 = l.from.y + CARD_H;
      const x2 = l.to.x + CARD_W / 2;
      const y2 = l.to.y;
      const mid = y2 - 46;
      const lx = l.onTarget ? x2 : x1;
      const ly = l.onTarget ? y2 - 38 : y1 + 12;
      return `<path class="lineage-edge ${esc(l.type)}" d="M${x1},${y1} V${mid} H${x2} V${y2}"/>${
        l.label ? `<g class="lineage-label"><rect x="${lx - 100}" y="${ly}" width="200" height="24" rx="6"/><text x="${lx}" y="${ly + 16}" text-anchor="middle">${esc(l.label)}</text></g>` : ''
      }`;
    };
    const selected = state.node ? g.nodes.find((n) => n.id === state.node) : null;
    return `<section class="lineage" data-lineage="${esc(vid)}">
<div class="lineage-head"><div><h2>How the belts connect</h2><p>${esc(tree.intro)}</p></div>${ZOOM}</div>
<p class="range-hint">Older titles above, the titles they became below. Select a title for its dates, story and sources.</p>
<div class="lineage-frame" tabindex="0" role="region" aria-label="Title history diagram"><div class="lineage-stage"><div class="lineage-canvas" style="width:${g.width}px;height:${g.height}px"><svg width="${g.width}" height="${g.height}" aria-hidden="true">${g.links.map(connector).join('')}</svg>${g.nodes.map(card).join('')}</div></div></div>
${selected ? `<div class="detail inline lineage-detail">${nodeDetail(selected)}</div>` : ''}
<div class="lineage-notes">${tree.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>
<details class="lineage-background"><summary>Background and coverage</summary>${tree.background.map((p) => `<p>${esc(p)}</p>`).join('')}<p>${esc(L.coverage)}</p></details>
</section>`;
  }

  function nodeDetail(n: LineageNode): string {
    const t = L.titles[n.track];
    const promo = L.promotions[n.track];
    const record = t ? titleById.get(t.title) : undefined;
    const events = [n.event, ...(n.events ?? [])].filter((x): x is string => !!x).map(ev).filter((e): e is NonNullable<ReturnType<typeof ev>> => !!e);
    const links = (urls: string[]) => (urls.length ? `<p class="source-links">${urls.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(new URL(u).hostname.replace(/^www\./, ''))}${urls.length > 1 ? ` ${i + 1}` : ''}</a>`).join('')}</p>` : '');
    return `<div class="panel-top"><span class="panel-kind">${esc(KIND[nodeType(n)] ?? 'Championship')}</span><button type="button" class="panel-close" aria-label="Close these details">&times;</button></div>
<p class="panel-date">${esc(nodeCaption(n))}</p>
<h2>${esc(nodeName(n))}</h2>
${promo ? `<p><strong>${esc(promo.label)}.</strong> ${esc(promo.text)}</p>` : ''}
${n.note ? `<p class="context">${esc(n.note)}</p>` : ''}
${events.map((e) => `<h3>${esc(evDate(e.id))}: ${esc(e.label)}</h3><p>${esc(e.text)}</p>${links(e.sources)}`).join('')}
${t ? `<h3>The record</h3><p>Established ${esc(fmtDate(t.start))}${t.first ? `; first champion ${esc(t.first)}` : ''}${t.end ? `; ended ${esc(fmtDate(t.end))}` : ''}.</p>${t.note ? `<p>${esc(t.note)}</p>` : ''}${t.names ? `<p class="hint">Names over time: ${esc(t.names.replace(/\s*→\s*/g, ', then '))}</p>` : ''}${links(t.source ? [t.source] : [])}` : ''}
${record && reignsOf.get(record)?.length ? `<p class="panel-actions"><button type="button" class="app-button" data-title="${esc(record.id)}" data-mode="reigns">Every ${esc(record.name)} reign</button></p>` : ''}`;
  }

  // ---------- Champion reigns ----------
  const reignEnd = (r: Reign) => dayNum(r.end || model.asOf);
  const days = (r: Reign) => Math.max(0, Math.round(reignEnd(r) - dayNum(r.start)));
  const duration = (r: Reign) => (days(r) < 1 ? 'Under a day' : `${plural(days(r), 'day')}${r.end ? '' : ' so far'}`);
  let geometry = { left: 260, right: 1000 };
  const xPos = (d: number) => geometry.left + ((d - state.from) / Math.max(1, state.to - state.from)) * (geometry.right - geometry.left);
  const titleDomain = (): [number, number] => {
    const list = state.title ? reignsOf.get(state.title) ?? [] : [];
    const first = list.length ? dayNum(list[0].start) : asOf - 3650;
    const pad = Math.max(30, Math.round((asOf - first) * 0.02));
    return [first - pad, asOf];
  };

  const nav = createNavigator({
    label: 'Championship dates: zoom and move',
    domain: titleDomain,
    range: () => [state.from, state.to],
    change: (from, to, final) => {
      state.from = from;
      state.to = to;
      paintReigns();
      if (final) ctx.changed();
    },
    density: () => {
      const [first, last] = titleDomain();
      const bins = new Array(240).fill(0);
      for (const r of state.title ? reignsOf.get(state.title) ?? [] : []) {
        const a = Math.max(0, Math.floor(((dayNum(r.start) - first) / Math.max(1, last - first)) * 240));
        const b = Math.min(239, Math.floor(((reignEnd(r) - first) / Math.max(1, last - first)) * 240));
        for (let i = a; i <= b; i++) bins[i]++;
      }
      return bins;
    },
  });

  function reignDetail(r: Reign): string {
    const moments = model.moments.filter((m) => m.kind === 1 && (m.date === r.start || m.date === r.end) && m.people.some((p) => r.people.includes(p)));
    const late = Object.entries(r.starts);
    const sources = bundle.titles[r.title.id]?.[2] ?? [];
    return `<div class="panel-top"><span class="panel-kind">Title reign</span><button type="button" class="panel-close" aria-label="Close this reign">&times;</button></div>
<h2>${esc(r.holder)}</h2>
<p class="panel-date">${esc(r.name)}</p>
<dl class="stats reign-facts"><div><dt>Won</dt><dd>${esc(fmtDate(r.start))}</dd></div><div><dt>${r.end ? 'Lost' : 'Status'}</dt><dd>${r.end ? esc(fmtDate(r.end)) : `Champion through ${esc(fmtDate(model.asOf))}`}</dd></div><div><dt>${r.people.length > 1 ? 'Team reign' : 'Length'}</dt><dd>${esc(duration(r))}</dd></div></dl>
${late.length ? `<p class="hint">${late.map(([p, d]) => `${esc(model.people[Number(p)]?.name ?? '')} joined the reign on ${esc(fmtDate(d))}.`).join(' ')}</p>` : ''}
${r.start < isoDay(state.from) ? '<p class="hint">This reign began before the dates in view; its bar starts at the edge, and its dates and length are the whole reign’s.</p>' : ''}
${r.people.length ? `<h3>Follow the careers</h3><div class="chips">${chips(model, r.people)}</div>` : ''}
${moments.length ? `<h3>Title changes on television</h3><div class="event-list">${moments.map((m) => eventCard(m)).join('')}</div>` : ''}
${sources.length ? `<p class="source-links">${sources.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${sources.length > 1 ? `Source ${i + 1}` : 'Source'}</a>`).join('')}</p>` : ''}`;
  }

  function reignsHtml(t: TitleRef): string {
    return `<div class="axis"><div class="axis-name">Champion</div><div class="ticks"></div></div><div class="reign-lanes"><div class="grid" aria-hidden="true"></div><div class="reign-rows"></div></div>
<p class="story-footnote">Lengths are elapsed calendar days; a promotion’s official count can differ by a day or two. Reigns still going run through ${esc(fmtDate(model.asOf))}. ${plural(reignsOf.get(t)?.length ?? 0, 'reign')} indexed.</p>`;
  }

  function paintReigns() {
    if (!state.title || state.mode !== 'reigns') return;
    const lanes = root.querySelector<HTMLElement>('.reign-lanes');
    const rowsEl = root.querySelector<HTMLElement>('.reign-rows');
    if (!lanes || !rowsEl) return;
    const label = parseFloat(getComputedStyle(root).getPropertyValue('--label-w')) || 240;
    geometry = { left: label + 20, right: lanes.clientWidth - 24 };
    const list = (reignsOf.get(state.title) ?? []).filter((r) => dayNum(r.start) <= state.to && reignEnd(r) >= state.from);
    rowsEl.innerHTML =
      list
        .map((r) => {
          const a = xPos(Math.max(dayNum(r.start), state.from));
          const b = xPos(Math.min(reignEnd(r), state.to));
          const active = state.reign === r;
          return `<div class="reign-row${active ? ' active' : ''}${state.reign && !active ? ' muted' : ''}" data-row="${esc(r.id)}"><button type="button" class="reign-name" data-reign="${esc(r.id)}" aria-expanded="${active}"><strong>${esc(r.holder)}</strong><small>${esc(duration(r))}</small></button><span class="rail"></span><button type="button" class="reign-span${r.end ? '' : ' ongoing'}" data-reign="${esc(r.id)}" style="left:${a.toFixed(1)}px;width:${Math.max(3, b - a).toFixed(1)}px" aria-label="${esc(`${r.holder}: ${fmtDate(r.start)} to ${r.end ? fmtDate(r.end) : 'present'}`)}"></button><span class="reign-dates" style="left:${Math.min(b + 8, geometry.right - 150).toFixed(1)}px">${esc(fmtDate(r.start))} to ${r.end ? esc(fmtDate(r.end)) : 'present'}</span></div>${
            active ? `<div class="detail inline reign-detail" style="--pointer:${Math.max(18, Math.min(600, (a + b) / 2)).toFixed(0)}px">${reignDetail(r)}</div>` : ''
          }`;
        })
        .join('') || '<p class="story-empty">No reigns in these dates. Drag the bar or select Full range.</p>';
    // Ticks: years, or months when zoomed in.
    const span = state.to - state.from;
    const ticks: { d: string; text: string }[] = [];
    const fy = Number(isoDay(state.from).slice(0, 4));
    const ty = Number(isoDay(state.to).slice(0, 4));
    const room = Math.max(2, Math.floor((geometry.right - geometry.left) / 72));
    if (span < 900) {
      for (let y = fy; y <= ty; y++)
        for (let m = 1; m <= 12; m++) {
          const d = `${y}-${String(m).padStart(2, '0')}-01`;
          if (dayNum(d) >= state.from && dayNum(d) <= state.to) ticks.push({ d, text: m === 1 ? String(y) : new Date(`${d}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) });
        }
    } else {
      const step = [1, 2, 5, 10, 20].find((s) => (ty - fy) / s <= room) ?? 25;
      for (let y = Math.ceil(fy / step) * step; y <= ty; y += step) ticks.push({ d: `${y}-01-01`, text: String(y) });
    }
    const every = Math.max(1, Math.ceil(ticks.length / room));
    const shown = ticks.filter((t, i) => i % every === 0 && dayNum(t.d) >= state.from);
    root.querySelector('.ticks')!.innerHTML = shown.map((t) => `<span class="tick" style="left:${xPos(dayNum(t.d)).toFixed(1)}px">${t.text}</span>`).join('');
    root.querySelector('.reign-lanes .grid')!.innerHTML = shown.map((t) => `<i style="left:${xPos(dayNum(t.d)).toFixed(1)}px"></i>`).join('');
    nav.sync();
  }

  // ---------- Render ----------
  function render() {
    select.value = state.title?.id ?? '';
    const vid = state.title ? treeFor(state.title) : null;
    modeSelect.closest('label')!.hidden = !state.title;
    modeSelect.querySelector<HTMLOptionElement>('option[value="history"]')!.disabled = !vid;
    if (!vid) state.mode = 'reigns';
    modeSelect.value = state.mode;
    if (!state.title) {
      root.innerHTML = directoryHtml();
      return;
    }
    const t = state.title;
    const list = reignsOf.get(t) ?? [];
    const promo = model.promotions.get(promotionOf(t))?.name;
    const names = bundle.titles[t.id]?.[3] ?? [];
    const current = list.filter((r) => !r.end);
    root.innerHTML = `<div class="explorer-head"><div><h1 class="view-title">${esc(t.name)}</h1><p class="view-subtitle">${esc([promo, plural(list.length, 'reign'), list.length ? `${fmtDate(list[0].start)} to ${current.length ? 'the present' : fmtDate(list.map((r) => r.end).sort().at(-1))}` : ''].filter(Boolean).join(', '))}.${current.length ? ` Champion: ${esc(current.map((r) => r.holder).join(', '))}.` : ''}${names.length ? ` Also known as ${esc(names.slice(0, 4).join(', '))}.` : ''}</p></div><div class="head-controls"><button type="button" class="restore" data-all>All championships</button></div></div>
${state.mode === 'history' && vid ? treeHtml(vid) : reignsHtml(t)}`;
    if (state.mode === 'history' && vid) {
      const frame = root.querySelector<HTMLElement>('.lineage-frame')!;
      const canvas = root.querySelector<HTMLElement>('.lineage-canvas')!;
      fitDiagram(frame, canvas, parseFloat(canvas.style.width), parseFloat(canvas.style.height), root.querySelector<HTMLElement>('.tree-zoom')!);
    } else {
      root.querySelector('.axis')!.appendChild(nav.el);
      paintReigns();
      nav.drawDensity();
    }
  }

  function setTitle(t: TitleRef | null, mode?: Mode) {
    state.title = t;
    state.reign = null;
    state.node = null;
    state.mode = mode ?? (t && treeFor(t) ? 'history' : 'reigns');
    [state.from, state.to] = titleDomain();
  }

  function scrollTo(selector: string) {
    requestAnimationFrame(() => {
      const target = root.querySelector<HTMLElement>(selector);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - ctx.stickyHeight() - (root.querySelector<HTMLElement>('.axis')?.offsetHeight ?? 0) - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  // ---------- Events ----------
  select.addEventListener('change', () => {
    setTitle(titleById.get(select.value) ?? null);
    render();
    ctx.changed();
    window.scrollTo({ top: 0 });
  });
  modeSelect.addEventListener('change', () => {
    state.mode = modeSelect.value as Mode;
    state.node = null;
    render();
    ctx.changed();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const title = t.closest<HTMLElement>('[data-title]');
    if (title) {
      setTitle(titleById.get(title.dataset.title!) ?? null, (title.dataset.mode as Mode) || undefined);
      render();
      ctx.changed();
      window.scrollTo({ top: 0 });
      return;
    }
    if (t.closest('[data-all]')) {
      setTitle(null);
      render();
      ctx.changed();
      return;
    }
    const node = t.closest<HTMLElement>('[data-node]');
    if (node) {
      state.node = state.node === node.dataset.node ? null : node.dataset.node!;
      render();
      ctx.changed();
      if (state.node) scrollTo('.lineage-detail');
      return;
    }
    const reign = t.closest<HTMLElement>('[data-reign]');
    if (reign && state.title) {
      const r = reignsOf.get(state.title)?.find((x) => x.id === reign.dataset.reign) ?? null;
      state.reign = state.reign === r ? null : r;
      paintReigns();
      ctx.changed();
      if (state.reign) {
        scrollTo('.reign-row.active');
        announce(`${state.reign.holder}, ${duration(state.reign)}`);
      }
      return;
    }
    if (t.closest('.panel-close')) {
      state.reign = null;
      state.node = null;
      if (state.mode === 'reigns') paintReigns();
      else render();
      ctx.changed();
      return;
    }
    const person = t.closest<HTMLElement>('.chip[data-person]');
    if (person) return ctx.go(`/wrestlers/${model.people[Number(person.dataset.person)].id}/`);
    const moment = t.closest<HTMLElement>('[data-moment]');
    if (moment) return ctx.go(`/${query({ moment: model.moments[Number(moment.dataset.moment)].id })}`);
  });
  let lastWidth = 0;
  new ResizeObserver(
    frameThrottle(() => {
      if (root.clientWidth === lastWidth) return;
      lastWidth = root.clientWidth;
      paintReigns();
    }),
  ).observe(root);

  return {
    el,
    tab: '/titles/',
    show: () => {
      if (!root.childElementCount) render();
    },
    hide: () => {},
    apply: (p: Params) => {
      const t = p.title ? titleById.get(p.title) ?? null : null;
      setTitle(t, p.mode === 'reigns' || p.reign ? 'reigns' : p.mode === 'history' ? 'history' : undefined);
      if (t && p.reign) state.reign = reignsOf.get(t)?.find((r) => r.id === p.reign) ?? null;
      if (t && p.from && p.to) {
        const a = dayNum(p.from);
        const b = dayNum(p.to);
        if (Number.isFinite(a) && Number.isFinite(b) && a < b) [state.from, state.to] = [a, b];
      }
      render();
      if (state.reign) scrollTo('.reign-row.active');
    },
    address: () => {
      if (!state.title) return '/titles/';
      const defaultMode = treeFor(state.title) ? 'history' : 'reigns';
      const [a, b] = titleDomain();
      const moved = state.mode === 'reigns' && (state.from !== a || state.to !== b);
      return `/titles/${state.title.id}/${query({ view: state.mode !== defaultMode ? state.mode : undefined, reign: state.reign?.id, from: moved ? isoDay(state.from) : undefined, to: moved ? isoDay(state.to) : undefined })}`;
    },
    subject: () => (state.reign ? `${state.reign.holder}, ${state.reign.name}` : state.title ? state.title.name : 'Championships'),
  };
}
