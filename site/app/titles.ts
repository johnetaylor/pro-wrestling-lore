// Championships: every title's history (how it connects to other titles, the names it carried,
// its milestones and every champion), and its reigns on a timeline with the scrub bar. The six
// trees v69 drew by hand stay as drawn; other connected titles get theirs from the title links.
// Belt pictures stay out: v69's were WWE images.
import { announce, esc, fmtDate, frameThrottle, num, plural, reducedMotion } from './dom.ts';
import { dayNum, isoDay, type LineageNode, type Reign, type ReignFacts, type TitleBundle, type TitleFacts, type TitleLink, type TitleRef } from './model.ts';
import { createNavigator } from './navigator.ts';
import { chips, eventCard } from './panels.ts';
import { fitDiagram, ZOOM } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';

type Mode = 'history' | 'reigns';

/** Promotion order for the championship list. */
const ORDER = ['wwe', 'aew', 'tna', 'njpw', 'aaa', 'roh', 'cmll', 'stardom', 'nwa', 'wcw', 'ecw', 'awa'];
const KIND: Record<string, string> = {
  origin: 'Title begins',
  merge: 'Titles unified',
  shared: 'Held together, two records',
  retire: 'One record ends',
  succeed: 'Replaced by a new title',
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

interface Tree {
  intro: string;
  notes: string[];
  background: string[];
  root: LineageNode;
  outputs?: LineageNode[];
}

/** "Women's tag team", "Trios", "" for men's singles. */
export function titleKind(f: TitleFacts | undefined): string {
  if (!f?.division && !f?.format) return '';
  const format = f.format === 'tag' ? 'tag team' : f.format === 'trios' ? 'trios' : '';
  if (f.division === 'women') return `Women’s${format ? ` ${format}` : ''}`;
  if (f.division === 'mixed') return format ? `Mixed ${format}` : 'Open to anyone';
  return format ? format[0].toUpperCase() + format.slice(1) : '';
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
  const facts = (id: string): TitleFacts | undefined => bundle.titles[id];
  const reignFacts = (r: Reign): ReignFacts | undefined => facts(r.title.id)?.reigns[r.id];
  const promotionOf = (t: TitleRef) => facts(t.id)?.promotion ?? '';
  const promoName = (p: string) => (p ? model.promotions.get(p)?.name ?? p.toUpperCase() : '');
  const lineal = (r: Reign) => !reignFacts(r)?.[1];
  const current = (t: TitleRef) => (facts(t.id)?.retired ? [] : (reignsOf.get(t) ?? []).filter((r) => !r.end && lineal(r)));
  /** The lineage view whose tree ends in this title. */
  const treeFor = (t: TitleRef) => Object.entries(L.views).find(([vid, v]) => v.title === t.id && L.trees[vid])?.[0] ?? null;
  const linksOf = (id: string) => L.links.filter((l) => l.to === id || l.from.includes(id));

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
      name: p ? model.promotions.get(p)?.fullName ?? promoName(p) : 'Other promotions',
      titles: model.titles
        .filter((t) => promotionOf(t) === p && reignsOf.get(t)?.length)
        .sort(
          (a, b) =>
            Number(!!facts(a.id)?.retired) - Number(!!facts(b.id)?.retired) ||
            Number(!current(b).length) - Number(!current(a).length) ||
            Number(!!facts(b.id)?.featured) - Number(!!facts(a.id)?.featured) ||
            Number(!!treeFor(b)) - Number(!!treeFor(a)) ||
            reignsOf.get(b)!.length - reignsOf.get(a)!.length ||
            a.name.localeCompare(b.name),
        ),
    }))
    .filter((g) => g.titles.length)
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1));

  const el = section(
    'titles',
    `<div class="app-tools"><div class="filters">
<label class="f-title">Championship<select data-control="title"><option value="">All championships</option>${groups
      .map((g) => `<optgroup label="${esc(g.name)}">${g.titles.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup>`)
      .join('')}</select></label>
<label>View<select data-control="title-mode"><option value="history">Title history</option><option value="reigns">Reigns on a timeline</option></select></label>
</div></div>
<div class="app-view titles-view"></div>`,
  );
  const select = el.querySelector<HTMLSelectElement>('[data-control="title"]')!;
  const modeSelect = el.querySelector<HTMLSelectElement>('[data-control="title-mode"]')!;
  const root = el.querySelector<HTMLElement>('.titles-view')!;

  // ---------- All championships ----------
  function titleItem(t: TitleRef): string {
    const list = reignsOf.get(t)!;
    const f = facts(t.id);
    const champs = current(t);
    const first = (f?.established ?? list[0].start).slice(0, 4);
    const ended = f?.retired ?? (champs.length || list.some((r) => !r.end) ? '' : list.map((r) => r.end).sort().at(-1)!);
    const span = ended ? `${first} to ${ended.slice(0, 4)}` : `${first} to present`;
    const kind = titleKind(f);
    return `<li><button type="button" class="title-link" data-title="${esc(t.id)}"><strong>${esc(t.name)}</strong><span>${kind ? `<em class="title-kind">${esc(kind)}</em> ` : ''}${plural(list.length, 'reign')}, ${span}</span>${champs.length ? `<span class="title-champ">Champion: ${esc(champs.map((r) => r.holder).join(', '))}</span>` : ''}</button></li>`;
  }

  function directoryHtml(): string {
    const total = groups.reduce((n, g) => n + g.titles.length, 0);
    const traced = groups.reduce((n, g) => n + g.titles.filter((t) => facts(t.id)?.established).length, 0);
    return `<div class="explorer-head"><div><h1 class="view-title">Championships</h1><p class="view-subtitle">${plural(total, 'championship')}. ${num(traced)} are traced from their first champion to today; select one for its history, every champion and how it connects to other titles.</p></div></div>
${groups
  .map((g) => {
    const active = g.titles.filter((t) => !facts(t.id)?.retired && (current(t).length || !facts(t.id)?.established));
    const past = g.titles.filter((t) => !active.includes(t));
    return `<section class="title-group"><h2 class="promo-head" style="--c:var(--p-${g.id || 'other'}, var(--p-other))">${esc(g.name)}</h2>${active.length ? `<ul class="title-list">${active.map(titleItem).join('')}</ul>` : ''}${
      past.length ? `<h3 class="title-sub">${active.length ? 'Retired and inactive' : 'Retired'}</h3><ul class="title-list">${past.map(titleItem).join('')}</ul>` : ''
    }</section>`;
  })
  .join('')}`;
  }

  // ---------- Trees ----------
  const ev = (id: string) => L.events.find((e) => e.id === id);
  const link = (id: string) => L.links.find((l) => l.id === id);
  const precise = (date: string, precision?: string) => (precision === 'year' ? date.slice(0, 4) : precision === 'month' ? date.slice(0, 7) : date);
  const evDate = (id: string) => {
    const e = ev(id);
    if (e) return fmtDate(precise(e.date, e.precision));
    const l = link(id);
    return l ? fmtDate(l.date) : '';
  };
  /** A generated node's track is "@" and a title id. */
  const titleOfNode = (n: LineageNode) => (n.track.startsWith('@') ? n.track.slice(1) : null);
  const nodeName = (n: LineageNode) => n.name || L.titles[n.track]?.name || titleById.get(titleOfNode(n) ?? '')?.name || n.track;
  const nodeType = (n: LineageNode) => n.type ?? (n.event ? ev(n.event)?.kind : undefined) ?? 'merge';
  const nodeCaption = (n: LineageNode) => {
    if (n.caption) return n.caption;
    const tid = titleOfNode(n);
    if (tid && !n.event && !n.events?.length) {
      const f = facts(tid);
      const start = f?.established ?? reignsOf.get(titleById.get(tid)!)?.[0]?.start;
      return start ? `Established ${fmtDate(start)}` : '';
    }
    if (nodeType(n) === 'origin' && !n.event && !n.events) {
      const t = L.titles[n.track];
      return t?.originLabel ?? `Established ${fmtDate(precise(t?.start ?? '', t?.precision))}`;
    }
    return evDate(n.event ?? n.events?.[0] ?? '');
  };

  /** The tree drawn from the title links: the titles that became this one above, what it became below. */
  function linkTree(t: TitleRef): Tree | null {
    const links = linksOf(t.id);
    if (!links.length) return null;
    const into = (id: string) => L.links.filter((l) => l.to === id && l.kind !== 'shared');
    const seen = new Set<string>();
    const node = (id: string, path: string, depth: number, via?: TitleLink): LineageNode => {
      seen.add(id);
      const ins = depth < 3 ? into(id).filter((l) => l.from.every((f) => !seen.has(f))).sort((a, b) => a.date.localeCompare(b.date)) : [];
      const merged = ins.some((l) => l.kind === 'merge');
      const parents: LineageNode[] = ins.flatMap((l) => l.from.map((f) => node(f, `${path}/${f}`, depth + 1, l)));
      // A title that absorbed others has its own beginning beside them.
      if (merged) parents.unshift({ id: `${path}#origin`, track: `@${id}`, name: nodeNameFor(id), type: 'origin' });
      return {
        id: path,
        track: `@${id}`,
        name: nodeNameFor(id),
        type: merged ? 'merge' : 'origin',
        ...(ins.length ? { events: ins.map((l) => l.id), caption: mergeCaption(ins) } : {}),
        ...(via ? { edge: via.label } : {}),
        parents,
      };
    };
    const nodeNameFor = (id: string) => titleById.get(id)?.name ?? id;
    /** "3 titles unified into it, 2004 to 2021"; one link speaks for itself through its date. */
    function mergeCaption(ins: TitleLink[]): string | undefined {
      const merges = ins.filter((l) => l.kind === 'merge');
      if (merges.length < 2) return undefined;
      const [a, b] = [merges[0].date.slice(0, 4), merges.at(-1)!.date.slice(0, 4)];
      return `${merges.length} titles unified into it, ${a === b ? a : `${a} to ${b}`}`;
    }
    const rootNode = node(t.id, t.id, 0);
    const outputs: LineageNode[] = links
      .filter((l) => l.from.includes(t.id) || (l.kind === 'shared' && l.to === t.id))
      .map((l) => {
        const other = l.from.includes(t.id) ? l.to : l.from[0];
        return { id: `out-${l.id}`, track: `@${other}`, name: nodeNameFor(other), type: l.kind === 'merge' ? 'merge' : l.kind === 'shared' ? 'shared' : 'succeed', event: l.id, edge: l.label };
      });
    if (!rootNode.parents?.length && !outputs.length) return null;
    return {
      intro: `How the ${t.name} connects to the titles before and after it.`,
      notes: [],
      background: [],
      root: rootNode,
      outputs,
    };
  }

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

  function treeHtml(key: string, tree: Tree): string {
    const g = layoutTree(tree.root, tree.outputs);
    const card = (n: Placed) => {
      const tid = titleOfNode(n);
      const promo = tid ? facts(tid)?.promotion : undefined;
      const label = tid ? promoName(promo ?? '') : L.promotions[n.track]?.label;
      const tone = tid ? '' : L.promotions[n.track]?.tone ?? '';
      return `<button type="button" class="lineage-card ${nodeType(n)}${state.node === n.id ? ' active' : ''}${tid === state.title?.id ? ' self' : ''}" style="left:${n.x}px;top:${n.y}px" data-node="${esc(n.id)}" aria-expanded="${state.node === n.id}">${label ? `<span class="lineage-promo ${esc(tone)}"${promo ? ` style="border-color:var(--p-${esc(promo)}, var(--p-other))"` : ''}>${esc(label)}</span>` : ''}<span class="lineage-kind">${esc(KIND[nodeType(n)] ?? 'Championship')}</span><strong>${esc(nodeName(n))}</strong><span class="lineage-date">${esc(nodeCaption(n))}</span><span class="lineage-more">Details and sources</span></button>`;
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
    return `<section class="lineage" data-lineage="${esc(key)}">
<div class="lineage-head"><div><h2>How the belts connect</h2><p>${esc(tree.intro)}</p></div>${ZOOM}</div>
<p class="range-hint">Older titles above, the titles they became below. Select a title for its dates, story and sources.</p>
<div class="lineage-frame" tabindex="0" role="region" aria-label="Title history diagram"><div class="lineage-stage"><div class="lineage-canvas" style="width:${g.width}px;height:${g.height}px"><svg width="${g.width}" height="${g.height}" aria-hidden="true">${g.links.map(connector).join('')}</svg>${g.nodes.map(card).join('')}</div></div></div>
${selected ? `<div class="detail inline lineage-detail">${nodeDetail(selected)}</div>` : ''}
${tree.notes.length ? `<div class="lineage-notes">${tree.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
${tree.background.length ? `<details class="lineage-background"><summary>Background and coverage</summary>${tree.background.map((p) => `<p>${esc(p)}</p>`).join('')}<p>${esc(L.coverage)}</p></details>` : ''}
</section>`;
  }

  const sourceLinks = (urls: string[]) =>
    urls.length ? `<p class="source-links">${urls.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(new URL(u).hostname.replace(/^www\./, ''))}${urls.length > 1 ? ` ${i + 1}` : ''}</a>`).join('')}</p>` : '';

  function nodeDetail(n: LineageNode): string {
    const tid = titleOfNode(n);
    const top = `<div class="panel-top"><span class="panel-kind">${esc(KIND[nodeType(n)] ?? 'Championship')}</span><button type="button" class="panel-close" aria-label="Close these details">&times;</button></div>
<p class="panel-date">${esc(nodeCaption(n))}</p>
<h2>${esc(nodeName(n))}</h2>`;
    if (tid) {
      const t = titleById.get(tid);
      const f = facts(tid);
      const list = t ? reignsOf.get(t) ?? [] : [];
      const ls = [n.event, ...(n.events ?? [])].map((id) => (id ? link(id) : undefined)).filter((l): l is TitleLink => !!l);
      return `${top}
<p>${esc([promoName(f?.promotion ?? ''), f?.established ? `established ${fmtDate(f.established)}` : '', f?.retired ? `retired ${fmtDate(f.retired)}` : list.length && !f?.retired ? 'active' : ''].filter(Boolean).join(', '))}.</p>
${ls.map((l) => `<h3>${esc(fmtDate(l.date))}: ${esc(l.label.replace(/,.*$/, ''))}</h3><p>${esc(l.text)}</p>${sourceLinks(l.sources)}`).join('')}
${t && list.length && t !== state.title ? `<p class="panel-actions"><button type="button" class="app-button" data-title="${esc(t.id)}">The ${esc(t.name)}’s history</button></p>` : ''}`;
    }
    const t = L.titles[n.track];
    const promo = L.promotions[n.track];
    const record = t ? titleById.get(t.title) : undefined;
    const events = [n.event, ...(n.events ?? [])].filter((x): x is string => !!x).map(ev).filter((e): e is NonNullable<ReturnType<typeof ev>> => !!e);
    return `${top}
${promo ? `<p><strong>${esc(promo.label)}.</strong> ${esc(promo.text)}</p>` : ''}
${n.note ? `<p class="context">${esc(n.note)}</p>` : ''}
${events.map((e) => `<h3>${esc(evDate(e.id))}: ${esc(e.label)}</h3><p>${esc(e.text)}</p>${sourceLinks(e.sources)}`).join('')}
${t ? `<h3>The record</h3><p>Established ${esc(fmtDate(t.start))}${t.first ? `; first champion ${esc(t.first)}` : ''}${t.end ? `; ended ${esc(fmtDate(t.end))}` : ''}.</p>${t.note ? `<p>${esc(t.note)}</p>` : ''}${t.names ? `<p class="hint">Names over time: ${esc(t.names.replace(/\s*→\s*/g, ', then '))}</p>` : ''}${sourceLinks(t.source ? [t.source] : [])}` : ''}
${record && reignsOf.get(record)?.length && record !== state.title ? `<p class="panel-actions"><button type="button" class="app-button" data-title="${esc(record.id)}">The ${esc(record.name)}’s history</button></p>` : ''}`;
  }

  // ---------- Names and milestones ----------
  function milestonesHtml(t: TitleRef): string {
    const f = facts(t.id);
    const list = reignsOf.get(t) ?? [];
    const firstLineal = list.find(lineal);
    type Item = { date: string; head: string; text?: string; sources?: string[]; title?: string };
    const items: Item[] = [];
    const born = f?.established ?? firstLineal?.start;
    if (born) items.push({ date: born, head: `Established${f?.eras[0] && f.eras[0].name !== t.name ? ` as the ${f.eras[0].name}` : ''}`, text: firstLineal ? `${firstLineal.holder} ${firstLineal.start === born ? 'became' : 'was'} the first champion${firstLineal.start !== born ? `, on ${fmtDate(firstLineal.start)}` : ''}.` : undefined });
    for (const e of f?.eras.slice(1) ?? []) items.push({ date: e.from, head: `Renamed the ${e.name}` });
    const linkDates: string[] = [];
    for (const l of linksOf(t.id)) {
      linkDates.push(l.date);
      const out = l.from.includes(t.id);
      const other = out ? l.to : l.from.filter((x) => x !== t.id).join(',') || l.to;
      const otherName = other
        .split(',')
        .map((id) => titleById.get(id)?.name ?? id)
        .join(' and ');
      const head =
        l.kind === 'shared'
          ? `Held together with the ${otherName}`
          : l.kind === 'merge'
            ? out
              ? `Unified into the ${otherName}`
              : `Absorbed the ${otherName}`
            : out
              ? `Replaced by the ${otherName}`
              : `Took the place of the ${otherName}`;
      items.push({ date: l.date, head, text: l.text, sources: l.sources, title: other.includes(',') ? undefined : other });
    }
    // The title's own story from its article, less what a link already tells.
    for (const e of f?.history ?? []) {
      if (linkDates.some((d) => Math.abs(dayNum(d.padEnd(10, '-01').slice(0, 10)) - dayNum(e.date.padEnd(10, '-01').slice(0, 10))) <= 31 && /unif|absorb|replace|merge/i.test(`${e.kind} ${e.text}`))) continue;
      items.push({ date: e.date, head: '', text: e.text, sources: e.sources });
    }
    if (f?.retired) items.push({ date: f.retired, head: 'Retired', text: list.length ? `${list.filter(lineal).length} lineal reigns in all.` : undefined });
    if (!items.length) return '';
    items.sort((a, b) => a.date.localeCompare(b.date) || Number(!a.head) - Number(!b.head));
    return `<section class="title-story" aria-labelledby="milestones-h"><h2 id="milestones-h">Names and milestones</h2>
<ol class="milestones">${items
      .map(
        (i) =>
          `<li><span class="milestone-date">${esc(fmtDate(i.date))}</span><div>${i.head ? `<strong>${i.title && titleById.get(i.title) && reignsOf.get(titleById.get(i.title)!)?.length ? `<button type="button" class="text-link" data-title="${esc(i.title)}">${esc(i.head)}</button>` : esc(i.head)}</strong>` : ''}${i.text ? `<p>${esc(i.text)}</p>` : ''}${i.sources?.length ? sourceLinks(i.sources) : ''}</div></li>`,
      )
      .join('')}</ol></section>`;
  }

  // ---------- Every champion ----------
  const reignEnd = (r: Reign) => dayNum(r.end || model.asOf);
  const days = (r: Reign) => Math.max(0, Math.round(reignEnd(r) - dayNum(r.start)));
  const duration = (r: Reign) => (days(r) < 1 ? 'Under a day' : `${plural(days(r), 'day')}${r.end ? '' : ' so far'}`);
  const kindLabel = (k: string) => (k === 'interim' ? 'Interim' : k === 'unrecognized' ? 'Unrecognized' : '');

  function holderHtml(r: Reign): string {
    const linked = r.people.map((p) => model.people[p]);
    const unlinked = reignFacts(r)?.[7] ?? [];
    const link = (p: (typeof linked)[number], text = p.name) => `<button type="button" class="text-link" data-person-id="${esc(p.id)}">${esc(text)}</button>`;
    if (linked.length + unlinked.length <= 1) return linked.length ? link(linked[0], r.holder || linked[0].name) : esc(r.holder || unlinked[0] || '');
    const names = [...linked.map((p) => link(p)), ...unlinked.map((n) => esc(n))];
    const joined = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    // A team's name comes first; a holder printed as the names themselves needs no repeat.
    const team = r.holder && !/ & | and /.test(r.holder) ? r.holder : '';
    return team ? `${esc(team)} <span class="quiet">(${joined})</span>` : joined;
  }

  function tableHtml(t: TitleRef): string {
    const list = reignsOf.get(t) ?? [];
    if (!list.length) return '';
    const rows = list
      .map((r) => {
        const rf = reignFacts(r);
        const [number, kind, event, location, printed, note, dateNote] = rf ?? [0, '', '', '', -1, '', '', []];
        const where = [event, location].filter(Boolean).join(', ');
        const length = printed >= 0 ? `${printed < 1 ? '<1' : num(printed)}${r.end ? '' : '+'}` : days(r) < 1 ? '<1' : `${num(days(r))}${r.end ? '' : '+'}`;
        return `<tr class="${kind ? `kind-${kind}` : ''}${state.reign === r ? ' active' : ''}" id="reign-${esc(r.id)}"><td class="num">${number ? num(number) : kind ? `<span class="reign-kind">${esc(kindLabel(kind))}</span>` : '—'}</td><td>${holderHtml(r)}${note ? `<p class="cell-note">${esc(note)}</p>` : ''}${dateNote ? `<p class="cell-note">${esc(dateNote)}</p>` : ''}</td><td class="date"><button type="button" class="text-link" data-reign="${esc(r.id)}" data-mode="reigns" title="Show this reign on the timeline">${esc(fmtDate(r.start))}</button></td><td>${esc(where)}</td><td class="num">${length}</td></tr>`;
      })
      .join('');
    const official = list.some((r) => (reignFacts(r)?.[4] ?? -1) >= 0);
    return `<section class="title-reigns" aria-labelledby="reigns-h"><h2 id="reigns-h">Every champion</h2>
<p class="section-intro">${plural(list.filter(lineal).length, 'reign')}${list.length > list.filter(lineal).length ? `, plus ${plural(list.length - list.filter(lineal).length, 'interim or unrecognized reign')}` : ''}. ${official ? 'Days are as the source counts them; a + marks a reign still going.' : 'Days are calendar days from the dates.'} Select a date to see the reign on the timeline.</p>
<div class="table-wrap"><table class="data reign-table"><thead><tr><th scope="col" class="num">No.</th><th scope="col">Champion</th><th scope="col">Won</th><th scope="col">Where</th><th scope="col" class="num">Days</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  // ---------- Champion reigns on a timeline ----------
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
    const sources = facts(r.title.id)?.sources ?? [];
    const [number, kind, event, location, printed, note, dateNote, unlinked] = reignFacts(r) ?? [0, '', '', '', -1, '', '', []];
    const official = printed >= 0 && Math.abs(printed - days(r)) > 1 ? `<p class="hint">The source counts ${plural(printed, 'day')}.</p>` : '';
    return `<div class="panel-top"><span class="panel-kind">${kind ? `${esc(kindLabel(kind))} reign` : number ? `Reign ${num(number)}` : 'Title reign'}</span><button type="button" class="panel-close" aria-label="Close this reign">&times;</button></div>
<h2>${esc(r.holder)}</h2>
<p class="panel-date">${esc(r.name)}${event ? `. Won at ${esc([event, location].filter(Boolean).join(', '))}` : ''}</p>
<dl class="stats reign-facts"><div><dt>Won</dt><dd>${esc(fmtDate(r.start))}</dd></div><div><dt>${r.end ? 'Lost' : 'Status'}</dt><dd>${r.end ? esc(fmtDate(r.end)) : `Champion through ${esc(fmtDate(model.asOf))}`}</dd></div><div><dt>${r.people.length + unlinked.length > 1 ? 'Team reign' : 'Length'}</dt><dd>${esc(duration(r))}</dd></div></dl>
${official}
${note ? `<p class="context">${esc(note)}</p>` : ''}
${dateNote ? `<p class="hint">${esc(dateNote)}</p>` : ''}
${kind === 'interim' ? '<p class="hint">An interim champion held the title while the lineal champion couldn’t defend it.</p>' : kind === 'unrecognized' ? '<p class="hint">The promotion doesn’t recognize this reign; it runs beside the lineal one.</p>' : ''}
${late.length ? `<p class="hint">${late.map(([p, d]) => `${esc(model.people[Number(p)]?.name ?? '')} joined the reign on ${esc(fmtDate(d))}.`).join(' ')}</p>` : ''}
${r.start < isoDay(state.from) ? '<p class="hint">This reign began before the dates in view; its bar starts at the edge, and its dates and length are the whole reign’s.</p>' : ''}
${r.people.length ? `<h3>Follow the careers</h3><div class="chips">${chips(model, r.people)}</div>` : ''}
${unlinked.length ? `<p class="hint">${esc(unlinked.join(', '))} ${unlinked.length > 1 ? 'aren’t' : 'isn’t'} linked to a wrestler’s career yet.</p>` : ''}
${moments.length ? `<h3>Title changes on television</h3><div class="event-list">${moments.map((m) => eventCard(m)).join('')}</div>` : ''}
${sources.length ? `<p class="source-links">${sources.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${sources.length > 1 ? `Source ${i + 1}` : 'Source'}</a>`).join('')}</p>` : ''}`;
  }

  function reignsHtml(t: TitleRef): string {
    return `<div class="axis"><div class="axis-name">Champion</div><div class="ticks"></div></div><div class="reign-lanes"><div class="grid" aria-hidden="true"></div><div class="reign-rows"></div></div>
<p class="story-footnote">Lengths are elapsed calendar days; a promotion’s official count can differ by a day or two. Reigns still going run through ${esc(fmtDate(model.asOf))}. Dashed bars are interim or unrecognized reigns. ${plural(reignsOf.get(t)?.length ?? 0, 'reign')} indexed.</p>`;
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
          const kind = reignFacts(r)?.[1] ?? '';
          return `<div class="reign-row${active ? ' active' : ''}${state.reign && !active ? ' muted' : ''}" data-row="${esc(r.id)}"><button type="button" class="reign-name" data-reign="${esc(r.id)}" aria-expanded="${active}"><strong>${esc(r.holder)}</strong><small>${esc(duration(r))}</small></button><span class="rail"></span><button type="button" class="reign-span${r.end ? '' : ' ongoing'}${kind ? ` ${kind}` : ''}" data-reign="${esc(r.id)}" style="left:${a.toFixed(1)}px;width:${Math.max(3, b - a).toFixed(1)}px" aria-label="${esc(`${kind ? `${kindLabel(kind)} reign: ` : ''}${r.holder}: ${fmtDate(r.start)} to ${r.end ? fmtDate(r.end) : 'present'}`)}"></button><span class="reign-dates" style="left:${Math.min(b + 8, geometry.right - 150).toFixed(1)}px">${esc(fmtDate(r.start))} to ${r.end ? esc(fmtDate(r.end)) : 'present'}</span></div>${
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
  /** The tree for the title: v69's by hand, else one drawn from the title links. */
  function treeOf(t: TitleRef): { key: string; tree: Tree } | null {
    const vid = treeFor(t);
    if (vid) return { key: vid, tree: L.trees[vid] };
    const generated = linkTree(t);
    return generated ? { key: `links-${t.id}`, tree: generated } : null;
  }

  function headHtml(t: TitleRef): string {
    const list = reignsOf.get(t) ?? [];
    const f = facts(t.id);
    const champs = current(t);
    const kind = titleKind(f);
    const born = f?.established ?? list[0]?.start;
    const ended = f?.retired ?? (champs.length || list.some((r) => !r.end) ? '' : list.map((r) => r.end).sort().at(-1));
    const facts1 = [promoName(f?.promotion ?? ''), kind.toLowerCase(), born ? `${f?.established ? 'established' : 'first reign'} ${fmtDate(born)}` : '', f?.retired ? `retired ${fmtDate(f.retired)}` : ended ? `last reign ended ${fmtDate(ended)}` : '', plural(list.filter(lineal).length, 'reign')].filter(Boolean);
    const sentence = facts1.join(', ');
    const names = f?.names ?? [];
    return `<div class="explorer-head"><div><h1 class="view-title">${esc(t.name)}</h1><p class="view-subtitle">${esc(sentence[0].toUpperCase() + sentence.slice(1))}.${champs.length ? ` Champion: ${esc(champs.map((r) => r.holder).join(', '))}.` : ''}${names.length ? ` Also known as ${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ' and others' : ''}.` : ''}</p></div><div class="head-controls"><button type="button" class="restore" data-all>All championships</button></div></div>`;
  }

  function render() {
    select.value = state.title?.id ?? '';
    modeSelect.closest('label')!.hidden = !state.title;
    modeSelect.value = state.mode;
    if (!state.title) {
      root.innerHTML = directoryHtml();
      return;
    }
    const t = state.title;
    const tree = state.mode === 'history' ? treeOf(t) : null;
    root.innerHTML = `${headHtml(t)}
${state.mode === 'history' ? `${tree ? treeHtml(tree.key, tree.tree) : ''}${milestonesHtml(t)}${tableHtml(t)}${sourcesHtml(t)}` : reignsHtml(t)}`;
    if (state.mode === 'history') {
      if (tree) {
        const frame = root.querySelector<HTMLElement>('.lineage-frame')!;
        const canvas = root.querySelector<HTMLElement>('.lineage-canvas')!;
        fitDiagram(frame, canvas, parseFloat(canvas.style.width), parseFloat(canvas.style.height), root.querySelector<HTMLElement>('.tree-zoom')!);
      }
    } else {
      root.querySelector('.axis')!.appendChild(nav.el);
      paintReigns();
      nav.drawDensity();
    }
  }

  function sourcesHtml(t: TitleRef): string {
    const urls = facts(t.id)?.sources ?? [];
    return urls.length ? `<section class="title-sources"><h2>Sources</h2>${sourceLinks(urls)}</section>` : '';
  }

  /** The dates a reign is shown in when it is opened from elsewhere: the reign with room either
   * side, so the champions before and after it are in view. */
  function reignWindow(r: Reign): [number, number] {
    const [lo, hi] = titleDomain();
    const start = dayNum(r.start);
    const end = reignEnd(r);
    const pad = Math.min(730, Math.max(182, Math.round((end - start) * 0.5)));
    let a = start - pad;
    let b = end + pad;
    if (b > hi) [a, b] = [Math.max(lo, a - (b - hi)), hi];
    if (a < lo) [a, b] = [lo, Math.min(hi, b + (lo - a))];
    return [a, b];
  }

  function setTitle(t: TitleRef | null, mode?: Mode) {
    state.title = t;
    state.reign = null;
    state.node = null;
    state.mode = mode ?? 'history';
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
    const personLink = t.closest<HTMLElement>('[data-person-id]');
    if (personLink) return ctx.go(`/wrestlers/${personLink.dataset.personId}/`);
    const reign = t.closest<HTMLElement>('[data-reign]');
    if (reign && state.title) {
      const r = reignsOf.get(state.title)?.find((x) => x.id === reign.dataset.reign) ?? null;
      if (reign.dataset.mode === 'reigns' && state.mode !== 'reigns') {
        // From the table: the reign on the timeline, with the champions either side in view.
        state.mode = 'reigns';
        state.reign = r;
        if (r) [state.from, state.to] = reignWindow(r);
        render();
        ctx.changed();
        if (r) scrollTo('.reign-row.active');
        return;
      }
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
      setTitle(t, p.mode === 'reigns' || p.reign ? 'reigns' : 'history');
      if (t && p.reign) state.reign = reignsOf.get(t)?.find((r) => r.id === p.reign) ?? null;
      const a = p.from ? dayNum(p.from) : NaN;
      const b = p.to ? dayNum(p.to) : NaN;
      if (t && Number.isFinite(a) && Number.isFinite(b) && a < b) [state.from, state.to] = [a, b];
      else if (state.reign) [state.from, state.to] = reignWindow(state.reign);
      render();
      if (state.reign) scrollTo('.reign-row.active');
    },
    address: () => {
      if (!state.title) return '/titles/';
      const [a, b] = titleDomain();
      const moved = state.mode === 'reigns' && (state.from !== a || state.to !== b);
      return `/titles/${state.title.id}/${query({ view: state.mode === 'reigns' && !state.reign ? 'reigns' : undefined, reign: state.reign?.id, from: moved ? isoDay(state.from) : undefined, to: moved ? isoDay(state.to) : undefined })}`;
    },
    subject: () => (state.reign ? `${state.reign.holder}, ${state.reign.name}` : state.title ? state.title.name : 'Championships'),
  };
}
