// Markup for the explorer's panels and popovers. Pure string builders over the model, so the
// same functions can render on the server later.
import { esc, fmtDate, num, plural } from './dom.ts';
import { DAY, dayNum, memberStart, type DetailRow, type Model, type Moment, type Period, type ProfileBundle, type Reign, type StorylineBundle } from './model.ts';

export type Story = StorylineBundle['storylines'][number];
export type Chapter = Story['chapters'][number];
export type StoryPromotion = StorylineBundle['promotions'][number];

export const KIND_LABEL = ['Match', 'Championship match', 'Promo or interview', 'Televised appearance'];

export const showUrl = (m: Moment) => `/shows/${m.show.id}/#${m.key}`;
export const personUrl = (id: string) => `/wrestlers/${id}/`;

// ---------- Ratings (PWL v1, as data/ratings.json describes it) ----------

const PROVIDER: Record<string, string> = { cagematch: 'CAGEMATCH', observer: 'Wrestling Observer', '411mania': '411Mania' };

export function ratingScore(rows: DetailRow[5]): number | null {
  const eligible = new Map<string, number>();
  for (const [provider, value, unit, , votes] of rows) {
    if (!Number.isFinite(value) || (provider === 'cagematch' && votes < 5)) continue;
    eligible.set(provider, Math.max(0, Math.min(100, value * (unit === 'stars' ? 20 : 10))));
  }
  const v = [...eligible.values()];
  return v.length >= 2 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

const ratingText = (value: number, unit: string) => (unit === 'stars' ? `${value} ${value === 1 ? 'star' : 'stars'}` : `${value.toFixed(2)} out of 10`);

export function ratingMini(detail: DetailRow | undefined): string {
  if (!detail?.[5].length) return '';
  const score = ratingScore(detail[5]);
  return `<span class="rating-mini">${score !== null ? `<b>PWL ${score}</b> ` : ''}${detail[5].map(([p, v, u]) => `${esc(PROVIDER[p] ?? p)} ${esc(ratingText(v, u))}`).join(', ')}</span>`;
}

function ratingBlock(detail: DetailRow): string {
  const rows = detail[5];
  if (!rows.length) return '';
  const score = ratingScore(rows);
  return `<section class="ratings" aria-label="Match ratings"><div class="ratings-head"><h3>Match ratings</h3>${score !== null ? `<p class="pwl-score"><span>PWL rating</span><strong>${score}</strong><small>/100</small></p>` : ''}</div><ul>${rows
    .map(([p, v, u, url, votes]) => `<li>${url ? `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(PROVIDER[p] ?? p)}</a>` : esc(PROVIDER[p] ?? p)} <strong>${esc(ratingText(v, u))}</strong>${p === 'cagematch' && votes ? ` <span class="quiet">${num(votes)} votes${votes < 5 ? ', too few to count' : ''}</span>` : ''}</li>`)
    .join('')}</ul>${score === null ? '<p class="hint">A PWL rating needs two eligible sources.</p>' : ''}</section>`;
}

// ---------- Pieces ----------

/** Match types that say nothing the title doesn't already say. */
export const GENERIC_TYPE = /^(match|other match|singles( match)?|\d+-person match|tag team( match)?|tag)$/i;

/**
 * Context worth showing: not a repeat of the result, and not just the match type and duration
 * that bulk records spell out ("Singles Match, Duration: 1:35.").
 */
export function usefulContext(context: string, result: string, matchType: string): string {
  const text = context.replace(/(^|[,·]\s*)Duration:\s*[\d:]+\.?\s*$/, '').replace(/[\s,.·]+$/, '').trim();
  if (!text || text === result || text.toLowerCase() === matchType.toLowerCase().trim()) return '';
  return text;
}

/** The type line for a match: title match, stipulation, duration. */
export function matchTypeLine(kind: number, matchType: string, duration: string): string {
  const stipulation = matchType && !GENERIC_TYPE.test(matchType) ? matchType : '';
  const label = kind === 1 && !/title|championship/i.test(stipulation) ? 'Title match' : kind === 2 ? 'Promo' : kind === 3 ? 'Appearance' : '';
  return [label, stipulation, duration].filter(Boolean).join(', ');
}

export const chips = (model: Model, ids: number[]) => ids.map((i) => `<button type="button" class="chip" data-person="${i}">${esc(model.people[i].name)}</button>`).join('');

export function eventCard(m: Moment, detail?: DetailRow): string {
  return `<button type="button" class="event-card" data-moment="${m.i}"><span>${esc(fmtDate(m.date))}, ${esc(m.show.label)}</span><strong>${esc(m.title)}</strong>${ratingMini(detail)}</button>`;
}

const close = (label: string) => `<button type="button" class="panel-close" aria-label="${esc(label)}">&times;</button>`;

const sourceLinks = (urls: string[]) =>
  urls.length ? `<p class="source-links">${urls.map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(urls.length > 1 ? `Source ${i + 1}` : 'Source')}</a>`).join(' ')}</p>` : '';

// ---------- Moment ----------

export function momentPanel(model: Model, m: Moment, detail: DetailRow | undefined, related: Moment[], storylines: { id: string; title: string }[]): string {
  const [result, context, matchType, duration, sources] = detail ?? ['', '', '', '', [], []];
  const meta = [matchType && !GENERIC_TYPE.test(matchType) ? matchType : '', duration].filter(Boolean).join(', ');
  const why = usefulContext(context, result, matchType);
  return `<div class="panel-top"><span class="panel-kind">${KIND_LABEL[m.kind]}</span>${close('Close this moment and restore the A to Z roster')}</div>
