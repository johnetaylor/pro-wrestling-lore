// Wrestler page: the career strip, then the career in text and tables.
import type { Person } from '../../scripts/lib/types.ts';
import { unique } from '../../scripts/lib/util.ts';
import { html, type Raw } from '../lib/html.ts';
import { daysBetween, formatDate, num, outcomeClass, outcomeLabel, plural, ratingView, sentenceList, year, yearSpan } from '../lib/format.ts';
import type { Appearance, SiteData } from '../lib/load.ts';
import { personUrl, segmentUrl, showUrl, storylineUrl, familyUrl, titleUrl } from '../lib/urls.ts';
import { breadcrumbs, dateCell, linkNames, nameLink, promoColor, segmentMeta, showLabel, sourcesList, titleNameAt } from '../components/bits.ts';
import { careerStrip, promotionBands } from '../components/careerStrip.ts';
import type { PageMeta } from '../components/layout.ts';

export interface PersonStats {
  matches: Appearance[];
  segments: Appearance[];
  involved: Appearance[];
}

export function personStats(person: Person, site: SiteData): PersonStats {
  const apps = site.appearances.get(person.id) ?? [];
  return {
    matches: apps.filter((a) => a.seg.type === 'match' && a.role === 'competitor'),
    segments: apps.filter((a) => a.seg.type !== 'match'),
    involved: apps.filter((a) => a.seg.type === 'match' && a.role === 'involved'),
  };
}

/**
 * v69 generated most summaries from its own coverage ("X is listed in WWE match records from
 * 1986 to 2011. Explore available broadcast matches on the timeline."). They describe the old
 * archive rather than the wrestler, so pages leave them out and state the facts directly.
 */
export function isBoilerplate(summary: string | undefined): boolean {
  return !summary || /is listed in .+ match records from|is linked to the sourced \d{4}|appears in the \d{4} broadcast archive|Explore available broadcast matches/.test(summary);
}

/** Other names, with the years each was in use when we know them. */
function otherNames(person: Person): string[] {
  const start = (r: Person['ringNames'][number]) => r.from ?? r.billed?.first ?? '9999';
  return person.ringNames
    .filter((r) => r.name !== person.name)
    .sort((a, b) => start(a).localeCompare(start(b)))
    .map((r) => {
      const span = yearSpan(r.from ?? r.billed?.first, r.to ?? r.billed?.last);
      return span ? `${r.name} (${span})` : r.name;
    });
}

function careerSentence(person: Person): string {
  const debut = person.debut?.date;
  const end = person.careerEnd?.date;
  if (debut && end) return `Wrestled from ${year(debut)} to ${year(end)}.`;
  if (debut && person.status?.value === 'active') return `Wrestling since ${year(debut)}.`;
  if (debut) return `Debuted in ${year(debut)}.`;
  return '';
}

function archiveSentence(stats: PersonStats, reigns: number): string {
  const { matches, segments } = stats;
  const parts: string[] = [];
  if (matches.length) {
    const span = yearSpan(matches[0].show.date, matches.at(-1)!.show.date);
    parts.push(`${plural(matches.length, 'televised match', 'televised matches')} ${span.includes('–') ? `from ${span.replace('–', ' to ')}` : `in ${span}`}`);
  }
  if (segments.length) parts.push(plural(segments.length, 'promo or appearance', 'promos and appearances'));
  if (reigns) parts.push(plural(reigns, 'championship reign'));
  return parts.length ? `This archive has ${sentenceList(parts)}.` : 'No televised matches are indexed for this wrestler yet.';
}

