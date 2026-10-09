// Statistics: a sortable table of match records for everyone in the archive. Career totals come
// from CAGEMATCH snapshots; indexed records count televised matches in this archive. The two
// cover different sets of matches, and every row says which one it uses.
import { announce, esc, num } from './dom.ts';
import { normalize, type Model } from './model.ts';
import { avatarHtml, indexedRecord } from './panels.ts';

export type RecordSet = 'available' | 'career' | 'archive';
type SortKey = 'name' | 'matches' | 'wins' | 'losses' | 'draws' | 'winPct' | 'lossPct' | 'drawPct';

interface Rec {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  basis: 'career' | 'archive';
  source?: string;
  first?: string;
  last?: string;
}

export interface StatisticsOptions {
  model: Model;
  root: HTMLElement;
  controls: { search: HTMLInputElement; records: HTMLSelectElement; minimum: HTMLSelectElement; format: HTMLSelectElement; promotion: HTMLSelectElement; division: HTMLSelectElement };
  openPerson(id: string): void;
}

const HEADINGS: Record<RecordSet, { title: string; scope: string; note: string }> = {
  available: {
    title: 'All available records',
    scope: 'Career and indexed records',
    note: 'Uses a sourced career total where there is one, and otherwise results from indexed broadcasts. The record type column says which. The two cover different sets of matches, so pick one record type to compare wrestlers fairly. Indexed draws include no contests.',
  },
  career: {
    title: 'Career totals',
    scope: 'CAGEMATCH snapshots',
    note: 'Totals across promotions and years, singles and team matches alike. They can include untelevised matches, so they are independent of the televised timeline. Snapshot dates vary.',
  },
  archive: {
    title: 'Indexed broadcast records',
    scope: 'This archive',
    note: 'Televised matches in this archive with a recorded result. A partial record, not a career total. Draws include no contests.',
  },
};