<p class="panel-date">${m.show.recorded ? 'Taped ' : ''}${esc(fmtDate(m.date, true))}</p>
<h2>${esc(m.title)}</h2>
<p class="panel-show"><a href="${showUrl(m)}">${esc(m.show.label)}</a>${meta ? ` <span class="quiet">${esc(meta)}</span>` : ''}</p>
${m.people.length ? `<div class="chips">${chips(model, m.people)}</div>` : ''}
${result && result !== m.title ? `<p class="panel-result">${esc(result)}</p>` : ''}
${detail ? ratingBlock(detail) : '<p class="quiet loading">Loading details…</p>'}
${why ? `<h3>Context</h3><p>${esc(why)}</p>` : ''}
${m.involved.length ? `<h3>Also involved</h3><div class="chips">${chips(model, m.involved)}</div><p class="hint">Hollow marks show involvement outside the match lineup.</p>` : ''}
${sourceLinks(sources)}
${related.length ? `<h3>Follow the connections</h3><div class="event-list">${related.map((r) => eventCard(r)).join('')}</div>` : ''}
${storylines.length ? `<h3>Follow the storyline</h3><div class="event-list">${storylines.map((s) => `<button type="button" class="story-link" data-storyline="${esc(s.id)}">${esc(s.title)}</button>`).join('')}</div>` : ''}`;
}

export function choicePanel(model: Model, person: number, moments: Moment[]): string {
  const first = moments[0];
  const last = moments.at(-1)!;
  return `<div class="panel-top"><span class="panel-kind">Choose a moment</span>${close('Close the moment chooser')}</div>
