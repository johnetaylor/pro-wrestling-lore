// Dynasties: wrestling family trees, branch by branch, with each person's relationships and
// sources, and a way into the careers of those who wrestled.
import { announce, esc, plural, reducedMotion } from './dom.ts';
import { initials, type FamilyBundle } from './model.ts';
import { avatarHtml } from './panels.ts';
import { fitDiagram, ZOOM } from './ui.ts';
import { section, query, type AppContext, type AppView, type Params } from './views.ts';

type Family = FamilyBundle['families'][number];
type Member = Family['members'][number];
type Link = Family['links'][number];

const NODE_W = 156;
const NODE_H = 80;
const RELATION: Record<string, string> = {
  parent: 'Parent and child',
  adoption: 'Adoption',
  marriage: 'Marriage, current or former',
  honorary: 'Honorary family bond',
  sibling: 'Siblings',
  uncle: 'Uncle and nephew',
  cousin: 'Cousins',
  grandparent: 'Grandparent and grandchild',
  inlaw: 'In-laws',
};
/** How a link reads from one end: "Parent of", "Child of". */
function relation(l: Link, outgoing: boolean): string {
  const pairs: Record<string, [string, string]> = {
    parent: ['Parent of', 'Child of'],
    adoption: ['Adoptive parent of', 'Adopted child of'],
    uncle: ['Uncle of', 'Nephew of'],
    grandparent: ['Grandparent of', 'Grandchild of'],
    inlaw: ['Parent-in-law of', 'Child-in-law of'],
  };
  if (pairs[l.type]) return pairs[l.type][outgoing ? 0 : 1];
  if (l.label) return l.label;
  return { marriage: 'Married to', sibling: 'Sibling of', cousin: 'Cousin of', honorary: 'Honorary family of' }[l.type] ?? RELATION[l.type] ?? 'Related to';
}