/** "Hulk Hogan, promo / interview" on Hogan's own page reads better as "Promo / interview". */
function ownSegmentTitle(title: string, person: Person): string | null {
  for (const name of [person.name, ...person.ringNames.map((r) => r.name)]) {
    if (title.startsWith(`${name}, `)) {
      const rest = title.slice(name.length + 2);
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return null;
}

function resultCell(a: Appearance, personId: string): Raw {
  const label = outcomeLabel(a.seg, personId);
  const cls = outcomeClass(label);
  return html`<td class="result${cls ? ` result--${cls}` : ''}">${label}</td>`;
}

function byYear(apps: Appearance[]): Map<string, Appearance[]> {
  const out = new Map<string, Appearance[]>();
  for (const a of apps) {
    const y = year(a.show.date);
    if (!out.has(y)) out.set(y, []);
    out.get(y)!.push(a);
  }
  return out;
}

function matchTable(apps: Appearance[], person: Person, site: SiteData, withResult: boolean): Raw {
  return html`<div class="table-wrap"><table class="data matches">
<thead><tr><th scope="col">Date</th><th scope="col">Show</th><th scope="col">${withResult ? 'Match' : 'Segment'}</th>${withResult ? html`<th scope="col">Result</th>` : ''}</tr></thead>
<tbody>${apps.map((a) => {
    const own = !withResult ? ownSegmentTitle(a.seg.title, person) : null;
    const { html: title } = own ? { html: html`${own}` } : linkNames(a.seg, site.people, person.id);
    const meta = segmentMeta(a.seg);
    const rating = ratingView(a.seg, site.ratings);
    return html`<tr>${dateCell(a.show.date, segmentUrl(`${a.show.id}#${a.seg.key}`))}<td class="show">${html`<a href="${showUrl(a.show)}">${showLabel(a.show, site)}</a>`}</td><td>${title}${a.seg.titleMatch ? html` <span class="title-mark">Title match</span>` : ''}${meta ? html` <span class="quiet">${meta}</span>` : ''}${rating?.score != null ? html` <span class="pwl" title="PWL rating, ${rating.eligible} sources">${rating.score}</span>` : ''}</td>${withResult ? resultCell(a, person.id) : ''}</tr>`;
  })}</tbody></table></div>`;
}

function yearSections(apps: Appearance[], person: Person, site: SiteData, kind: 'matches' | 'segments'): Raw {
  const years = byYear(apps);
  const jump = years.size > 4
    ? html`<nav class="year-jump" aria-label="Jump to a year">${[...years.keys()].map((y) => html`<a href="#${kind}-${y}">${y}</a>`)}</nav>`
    : '';
  return html`${jump}${[...years].map(([y, list]) => html`<h3 class="year-head" id="${kind}-${y}">${y} <span class="quiet">${plural(list.length, kind === 'matches' ? 'match' : 'segment', kind === 'matches' ? 'matches' : 'segments')}</span></h3>${matchTable(list, person, site, kind === 'matches')}`)}`;
}

function promotionsSection(person: Person, site: SiteData, stats: PersonStats, buildDate: string): Raw | '' {
  const apps = site.appearances.get(person.id) ?? [];
  const bands = promotionBands(person, apps, site.promotions, buildDate);
  if (!bands.length) return '';
  const DAY = 86400000;
  const countIn = (b: (typeof bands)[number]) =>
    stats.matches.filter((a) => a.show.promotion === b.promotion && Date.parse(a.show.date) >= b.start - DAY && Date.parse(a.show.date) <= b.end + DAY).length;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const curated = !!person.curated?.promotionPeriods?.length;
  const sorted = [...bands].sort((a, b) => a.start - b.start || b.end - a.end);
  return html`<section class="section" id="promotions" aria-labelledby="promotions-h">
<h2 id="promotions-h">Promotions</h2>
<p class="section-note">${curated ? 'Documented runs and one-off appearances, in order. Counts are the televised matches from each run in this archive.' : 'Runs worked out from the televised matches in this archive; a gap of 18 months or more starts a new run.'}</p>
<ol class="entries entries--dated entries--runs">${sorted.map((b) => {
    const n = countIn(b);
    const end = b.end >= Date.parse(buildDate) - DAY ? 'present' : iso(b.end);
    const years = end === 'present' ? `${iso(b.start).slice(0, 4)} to now` : yearSpan(iso(b.start), end);
    return html`<li><span class="years">${years}</span><div><p class="entry-name"><span class="promo-tag" style="--c:${promoColor(b.promotion)}">${b.label}</span>${b.period?.fullName && b.period.fullName !== b.label ? html` <span class="quiet">${b.period.fullName}</span>` : ''}${n ? html` <span class="run-count">${plural(n, 'match', 'matches')}</span>` : ''}</p>${b.period?.note ? html`<p>${b.period.note}</p>` : ''}</div></li>`;
  })}</ol>
</section>`;
}

function championshipsSection(person: Person, site: SiteData, buildDate: string): Raw | '' {
  const reigns = site.reignsByPerson.get(person.id) ?? [];
  const summary = person.titleSummary ?? [];
  if (!reigns.length && !summary.length && !person.awards?.length) return '';
  return html`<section class="section" id="championships" aria-labelledby="championships-h">
<h2 id="championships-h">Championships</h2>
${reigns.length
    ? html`<div class="table-wrap"><table class="data">
<thead><tr><th scope="col">Championship</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col" class="num">Days</th></tr></thead>
<tbody>${reigns.map(({ title, reign }) => {
        const end = reign.end;
        const days = reign.days ?? (end ? daysBetween(reign.start, end) : daysBetween(reign.start, buildDate));
        const partners = reign.people.filter((p) => p !== person.id);
        return html`<tr><td><a href="${titleUrl(title.id)}#${reign.id}">${titleNameAt(title, reign.start)}</a>${partners.length ? html` <span class="quiet">with ${partners.map((p, i) => html`${i ? ', ' : ''}<a href="${personUrl(p)}">${site.people.get(p)?.name ?? p}</a>`)}</span>` : ''}</td><td class="date">${formatDate(reign.start, { short: true })}</td><td class="date">${end ? formatDate(end, { short: true }) : html`<span class="current">Current</span>`}</td><td class="num">${num(days)}</td></tr>`;
      })}</tbody></table></div>`
    : ''}
${summary.length
    ? html`<h3 class="subhead">Career title counts</h3><p class="section-note">${person.scopes?.titles ?? 'Counts from the linked title histories, including reigns not yet in this archive.'}</p><ul class="plain-list plain-list--bare">${summary.map((s) => html`<li><span class="count">${s.count}</span> ${s.name}${s.source ? html` <a class="source-link" href="${s.source}" rel="noopener">source</a>` : ''}</li>`)}</ul>`
    : ''}
${person.awards?.length ? html`<h3 class="subhead">Honors</h3><ul class="plain-list">${person.awards.map((a) => html`<li>${a}</li>`)}</ul>` : ''}
</section>`;
}

function profileSection(person: Person, site: SiteData): Raw | '' {
  const prof = person.curated?.profile;
  if (!prof) return '';
  const linkList = (links: { label: string; url: string }[] | undefined) =>
    links?.length ? html`<p class="cell-note">${links.map((l, i) => html`${i ? ', ' : ''}<a href="${l.url}" rel="noopener">${l.label}</a>`)}</p>` : '';
  const people = (list: { name: string; meta?: string; note?: string }[]) =>
    html`<ul class="entries entries--grid">${list.map((a) => html`<li><span class="entry-name">${nameLink(a.name, site)}</span>${a.meta ? html` <span class="quiet">${a.meta}</span>` : ''}${a.note ? html`<p>${a.note}</p>` : ''}</li>`)}</ul>`;
  return html`<section class="section" id="career" aria-labelledby="career-h">
<h2 id="career-h">Career in brief</h2>
<div class="prose">${prof.inBrief?.split('\n\n').map((p) => html`<p>${p}</p>`)}</div>
<div class="facts-grid">
${prof.trainedBy ? html`<div><h3 class="subhead">Trained by</h3><p>${prof.trainedBy.text}</p>${linkList(prof.trainedBy.links)}</div>` : ''}
${prof.signatureMoves?.moves.length ? html`<div><h3 class="subhead">Signature moves</h3><p>${sentenceList(prof.signatureMoves.moves)}.</p>${prof.signatureMoves.note ? html`<p class="cell-note">${prof.signatureMoves.note}</p>` : ''}${linkList(prof.signatureMoves.links)}</div>` : ''}
</div>
${prof.associates?.length ? html`<h3 class="subhead">Managers, valets and cornermen</h3>${people(prof.associates)}` : ''}
${prof.guestCornermen?.length ? html`<h3 class="subhead">Guest cornermen</h3>${people(prof.guestCornermen)}` : ''}
</section>`;
}

function signatureSection(person: Person, site: SiteData): Raw | '' {
  const list = person.curated?.signatureMatches ?? [];
  if (!list.length) return '';
  return html`<section class="section" id="signature" aria-labelledby="signature-h">
<h2 id="signature-h">Signature matches</h2>
<p class="section-note">Defining matches, chosen for their impact. Each is ringed on the timeline above.</p>
<ol class="entries entries--dated">${list.map((m) => html`<li><time datetime="${m.date}">${formatDate(m.date, { short: true })}</time><div><p class="entry-name">${m.segment ? html`<a href="${segmentUrl(m.segment)}">${m.title}</a>` : m.title} <span class="quiet">${m.show}</span></p><p>${m.why}</p></div></li>`)}</ol>
</section>`;
}

function relationshipsSection(person: Person, site: SiteData): Raw | '' {
  const rel = person.curated?.relationships;
  if (!rel) return '';
  const groups: [string, typeof rel.feuds][] = [
    ['Rivals', rel.feuds],
    ['Factions', rel.factions],
    ['Tag teams and partners', rel.teams],
  ];
  return html`<section class="section" id="rivals" aria-labelledby="rivals-h">
<h2 id="rivals-h">Rivals and alliances</h2>
<p class="section-note">Major rivalries and partnerships. Their dates describe the relationship and can overlap runs in different promotions.</p>
<div class="columns columns--wide">${groups
    .filter(([, list]) => list?.length)
    .map(([label, list]) => html`<div><h3 class="subhead">${label}</h3><ul class="entries">${list!.map((r) => html`<li><span class="entry-name">${nameLink(r.name, site)}</span> <span class="quiet">${[r.promotions, r.period].filter(Boolean).join(', ')}</span>${r.note ? html`<p>${r.note}${r.source ? html` <a class="source-link" href="${r.source}" rel="noopener">source</a>` : ''}</p>` : ''}</li>`)}</ul></div>`)}</div>
</section>`;
}

function storylinesSection(person: Person, site: SiteData): Raw | '' {
  const list = site.storylinesByPerson.get(person.id) ?? [];
  const families = site.familiesByPerson.get(person.id) ?? [];
  if (!list.length && !families.length) return '';
  return html`<section class="section" id="storylines" aria-labelledby="storylines-h">
<h2 id="storylines-h">${list.length ? 'Storylines' : 'Family'}</h2>
${list.length
    ? html`<ul class="link-list">${list.map((s) => {
        const dates = s.chapters.map((c) => c.date).sort();
        return html`<li><a href="${storylineUrl(s.id)}">${s.title}</a><span class="quiet">${site.promotions.get(s.promotion)?.name ?? s.promotion} ${yearSpan(dates[0], dates.at(-1))}</span></li>`;
      })}</ul>`
    : ''}
${families.length ? html`${list.length ? html`<h3 class="subhead">Family</h3>` : ''}<p>${families.map((f, i) => html`${i ? ' ' : ''}Part of the <a href="${familyUrl(f.id)}">${f.name.replace(/ · /g, ', ')}</a> wrestling family.`)}</p>` : ''}
</section>`;
}

export function personPage(person: Person, site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  const stats = personStats(person, site);
  const reigns = site.reignsByPerson.get(person.id) ?? [];
  const signature = new Set((person.curated?.signatureMatches ?? []).map((m) => m.segment).filter((x): x is string => !!x));
  const names = otherNames(person);
  const lede = person.curated?.profile?.intro ?? (isBoilerplate(person.summary) ? undefined : person.summary);
  const facts = [careerSentence(person), archiveSentence(stats, reigns.length)].filter(Boolean).join(' ');
  const strip = careerStrip(person, site, { signature, today: buildDate });
  const promos = unique((site.appearances.get(person.id) ?? []).map((a) => a.show.promotion)).map((p) => site.promotions.get(p)?.name ?? p);

  const sections: [string, string, Raw | ''][] = [
    ['career', 'Career', profileSection(person, site)],
    ['signature', 'Signature matches', signatureSection(person, site)],
    ['promotions', 'Promotions', promotionsSection(person, site, stats, buildDate)],
    ['championships', 'Championships', championshipsSection(person, site, buildDate)],
    [
      'matches',
      'Matches',
      stats.matches.length || stats.involved.length
        ? html`<section class="section" id="matches" aria-labelledby="matches-h"><h2 id="matches-h">Matches</h2><p class="section-note">${plural(stats.matches.length, 'televised match', 'televised matches')} in this archive${stats.involved.length ? `, plus ${plural(stats.involved.length, 'match', 'matches')} as a manager, second or other involved party` : ''}. Select a date to open the full card.</p>${yearSections([...stats.matches, ...stats.involved].sort((a, b) => a.show.date.localeCompare(b.show.date)), person, site, 'matches')}</section>`
        : '',
    ],
    [
      'segments',
      'Promos and appearances',
      stats.segments.length
        ? html`<section class="section" id="segments" aria-labelledby="segments-h"><h2 id="segments-h">Promos and appearances</h2>${yearSections(stats.segments, person, site, 'segments')}</section>`
        : '',
    ],
    ['rivals', 'Rivals', relationshipsSection(person, site)],
    ['storylines', 'Storylines', storylinesSection(person, site)],
  ];
  const present = sections.filter(([, , body]) => body);
  const sources = unique([...person.sources, ...Object.values(person.curated?.sources ?? {}), ...(person.curated?.profile?.links ?? []).map((l) => l.url)]);

  const body = html`<article class="person">
<header class="page-head">
${breadcrumbs([{ name: 'Wrestlers', url: '/wrestlers/' }, { name: person.name }])}
<h1>${person.name}</h1>
${names.length ? html`<p class="aka">Also billed as ${sentenceList(names)}.</p>` : ''}
${lede ? html`<p class="lede">${lede}</p>` : ''}
<p class="facts">${facts}</p>
</header>
${strip ?? ''}
${present.length > 2 ? html`<nav class="page-nav" aria-label="On this page"><ul>${present.map(([id, label]) => html`<li><a href="#${id}">${label}</a></li>`)}</ul></nav>` : ''}
${present.map(([, , b]) => b)}
<section class="section" id="sources" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2><p class="section-note">Profile sources. Each match links to its own source on its show page.</p>${sourcesList(sources)}</section>
</article>`;

  const description = (
    lede ??
    `${person.name}'s televised career on one timeline: ${facts.replace(/^This archive has /, '').replace(/\.$/, '')}${promos.length ? `, in ${sentenceList(promos.slice(0, 4))}` : ''}.`
  ).slice(0, 300);
  const sameAs = person.sources.filter((u) => /wwe\.com\/superstars|cagematch\.net\/\?id=2|thesmackdownhotel\.com\/wrestlers|allelitewrestling\.com\/roster|wikipedia\.org/.test(u));
  return {
    meta: {
      title: `${person.name}: matches, championships and career`,
      description,
      path: personUrl(person.id),
      nav: 'wrestlers',
      breadcrumbs: [
        { name: 'Wrestlers', url: '/wrestlers/' },
        { name: person.name, url: personUrl(person.id) },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: person.name,
          ...(names.length ? { alternateName: person.ringNames.filter((r) => r.name !== person.name).map((r) => r.name) } : {}),
          ...(lede ? { description: lede } : {}),
          ...(sameAs.length ? { sameAs } : {}),
        },
      ],
      scripts: strip ? ['strip'] : [],
    },
    body,
  };
}