<p class="panel-date">${esc(fmtDate(first.date, true))}${last.date !== first.date ? ` to ${esc(fmtDate(last.date, true))}` : ''}</p>
<h2>${esc(model.people[person].name)}</h2>
<p>${plural(moments.length, 'moment')} here. Select one to open it, or zoom in to spread them out.</p>
<div class="event-list">${moments.map((m) => eventCard(m)).join('')}</div>`;
}

// ---------- Career explorer ----------

export interface CareerSpan {
  start: string;
  end: string;
  /** Last date the timeline should reach: later appearances, or a date of death, can follow the end. */
  through: string;
  startLabel: string;
  endLabel: string;
  debut: boolean;
  ended: boolean;
  active: boolean;
}

export function careerSpan(model: Model, person: number): CareerSpan {
  const span = model.spans.get(person);
  const moments = model.byPerson[person];
  const reigns = model.reignsByPerson[person];
  const periods = model.periodsByPerson.get(person) ?? [];
  const firsts = [moments[0]?.date, reigns[0]?.start, ...periods.map((p) => p.start)].filter((x): x is string => !!x).sort();
  // A reign or promotion run with no end says the wrestler is still there.
  const ongoing = reigns.some((r) => !r.end) || periods.some((p) => !p.end);
  const active = span?.status === 'active' || (!span?.end && span?.status !== 'retired' && ongoing);
  const lastDated = [moments.at(-1)?.date, ...reigns.map((r) => r.end), ...periods.map((p) => p.end)].filter((x): x is string => !!x).sort().at(-1);
  const debut = span?.debut || '';
  const start = debut || firsts[0] || model.asOf;
  const end = span?.end || (active ? model.asOf : lastDated || model.asOf);
  const through = [end, span?.through, moments.at(-1)?.date].filter((x): x is string => !!x).sort().at(-1)!;
  const precision = span?.precision || 'day';
  const debutText = debut ? (precision === 'year' ? debut.slice(0, 4) : precision === 'month' ? fmtDate(debut.slice(0, 7)) : fmtDate(debut)) : '';
  return {
    start,
    end,
    through,
    debut: !!debut,
    ended: !!span?.end,
    active,
    startLabel: debut ? `Debut, ${debutText}` : `First indexed, ${fmtDate(start)}`,
    endLabel: span?.end ? `${span.endLabel || 'Career ended'}, ${fmtDate(span.end)}` : active ? `Active through ${fmtDate(model.asOf)}` : `Last indexed, ${fmtDate(lastDated || model.asOf)}`,
  };
}

export function indexedRecord(model: Model, person: number): { matches: number; wins: number; losses: number; draws: number } {
  let matches = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const m of model.byPerson[person]) {
    if (m.kind > 1) continue;
    const at = m.people.indexOf(person);
    if (at < 0) continue;
    const o = m.outcomes[at];
    if (!o || o === '-') continue;
    matches++;
    if (o === 'w') wins++;
    else if (o === 'l' || o === 'q' || o === 'c') {
      // A DQ or count-out "loss" with no winner on the card is a double DQ or double count-out.
      if ((o === 'q' || o === 'c') && !m.outcomes.includes('w')) draws++;
      else losses++;
    } else draws++;
  }
  return { matches, wins, losses, draws };
}

function statTable(title: string, s: { matches?: number; wins?: number; losses?: number; draws?: number }, note: string): string {
  const cell = (label: string, n: number | undefined, withPct: boolean) => {
    const pct = withPct && Number.isFinite(n) && s.matches ? `${(((n as number) / s.matches) * 100).toFixed(1)}%` : '';
    return `<div><dt>${label}</dt><dd>${Number.isFinite(n) ? num(n as number) : '<span class="quiet">n/a</span>'}${pct ? `<small>${pct}</small>` : ''}</dd></div>`;
  };
  return `<h3>${esc(title)}</h3><dl class="stats">${cell('Matches', s.matches, false)}${cell('Wins', s.wins, true)}${cell('Losses', s.losses, true)}${cell('Draws and no contests', s.draws, true)}</dl><p class="hint">${note}</p>`;
}

export const periodDates = (p: Period, asOf: string) => (p.start === p.end ? fmtDate(p.start) : `${fmtDate(p.start)} to ${p.end ? fmtDate(p.end) : `present (through ${fmtDate(asOf)})`}`);

export function careerPanel(model: Model, person: number, prof: ProfileBundle | null, opts: { rival: string | null; momentsInRange: Moment[]; storylines: { id: string; title: string }[] }): string {
  const p = model.people[person];
  const span = careerSpan(model, person);
  const reigns = model.reignsByPerson[person];
  const periods = model.periodsByPerson.get(person) ?? [];
  const indexed = indexedRecord(model, person);
  const other = (prof?.ringNames ?? []).filter((r) => r.name !== p.name);
  const promos = periods.length
    ? [...new Set(periods.map((x) => x.name))]
    : [...new Set(model.byPerson[person].map((m) => m.show.promotion))].map((id) => model.promotions.get(id)?.name ?? id);
  const pf = prof?.profile;
  const rel = prof?.relationships;
  const relGroup = (key: 'feuds' | 'factions' | 'teams', label: string) => {
    const list = rel?.[key] ?? [];
    if (!list.length) return '';
    return `<details class="group"${key === 'feuds' && opts.rival ? ' open' : ''}><summary>${label} <span class="n">${list.length}</span></summary><ul class="entries">${list
      .map((r) => `<li>${key === 'feuds' ? `<button type="button" class="rival" data-rival="${esc(r.name)}" aria-pressed="${opts.rival === r.name}">${esc(r.name)}</button>` : `<strong>${esc(r.name)}</strong>`} <span class="quiet">${esc([r.promotions, r.period].filter(Boolean).join(', '))}</span>${r.note ? `<p>${esc(r.note)}${r.source ? ` <a href="${esc(r.source)}" rel="noopener" target="_blank">Source</a>` : ''}</p>` : ''}</li>`)
      .join('')}</ul></details>`;
  };
  const associates = (list: { name: string; meta?: string; note?: string }[] | undefined) =>
    list?.length ? `<ul class="entries">${list.map((a) => `<li><strong>${esc(a.name)}</strong>${a.meta ? ` <span class="quiet">${esc(a.meta.replace(/ · /g, ', '))}</span>` : ''}${a.note ? `<p>${esc(a.note)}</p>` : ''}</li>`).join('')}</ul>` : '';
  const recent = [...opts.momentsInRange].sort((a, b) => b.day - a.day);
  return `<div class="panel-top"><span class="panel-kind">Career explorer</span>${close('Close the career explorer')}</div>