export function createFamiliesView(ctx: AppContext, bundle: FamilyBundle): AppView {
  const { model } = ctx;
  const families = bundle.families;
  const byId = new Map(families.map((f) => [f.id, f]));
  const state = { family: null as Family | null, member: null as Member | null };

  const el = section(
    'dynasties',
    `<div class="app-tools"><div class="filters">
<label class="f-title">Family<select data-control="family"><option value="">All families</option>${families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>
<label class="f-title">Find a family member<select data-control="member"><option value="">Choose a person</option>${families
      .map((f) => `<optgroup label="${esc(f.name)}">${[...f.members].sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<option value="${esc(f.id)}:${esc(m.id)}">${esc(m.name)}</option>`).join('')}</optgroup>`)
      .join('')}</select></label>
</div></div>
<div class="app-view families-view"></div>`,
  );
  const familySelect = el.querySelector<HTMLSelectElement>('[data-control="family"]')!;
  const memberSelect = el.querySelector<HTMLSelectElement>('[data-control="member"]')!;
  const root = el.querySelector<HTMLElement>('.families-view')!;

  const career = (m: Member) => (m.person ? model.byId.get(m.person) : undefined);
  const source = (f: Family, key: string | undefined) => {
    const s = key ? f.sources[key] : undefined;
    return s ? `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a>` : '';
  };

  function directoryHtml(): string {
    return `<div class="explorer-head"><div><h1 class="view-title">Wrestling families</h1><p class="view-subtitle">${plural(families.length, 'family tree')}, ${plural(
      families.reduce((n, f) => n + f.members.length, 0),
      'person',
      'people',
    )}. Select a family for its tree, or find someone with the search above.</p></div></div>
<ul class="title-list family-list">${families
      .map((f) => `<li><button type="button" class="title-link" data-family="${esc(f.id)}"><strong>${esc(f.name)}</strong><span>${plural(f.members.length, 'person', 'people')}${f.branches.length > 1 ? `, ${plural(f.branches.length, 'branch', 'branches')}` : ''}</span>${f.description ? `<span class="family-blurb">${esc(f.description)}</span>` : ''}</button></li>`)
      .join('')}</ul>`;
  }

  function memberDetail(f: Family, m: Member): string {
    const members = new Map(f.members.map((x) => [x.id, x]));
    const links = f.links.filter((l) => l.a === m.id || l.b === m.id);
    const person = career(m);
    return `<div class="panel-top"><span class="panel-kind">Family member</span><button type="button" class="panel-close" aria-label="Clear the selected family member">&times;</button></div>
<h2>${esc(m.name)}</h2>
${m.aliases?.length ? `<p class="aka">Also known as ${esc(m.aliases.join(', '))}</p>` : ''}
${m.note ? `<p class="context">${esc(m.note)}</p>` : ''}
<ul class="relations">${links
      .map((l) => {
        const out = l.a === m.id;
        const other = members.get(out ? l.b : l.a);
        return other ? `<li><span class="relation ${esc(l.type)}">${esc(relation(l, out))}</span> <button type="button" class="text-button" data-member="${esc(other.id)}">${esc(other.name)}</button>${l.source && f.sources[l.source] ? `<span class="relation-source">Source: ${source(f, l.source)}</span>` : ''}</li>` : '';
      })
      .join('')}</ul>
${person ? `<p class="panel-actions"><a class="app-button" href="/wrestlers/${esc(person.id)}/">${esc(person.name)}’s career</a></p>` : '<p class="hint">No televised career in this archive.</p>'}
${m.source ? `<p class="source-links">${source(f, m.source)}</p>` : ''}`;
  }

  function familyHtml(f: Family): string {
    const members = new Map(f.members.map((m) => [m.id, m]));
    const types = [...new Set(f.links.map((l) => l.type))];
    const sel = state.member;
    const linked = sel ? f.links.filter((l) => l.a === sel.id || l.b === sel.id) : [];
    const related = new Set(linked.flatMap((l) => [l.a, l.b]));
    const bridges = f.links.filter((l) => members.get(l.a)?.branch !== members.get(l.b)?.branch);
    const branches = f.branches.length ? f.branches : [{ id: '', name: f.name }];
    return `<div class="explorer-head"><div><h1 class="view-title">${esc(f.name)}</h1>${f.description ? `<p class="view-subtitle">${esc(f.description)}</p>` : ''}</div><div class="head-controls"><button type="button" class="restore" data-all>All families</button></div></div>
<ul class="legend family-legend">${types.map((t) => `<li><i class="family-key ${esc(t)}" aria-hidden="true"></i>${esc(RELATION[t] ?? t)}</li>`).join('')}</ul>
${bridges.length ? `<div class="family-bridges"><p class="picker-label">Between branches</p>${bridges.map((l) => `<p><button type="button" class="text-button" data-member="${esc(l.a)}">${esc(members.get(l.a)?.name ?? l.a)}</button> <span class="hint">${esc(relation(l, true).toLowerCase())}</span> <button type="button" class="text-button" data-member="${esc(l.b)}">${esc(members.get(l.b)?.name ?? l.b)}</button></p>`).join('')}</div>` : ''}
${branches
  .map((b) => {
    const ns = f.members.filter((m) => (b.id ? m.branch === b.id : true) && m.layout);
    if (!ns.length) return '';
    const edges = f.links.filter((l) => {
      const a = members.get(l.a);
      const c = members.get(l.b);
      return a?.layout && c?.layout && ns.includes(a) && ns.includes(c);
    });
    const width = Math.max(360, ...ns.map((n) => n.layout!.x + NODE_W + 18));
    const height = Math.max(...ns.map((n) => n.layout!.y + NODE_H + 20));
    const paths = edges
      .map((l) => {
        const a = members.get(l.a)!.layout!;
        const c = members.get(l.b)!.layout!;
        const d =
          a.y === c.y
            ? `M ${a.x + (a.x < c.x ? NODE_W : 0)} ${a.y + NODE_H / 2} L ${c.x + (a.x < c.x ? 0 : NODE_W)} ${c.y + NODE_H / 2}`
            : `M ${a.x + NODE_W / 2} ${a.y + NODE_H} V ${(a.y + NODE_H + c.y) / 2} H ${c.x + NODE_W / 2} V ${c.y}`;
        const sameBranch = !!sel && (b.id ? sel.branch === b.id : true);
        return `<path class="family-edge ${esc(l.type)}${sameBranch && !linked.includes(l) ? ' subdued' : ''}" d="${d}"/>`;
      })
      .join('');
    const nodes = ns
      .map((n) => {
        const p = career(n);
        const sameBranch = !!sel && (b.id ? sel.branch === b.id : true);
        const tile = p ? avatarHtml(p) : `<span class="avatar" aria-hidden="true">${esc(initials(n.name))}</span>`;
        return `<button type="button" class="family-node${n === sel ? ' active' : ''}${sameBranch && n !== sel && !related.has(n.id) ? ' subdued' : ''}${p ? ' wrestled' : ''}" style="left:${n.layout!.x}px;top:${n.layout!.y}px" data-member="${esc(n.id)}" aria-pressed="${n === sel}">${tile}<span class="family-node-text"><strong>${esc(n.name)}</strong><small>${p ? 'On the timeline' : 'Family connections'}</small></span></button>`;
      })
      .join('');
    const open = sel && (b.id ? sel.branch === b.id : true);
    return `<section class="family-branch" data-branch="${esc(b.id)}"><div class="lineage-head"><div><h2>${esc(b.name)}</h2>${'note' in b && b.note ? `<p>${esc(b.note)}</p>` : ''}</div>${ZOOM}</div>
<div class="lineage-frame family-frame" tabindex="0" role="region" aria-label="${esc(b.name)} family tree"><div class="lineage-stage"><div class="lineage-canvas" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}" aria-hidden="true">${paths}</svg>${nodes}</div></div></div>
${open ? `<div class="detail inline family-detail">${memberDetail(f, sel!)}</div>` : ''}</section>`;
  })
  .join('')}
<p class="story-footnote">Selected public wrestling branches, not a complete genealogy. A line shows the labeled relationship; placement on the page doesn’t make an uncle or an adoptive parent a biological parent. Marriage links describe family connections and may be historical.</p>
<details class="lineage-background"><summary>Family sources</summary><ul class="family-sources">${Object.values(f.sources)
      .map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`)
      .join('')}</ul></details>`;
  }

  function render() {
    familySelect.value = state.family?.id ?? '';
    memberSelect.value = state.family && state.member ? `${state.family.id}:${state.member.id}` : '';
    if (!state.family) {
      root.innerHTML = directoryHtml();
      return;
    }
    root.innerHTML = familyHtml(state.family);
    for (const branch of root.querySelectorAll<HTMLElement>('.family-branch')) {
      const canvas = branch.querySelector<HTMLElement>('.lineage-canvas')!;
      fitDiagram(branch.querySelector<HTMLElement>('.lineage-frame')!, canvas, parseFloat(canvas.style.width), parseFloat(canvas.style.height), branch.querySelector<HTMLElement>('.tree-zoom')!);
    }
    // Point the details' arrow at the selected person.
    const panel = root.querySelector<HTMLElement>('.family-detail');
    const node = root.querySelector<HTMLElement>('.family-node.active');
    if (panel && node) {
      const x = node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2 - panel.getBoundingClientRect().left;
      panel.style.setProperty('--pointer', `${Math.max(18, Math.min(panel.offsetWidth - 18, x))}px`);
    }
  }

  function scrollToDetail() {
    requestAnimationFrame(() => {
      const panel = root.querySelector<HTMLElement>('.family-detail');
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      if (rect.top > ctx.stickyHeight() && rect.top < window.innerHeight - 120) return;
      window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - ctx.stickyHeight() - 200), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  familySelect.addEventListener('change', () => {
    state.family = byId.get(familySelect.value) ?? null;
    state.member = null;
    render();
    ctx.changed();
    window.scrollTo({ top: 0 });
  });
  memberSelect.addEventListener('change', () => {
    const [fid, mid] = memberSelect.value.split(':');
    const f = byId.get(fid);
    if (!f) return;
    state.family = f;
    state.member = f.members.find((m) => m.id === mid) ?? null;
    render();
    ctx.changed();
    scrollToDetail();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const fam = t.closest<HTMLElement>('[data-family]');
    if (fam) {
      state.family = byId.get(fam.dataset.family!) ?? null;
      state.member = null;
      render();
      ctx.changed();
      window.scrollTo({ top: 0 });
      return;
    }
    if (t.closest('[data-all]')) {
      state.family = null;
      state.member = null;
      render();
      ctx.changed();
      return;
    }
    const member = t.closest<HTMLElement>('[data-member]');
    if (member && state.family) {
      const m = state.family.members.find((x) => x.id === member.dataset.member) ?? null;
      state.member = state.member === m ? null : m;
      render();
      ctx.changed();
      if (state.member) {
        scrollToDetail();
        announce(`${state.member.name} selected`);
      }
      return;
    }
    if (t.closest('.panel-close')) {
      state.member = null;
      render();
      ctx.changed();
    }
  });

  return {
    el,
    tab: '/families/',
    show: () => {
      if (!root.childElementCount) render();
    },
    hide: () => {},
    apply: (p: Params) => {
      state.family = p.family ? byId.get(p.family) ?? null : null;
      state.member = state.family && p.member ? state.family.members.find((m) => m.id === p.member) ?? null : null;
      render();
      if (state.member) scrollToDetail();
    },
    address: () => (state.family ? `/families/${state.family.id}/${query({ member: state.member?.id })}` : '/families/'),
    subject: () => (state.member ? `${state.member.name}, ${state.family!.name}` : state.family ? `The ${state.family.name} family` : 'Wrestling families'),
  };
}