export function createStatistics(o: StatisticsOptions) {
  const { model, root, controls } = o;
  const sort = { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' };

  // Career totals once; indexed records for all promotions, and for each one when first asked.
  const career = new Map<number, Rec>();
  for (const p of model.people) {
    const t = model.totals.get(p.i);
    if (t?.matches) career.set(p.i, { ...t, basis: 'career', source: t.source });
  }
  const indexedBy = new Map<string, Map<number, Rec>>();
  const indexedFor = (promotion: string): Map<number, Rec> => {
    const made = indexedBy.get(promotion);
    if (made) return made;
    const out = new Map<number, Rec>();
    const only = promotion === 'all' ? undefined : promotion;
    for (const p of model.people) {
      const r = indexedRecord(model, p.i, only);
      if (!r.matches) continue;
      const dated = model.byPerson[p.i].filter((m) => m.kind <= 1 && (!only || m.show.promotion === only) && m.people.includes(p.i) && m.outcomes[m.people.indexOf(p.i)] && m.outcomes[m.people.indexOf(p.i)] !== '-');
      out.set(p.i, { ...r, basis: 'archive', first: dated[0]?.date, last: dated.at(-1)?.date });
    }
    indexedBy.set(promotion, out);
    return out;
  };
  // Career totals cover every promotion, so one promotion's view uses its indexed broadcasts.
  const recordFor = (p: number, set: RecordSet, indexed: Map<number, Rec>): Rec | undefined =>
    set === 'archive' ? indexed.get(p) : set === 'career' ? career.get(p) : career.get(p) ?? indexed.get(p);

  const value = (p: number, rec: Rec, key: SortKey): number | string => {
    if (key === 'name') return model.people[p].sort;
    if (key.endsWith('Pct')) {
      const count = rec[key === 'winPct' ? 'wins' : key === 'lossPct' ? 'losses' : 'draws'];
      return rec.matches ? (count / rec.matches) * 100 : 0;
    }
    return rec[key as 'matches' | 'wins' | 'losses' | 'draws'];
  };

  function render() {
    const promotion = controls.promotion.value || 'all';
    const division = controls.division.value || 'all';
    const promotionName = promotion === 'all' ? '' : model.promotions.get(promotion)?.name ?? promotion;
    controls.records.disabled = promotion !== 'all';
    const set = promotion === 'all' ? (controls.records.value as RecordSet) : 'archive';
    const indexed = indexedFor(promotion);
    const minimum = Number(controls.minimum.value) || 0;
    const percent = controls.format.value === 'percentages';
    const search = normalize(controls.search.value);
    const gender = division === 'women' ? 'f' : division === 'men' ? 'm' : '';
    const base = model.people.filter((p) => recordFor(p.i, set, indexed) && (!gender || p.gender === gender) && (!search || p.search.includes(search)));
    const rows = base
      .map((p) => ({ p: p.i, rec: recordFor(p.i, set, indexed)! }))
      .filter((r) => r.rec.matches >= minimum)
      .sort((a, b) => {
        const x = value(a.p, a.rec, sort.key);
        const y = value(b.p, b.rec, sort.key);
        const diff = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
        return (sort.dir === 'asc' ? diff : -diff) || model.people[a.p].sort.localeCompare(model.people[b.p].sort);
      });
    const columns: [SortKey, string][] = percent
      ? [['name', 'Wrestler'], ['matches', 'Matches'], ['winPct', 'Win %'], ['lossPct', 'Loss %'], ['drawPct', 'Draw %']]
      : [['name', 'Wrestler'], ['matches', 'Matches'], ['wins', 'Wins'], ['losses', 'Losses'], ['draws', set === 'career' ? 'Draws' : 'Draws and no contests'], ['winPct', 'Win %']];
    const cell = (r: { p: number; rec: Rec }, key: SortKey) => {
      const v = value(r.p, r.rec, key) as number;
      return key.endsWith('Pct') ? `${v.toFixed(1)}%` : num(v);
    };
    const type = (rec: Rec) =>
      rec.basis === 'career'
        ? `${rec.source ? `<a href="${esc(rec.source)}" rel="noopener" target="_blank">Career total</a>` : 'Career total'}`
        : `Indexed broadcasts<small>${esc(rec.first ?? '')}${rec.last && rec.last !== rec.first ? ` to ${esc(rec.last)}` : ''}</small>`;
    const head = promotionName
      ? {
          title: `Indexed ${esc(promotionName)} records`,
          scope: 'This archive',
          note: `Televised ${esc(promotionName)} matches in this archive with a recorded result. Career totals cover every promotion, so they aren't used for one. A partial record, not a career total. Draws include no contests.`,
        }
      : HEADINGS[set];
    const who = division === 'women' ? 'women' : division === 'men' ? 'men' : 'wrestlers';
    const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕');
    root.innerHTML = `<header class="stats-head"><div><h2>${head.title}</h2><p role="status">${num(rows.length)} of ${num(base.length)} ${who} with records${minimum ? `, at least ${num(minimum)} matches` : ''}</p></div><span class="stats-scope">${head.scope}</span></header>
<p class="stats-note" id="stats-note">${head.note}</p>
<div class="stats-scroll" role="region" tabindex="0" aria-label="Match records, sortable">
<table class="stats-table" aria-describedby="stats-note"><caption class="visually-hidden">Match records. Select a column heading to sort, or a wrestler to open their career on the timeline.</caption>
<thead><tr>${columns
      .map(([key, label]) => `<th scope="col" aria-sort="${sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"${key === 'name' ? '' : ' class="num"'}><button type="button" data-sort="${key}">${label}<span aria-hidden="true">${arrow(key)}</span></button></th>`)
      .join('')}<th scope="col" class="type">Record type</th></tr></thead>
<tbody>${
      rows.length
        ? rows
            .map(
              (r) =>
                `<tr>${columns
                  .map(([key]) => (key === 'name' ? `<th scope="row"><button type="button" class="stats-person" data-person-id="${esc(model.people[r.p].id)}">${avatarHtml(model.people[r.p])}<span>${esc(model.people[r.p].name)}</span></button></th>` : `<td class="num${key === 'winPct' ? ' win' : ''}">${cell(r, key)}</td>`))
                  .join('')}<td class="type">${type(r.rec)}</td></tr>`,
            )
            .join('')
        : `<tr><td colspan="${columns.length + 1}" class="stats-empty">No wrestlers match these filters. Try another name or a lower minimum.</td></tr>`
    }</tbody></table></div>
<p class="stats-note">Percentages use total recorded matches, so they may not add up to exactly 100. Use the minimum to leave out very small samples.</p>`;
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const sortButton = t.closest<HTMLElement>('[data-sort]');
    if (sortButton) {
      const key = sortButton.dataset.sort as SortKey;
      sort.dir = sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc';
      sort.key = key;
      render();
      root.querySelector<HTMLElement>(`[data-sort="${key}"]`)?.focus({ preventScroll: true });
      announce(`Sorted by ${sortButton.textContent?.replace(/[▲▼↕]/g, '')}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`);
      return;
    }
    const person = t.closest<HTMLElement>('[data-person-id]');
    if (person) o.openPerson(person.dataset.personId!);
  });
  controls.records.addEventListener('change', render);
  controls.minimum.addEventListener('change', render);
  controls.format.addEventListener('change', () => {
    const percent = controls.format.value === 'percentages';
    const map: Partial<Record<SortKey, SortKey>> = percent ? { wins: 'winPct', losses: 'lossPct', draws: 'drawPct' } : { lossPct: 'losses', drawPct: 'draws' };
    sort.key = map[sort.key] ?? sort.key;
    render();
  });

  return { render };
}