${opts.rival ? `<section class="rival-focus"><strong>Against ${esc(opts.rival)}</strong><p>Matches against this opponent stay bright; the rest of the career is faded.</p><button type="button" class="text-button" data-clear-rival>Show every match again</button></section>` : ''}
<h2><a href="${personUrl(p.id)}">${esc(p.name)}</a></h2>
${other.length ? `<p class="aka">Also billed as ${esc(other.map((r) => r.name).join(', '))}</p>` : ''}
<p class="panel-span">${esc(span.startLabel)}. ${esc(span.endLabel)}.</p>
${prof?.intro ? `<p class="context">${esc(prof.intro)}</p>` : ''}
${prof?.inBrief ? `<h3>Career in brief</h3>${prof.inBrief.split('\n\n').map((x) => `<p class="context">${esc(x)}</p>`).join('')}` : ''}
${promos.length ? `<h3>Promotions</h3><div class="chips">${promos.map((n) => (periods.length ? `<button type="button" class="chip" data-period-name="${esc(n)}" data-person="${person}">${esc(n)}</button>` : `<span class="chip static">${esc(n)}</span>`)).join('')}</div>${periods.length ? '<p class="hint">Select a promotion for its dates and sources.</p>' : '<p class="hint">Promotions with televised matches in this archive.</p>'}` : ''}
${pf?.trainedBy ? `<h3>Trained by</h3><p>${esc(pf.trainedBy.text)}</p>` : ''}
${pf?.signatureMoves?.moves.length ? `<h3>Signature moves</h3><p>${esc(pf.signatureMoves.moves.join(', '))}</p>${pf.signatureMoves.note ? `<p class="hint">${esc(pf.signatureMoves.note)}</p>` : ''}` : ''}
${pf?.associates?.length ? `<h3>Managers, valets and cornermen</h3>${associates(pf.associates)}` : ''}
${pf?.guestCornermen?.length ? `<details class="group"><summary>Guest cornermen <span class="n">${pf.guestCornermen.length}</span></summary>${associates(pf.guestCornermen)}</details>` : ''}
${rel ? `<h3>Rivals and alliances</h3><p class="hint">Select a rival to bring out every indexed match between them.</p>${relGroup('feuds', 'Main feuds')}${relGroup('factions', 'Factions')}${relGroup('teams', 'Tag teams and partners')}` : ''}
${statTable('Indexed match record', indexed, 'Televised matches in this archive with a recorded result. This is a partial record, not a career total.')}
${prof?.externalTotals?.matches ? statTable('Career totals', prof.externalTotals, `From CAGEMATCH${prof.externalTotals.crawl ? `, indexed ${esc(prof.externalTotals.crawl)}` : ''}. Covers more than televised matches. ${prof.externalTotals.source ? `<a href="${esc(prof.externalTotals.source)}" rel="noopener" target="_blank">Source</a>` : ''}`) : ''}
${reigns.length || prof?.titleSummary?.length ? `<details class="group"${reigns.length ? ' open' : ''}><summary>Championships <span class="n">${reigns.length ? plural(reigns.length, 'reign') : plural(prof!.titleSummary!.length, 'title')}</span></summary>
${prof?.titleSummary?.length ? `<ul class="title-counts">${prof.titleSummary.map((t) => `<li><span>${t.source ? `<a href="${esc(t.source)}" rel="noopener" target="_blank">${esc(t.name)}</a>` : esc(t.name)}</span><strong>${t.count}</strong></li>`).join('')}</ul>` : ''}
${reigns.length ? `<ol class="reign-list">${reigns
          .map((r) => {
            const start = memberStart(r, person);
            const days = Math.round((dayNum(r.end || model.asOf) - dayNum(start)));
            return `<li><button type="button" class="reign-link" data-reign="${esc(r.title.id)}#${esc(r.id)}" data-person="${person}">${esc(r.name)}</button><span class="quiet">${esc(fmtDate(start))} to ${r.end ? esc(fmtDate(r.end)) : 'present'}, ${days < 1 ? 'under a day' : plural(days, 'day')}</span></li>`;
          })
          .join('')}</ol>` : ''}
${prof?.scopes?.titles ? `<p class="hint">${esc(prof.scopes.titles)}</p>` : ''}</details>` : ''}
${prof?.awards?.length ? `<details class="group"><summary>Career milestones <span class="n">${prof.awards.length}</span></summary><ul class="entries">${prof.awards.map((a) => `<li>${esc(a.replace(/ · /g, ', '))}</li>`).join('')}</ul></details>` : ''}
${prof?.signatureMatches?.length ? `<h3>Signature matches</h3><div class="event-list">${prof.signatureMatches
        .map((s) => {
          const m = s.segment ? model.momentById.get(s.segment) : undefined;
          return m ? `<button type="button" class="event-card signature" data-moment="${m.i}" data-anchor="${person}"><span>${esc(fmtDate(s.date))}, ${esc(s.show.replace(/ · /g, ', '))}</span><strong>${esc(s.title)}</strong><em>${esc(s.why)}</em></button>` : '';
        })
        .join('')}</div>` : ''}
<h3>On the timeline</h3>
<p class="hint">${recent.length ? `${plural(recent.length, 'moment')} in the selected dates. ${recent.length > 60 ? 'The latest 60 are listed; every one is on the timeline.' : ''}` : 'Nothing indexed in the selected dates. Gaps are missing records, not time away.'}</p>
<div class="event-list">${recent.slice(0, 60).map((m) => eventCard(m)).join('')}</div>
${opts.storylines.length ? `<h3>Follow the storyline</h3><div class="event-list">${opts.storylines.map((s) => `<button type="button" class="story-link" data-storyline="${esc(s.id)}">${esc(s.title)}</button>`).join('')}</div>` : ''}
${prof?.sources.length ? `<h3>Sources</h3>${sourceLinks(prof.sources)}` : ''}`;
}

// ---------- Dialogs ----------

export function reignDialog(r: Reign, person: number | null, asOf: string): string {
  const start = person === null ? r.start : memberStart(r, person);
  const days = Math.round((Date.parse(r.end || asOf) - Date.parse(start)) / DAY);
  return `<p class="panel-kind">Title reign</p><h2 id="dialog-title">${esc(r.name)}</h2><p>${esc(r.holder)}</p>
<dl class="dl-facts"><dt>Won</dt><dd>${esc(fmtDate(start, true))}</dd><dt>${r.end ? 'Lost' : 'Through'}</dt><dd>${esc(fmtDate(r.end || asOf, true))}${r.end ? '' : ', still champion'}</dd><dt>Length</dt><dd>${days < 1 ? 'Under a day' : plural(days, 'day')}</dd></dl>
<p><a href="/titles/${esc(r.title.id)}/?reign=${esc(r.id)}">Every ${esc(r.title.name)} reign</a></p>`;
}

export function periodDialog(model: Model, list: Period[]): string {
  const person = model.people[list[0].person];
  return `<p class="panel-kind">Promotion run, ${esc(person.name)}</p><h2 id="dialog-title">${esc(list.length === 1 ? list[0].fullName : list[0].name)}</h2>${list
    .map((p) => `<section>${list.length > 1 ? `<h3>${esc(p.fullName.replace(/ · /g, ', '))}</h3>` : ''}<p><strong>${esc(periodDates(p, model.asOf))}</strong></p>${p.note ? `<p>${esc(p.note)}</p>` : ''}${sourceLinks(p.sources)}</section>`)
    .join('')}<p class="hint">Runs and selected appearances from public sources. Overlapping runs don't mean exclusive contracts.</p>`;
}

export function previewList(moments: Moment[], details: Map<string, DetailRow>): string {
  const shown = moments.slice(0, 40);
  return `<div class="preview-list">${shown
    .map((m) => `<button type="button" class="preview-event" data-moment="${m.i}"><time>${m.show.recorded ? 'Taped ' : ''}${esc(fmtDate(m.date))}</time><span>${esc(m.show.label)}</span><strong>${esc(m.title)}</strong>${ratingMini(details.get(m.id))}</button>`)
    .join('')}${moments.length > shown.length ? `<p class="hint">${plural(moments.length - shown.length, 'more moment')} here. Zoom in to separate them.</p>` : ''}</div>`;
}

// ---------- Storylines ----------

export const CHAPTER_KIND: Record<string, string> = { title: 'Title match', match: 'Match', story: 'Story moment' };

/** A storyline's span: first milestone, and last milestone or still going. */
export const storyDates = (s: Story, asOf: string) => `${fmtDate(s.start, true)} to ${s.end ? fmtDate(s.end, true) : `the present, through ${fmtDate(asOf, true)}`}`;

export function recapPanel(model: Model, promo: StoryPromotion, s: Story): string {
  const cast = s.people.length ? `<div class="chips">${chips(model, s.people)}</div>` : s.cast.length ? `<p>${esc(s.cast.join(', '))}</p>` : '';
  return `<div class="panel-top"><span class="panel-kind">Storyline recap</span>${close('Close the storyline recap')}</div>
<p class="panel-date">${esc(promo.name)}, ${esc(storyDates(s, model.asOf))}</p>
<h2>${esc(s.title)}</h2>
${s.summary ? `<p class="context">${esc(s.summary)}</p>` : ''}
${cast ? `<h3>Key people</h3>${cast}` : ''}
<h3>Chapters</h3>
<div class="event-list">${s.chapters.map((c) => `<button type="button" class="event-card" data-chapter="${esc(c.id)}"><span>${esc(fmtDate(c.date))}${c.show ? `, ${esc(c.show)}` : ''}</span><strong>${esc(c.title)}</strong></button>`).join('')}</div>
<p class="hint">${plural(s.chapters.length, 'indexed chapter')}. Select one here or on the timeline for its story and source.</p>
${s.source ? sourceLinks([s.source]) : ''}`;
}

export function chapterPanel(model: Model, s: Story, c: Chapter, detail: DetailRow | undefined): string {
  const m = c.moment ? model.momentById.get(c.moment) : undefined;
  return `<div class="panel-top"><span class="panel-kind">${esc(CHAPTER_KIND[c.kind] ?? 'Story moment')}</span>${close('Close this chapter')}</div>
<p class="panel-date">${esc(fmtDate(c.date, true))}${c.show ? `, ${m ? `<a href="${showUrl(m)}">${esc(c.show)}</a>` : esc(c.show)}` : ''}</p>
<h2>${esc(c.title)}</h2>
${c.result ? `<p class="panel-result">${esc(c.result)}</p>` : ''}
${detail ? ratingBlock(detail) : ''}
${c.context ? `<h3>Context</h3><p class="context">${esc(c.context)}</p>` : ''}
${m ? `<div class="panel-actions"><button type="button" class="app-button" data-open-moment="${esc(m.id)}">Open connected careers</button></div>` : ''}
${sourceLinks(c.sources)}
<p class="hint">Chapter of <button type="button" class="text-button" data-recap>${esc(s.title)}</button></p>`;
}

export function chapterChoice(s: Story, list: Chapter[]): string {
  return `<div class="panel-top"><span class="panel-kind">Choose a moment</span>${close('Close the moment chooser')}</div>
<p class="panel-date">${esc(fmtDate(list[0].date, true))}${list.at(-1)!.date !== list[0].date ? ` to ${esc(fmtDate(list.at(-1)!.date, true))}` : ''}</p>
<h2>${esc(s.title)}</h2>
<p>${plural(list.length, 'chapter')} here. Select one, or zoom in to spread them out.</p>
<div class="event-list">${list.map((c) => `<button type="button" class="event-card" data-chapter="${esc(c.id)}"><span>${esc(fmtDate(c.date))}${c.show ? `, ${esc(c.show)}` : ''}</span><strong>${esc(c.title)}</strong></button>`).join('')}</div>`;
}

export function chapterPreview(list: Chapter[]): string {
  return `<div class="preview-list">${list
    .slice(0, 40)
    .map((c) => `<button type="button" class="preview-event" data-chapter="${esc(c.id)}"><time>${esc(fmtDate(c.date))}</time><span>${esc(c.show)}</span><strong>${esc(c.title)}</strong></button>`)
    .join('')}${list.length > 40 ? `<p class="hint">${plural(list.length - 40, 'more chapter')} here. Zoom in to separate them.</p>` : ''}</div>`;
}
