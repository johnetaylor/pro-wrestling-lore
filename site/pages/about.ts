// Coverage and sources: what the archive holds, what it leaves out and where its records come from.
// v69 kept this in a panel over the explorer; here it is a page. Every figure is counted from data/
// at build time, so the page can't drift from the archive.
import { html, raw, type Raw } from '../lib/html.ts';
import { formatDate, num, plural, ratingView, sentenceList, yearSpan } from '../lib/format.ts';
import type { SiteData } from '../lib/load.ts';
import { personUrl, promotionUrl } from '../lib/urls.ts';
import { breadcrumbs, promoTag } from '../components/bits.ts';
import type { PageMeta } from '../components/layout.ts';
import { LANE_ORDER } from './shows.ts';

/** Names for the sites records cite most; any other site shows its host name. */
const SOURCE_NAMES: Record<string, string> = {
  'thehistoryofwwe.com': 'The History of WWE',
  'wwe.com': 'WWE.com',
  'thesmackdownhotel.com': 'The SmackDown Hotel',
  'huggingface.co': 'Ringside Analytics dataset',
  'cagematch.net': 'CAGEMATCH',
  'allelitewrestling.com': 'AEW',
  'en.wikipedia.org': 'Wikipedia',
  'onlineworldofwrestling.com': 'Online World of Wrestling',
  'wrestlinginc.com': 'Wrestling Inc.',
  'tnawrestling.com': 'TNA Wrestling',
  'prowrestlinghistory.com': 'Pro Wrestling History',
  'njpw1972.com': 'NJPW',
  'pwtorch.com': 'PWTorch',
  'postwrestling.com': 'POST Wrestling',
  'wrestleview.com': 'WrestleView',
};
const BULK = 'huggingface.co';
const BULK_URL = 'https://huggingface.co/datasets/datamatters24/ringside-analytics';
const SHOWN_SOURCES = 12;

const CARDS: [string, string][] = [
  ['indexed', 'Full card, wrestlers linked'],
  ['unlinked', 'Card listed, names not linked yet'],
  ['listed', 'Show known, card not indexed yet'],
  ['career-only', 'Known from career records only'],
];

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function coveragePage(site: SiteData, buildDate: string): { meta: PageMeta; body: Raw } {
  // Shows, matches and other segments by promotion; card completeness; ratings.
  type Row = { id: string; shows: number; matches: number; other: number; first: string; last: string };
  const byPromotion = new Map<string, Row>();
  const cards = new Map<string, number>();
  let matches = 0;
  let other = 0;
  let recorded = 0;
  let rated = 0;
  let scored = 0;
  for (const s of site.shows.values()) {
    const row = byPromotion.get(s.promotion) ?? { id: s.promotion, shows: 0, matches: 0, other: 0, first: s.date, last: s.date };
    row.shows++;
    if (s.date < row.first) row.first = s.date;
    if (s.date > row.last) row.last = s.date;
    for (const g of s.segments) {
      if (g.type === 'match') row.matches++;
      else row.other++;
      const rating = g.type === 'match' ? ratingView(g, site.ratings) : null;
      if (rating) {
        rated++;
        if (rating.score !== null) scored++;
      }
    }
    byPromotion.set(s.promotion, row);
    cards.set(s.coverage.card, (cards.get(s.coverage.card) ?? 0) + 1);
    if (s.dateBasis === 'recorded') recorded++;
  }
  const rows = [...byPromotion.values()].sort((a, b) => b.shows - a.shows || a.id.localeCompare(b.id));
  for (const r of rows) {
    matches += r.matches;
    other += r.other;
  }
  const first = rows.reduce((a, r) => (r.first < a ? r.first : a), buildDate);
  const last = rows.reduce((a, r) => (r.last > a ? r.last : a), '');
  const promoName = (id: string) => site.promotions.get(id)?.name ?? id;
  const promoCell = (id: string) => {
    const tag = promoTag(id, promoName(id));
    return (LANE_ORDER as readonly string[]).includes(id) ? html`<a href="${promotionUrl(id)}">${tag}</a>` : tag;
  };

  // People.
  const people = [...site.people.values()];
  const confirmed = people.filter((p) => p.gender && (p.genderBasis === 'division' || p.genderBasis === 'reviewed' || p.genderBasis === 'source')).length;
  const unconfirmed = people.filter((p) => p.gender && p.genderBasis === 'legacy-placeholder').length;
  const ungendered = people.filter((p) => !p.gender).length;
  const withTotals = people.filter((p) => p.externalTotals).length;
  const profiled = people.filter((p) => p.curated).sort((a, b) => a.name.localeCompare(b.name));
  const ringNameOwners = new Map<string, Set<string>>();
  for (const p of people) for (const r of p.ringNames) ringNameOwners.set(r.name, (ringNameOwners.get(r.name) ?? new Set()).add(p.id));
  const shared = [...ringNameOwners].find(([, ids]) => ids.size > 1)?.[0];

  // Titles, storylines, families, calendar.
  const titles = [...site.titles.values()].filter((t) => t.reigns.length);
  const reigns = titles.reduce((a, t) => a + t.reigns.length, 0);
  const trees = Object.keys(site.lineages?.trees ?? {}).length;
  const traced = titles.filter((t) => t.established);
  const tracedReigns = traced.reduce((a, t) => a + t.reigns.length, 0);
  const tracedPromotions = LANE_ORDER.filter((p) => traced.some((t) => t.promotion === p)).map(promoName);
  const titleLinks = (site.lineages?.links ?? []).length;
  const champions = new Set(traced.flatMap((t) => t.reigns.flatMap((r) => r.people))).size;
  const storylines = [...site.storylines.values()];
  const chapters = storylines.reduce((a, s) => a + s.chapters.length, 0);
  const storyPromotions = LANE_ORDER.filter((p) => storylines.some((s) => s.promotion === p)).map(promoName);
  const families = [...site.families.values()];
  const members = families.reduce((a, f) => a + f.members.length, 0);
  const cal = site.calendar;

  // Sources: how many records cite each site. A record is a show, segment, person, reign, chapter or family.
  const citing = new Map<string, number>();
  const cite = (urls: (string | undefined)[]) => {
    for (const h of new Set(urls.filter((u): u is string => !!u).map(host))) if (h) citing.set(h, (citing.get(h) ?? 0) + 1);
  };
  let bulkOnly = 0;
  for (const s of site.shows.values()) {
    cite(s.sources);
    if (s.sources.length && s.sources.every((u) => host(u) === BULK)) bulkOnly++;
    for (const g of s.segments) {
      cite(g.sources);
      if (g.sources.length && g.sources.every((u) => host(u) === BULK)) bulkOnly++;
    }
  }
  for (const p of people) cite([...(p.sources ?? []), ...Object.values(p.curated?.sources ?? {})]);
  for (const t of site.titles.values()) for (const r of t.reigns) cite(r.sources);
  for (const s of storylines) for (const c of s.chapters) cite(c.sources);
  for (const f of families) cite(Object.values(f.sources).map((x) => x.url));
  const sources = [...citing].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sourceLink = (h: string) => html`<a href="${h === BULK ? BULK_URL : `https://${h}/`}" rel="noopener">${SOURCE_NAMES[h] ?? h}</a>`;

  const r = site.ratings;
  const methodText = String(r.method ?? '').replace(/^PWL v\d+:\s*/, '');
  const method = methodText.charAt(0).toUpperCase() + methodText.slice(1);
  const providers = Object.values(r.providers ?? {}) as { name: string; kind?: string; reviewer?: string; unit?: string; scale?: number; note?: string; methodSource?: string }[];
  const providerLine = (p: (typeof providers)[number]) =>
    html`<li><strong>${p.name}</strong>: ${p.kind === 'Audience' ? 'audience score' : 'critic rating'} out of ${p.scale} ${p.unit === 'stars' ? 'stars' : 'points'}${p.reviewer ? `, by ${p.reviewer}` : ''}.${p.note ? ` ${p.note}` : ''}${p.methodSource ? html` <a href="${p.methodSource}" rel="noopener">How it works</a>` : ''}</li>`;

  const body = html`<header class="page-head">
${breadcrumbs([{ name: 'Coverage and sources' }])}
<h1>Coverage and sources</h1>
<p class="lede">The archive holds ${plural(site.shows.size, 'televised show')} from ${first.slice(0, 4)} to ${last.slice(0, 4)}, with ${num(matches)} matches and ${num(other)} promos and appearances. Every count on this site is a record in this archive, not a complete career total. Figures as of ${formatDate(buildDate)}.</p>
</header>
<div class="prose-page">
<section class="section" aria-labelledby="counts-h">
<h2 id="counts-h">What counts</h2>
<ul class="rules">
<li>Everything that aired: weekly television, secondary shows, pay-per-views and premium live events, specials, streaming events and televised pre-shows.</li>
<li>Never dark matches or house shows. A match is published once a source confirms it aired; anything unconfirmed stays out of the archive and out of every count.</li>
<li>A show is dated by the day it aired.${recorded ? ` The ${plural(recorded, 'show', 'shows')} known only by ${recorded === 1 ? 'its' : 'their'} taping date ${recorded === 1 ? 'is' : 'are'} marked Recorded.` : ''}</li>
<li>A battle royal or gauntlet counts as one match.</li>
<li>Promos and appearances are selected entries, each with its own source. No show claims a complete list of them.</li>
<li>A missing mark doesn't mean someone wasn't there. That show or segment may not be indexed yet.</li>
</ul>
</section>
<section class="section" aria-labelledby="promotions-h">
<h2 id="promotions-h">Shows by promotion</h2>
<div class="table-wrap"><table class="data">
<thead><tr><th scope="col">Promotion</th><th scope="col" class="num">Shows</th><th scope="col" class="num">Matches</th><th scope="col" class="num">Promos and appearances</th><th scope="col">Years</th></tr></thead>
<tbody>${rows.map((row) => html`<tr><td>${promoCell(row.id)}</td><td class="num">${num(row.shows)}</td><td class="num">${num(row.matches)}</td><td class="num">${num(row.other)}</td><td class="date">${yearSpan(row.first, row.last)}</td></tr>`)}</tbody>
<tfoot><tr><th scope="row">All promotions</th><td class="num">${num(site.shows.size)}</td><td class="num">${num(matches)}</td><td class="num">${num(other)}</td><td class="date">${yearSpan(first, last)}</td></tr></tfoot>
</table></div>
<h3>How complete the cards are</h3>
<div class="table-wrap"><table class="data data--compact"><tbody>${CARDS.filter(([k]) => cards.get(k)).map(([k, label]) => html`<tr><th scope="row">${label}</th><td class="num">${plural(cards.get(k)!, 'show')}</td></tr>`)}</tbody></table></div>
</section>
<section class="section" aria-labelledby="people-h">
<h2 id="people-h">Wrestlers</h2>
<p>${plural(people.length, 'person', 'people')}, one record each. A ring name belongs to the person who used it, for the dates they used it${shared ? `; a character played by more than one person, such as ${shared}, is a ring name rather than a person` : ''}.</p>
<p>${plural(withTotals, 'wrestler')} also show career totals from CAGEMATCH. Those totals cover a whole career, untelevised matches included, and are never mixed with this archive's counts.</p>
<p>The division filter in Careers uses each person's recorded gender. ${num(confirmed)} are confirmed by the division of a title they held or by review; ${num(unconfirmed)} still carry the original site's unconfirmed value${ungendered ? `, and ${plural(ungendered, 'person has', 'people have')} none, so they appear only under all divisions` : ''}.</p>
${profiled.length ? html`<p>Full career profiles, with trainers, signature moves, rivals and promotion runs, exist for ${raw(sentenceList(profiled.map((p) => html`<a href="${personUrl(p.id)}">${p.name}</a>`.value)))} so far.</p>` : ''}
</section>
<section class="section" aria-labelledby="titles-h">
<h2 id="titles-h">Championships</h2>
<p>${plural(titles.length, 'championship')} ${titles.length === 1 ? 'has' : 'have'} ${plural(reigns, 'indexed reign')}. ${plural(traced.length, 'title')} from ${sentenceList(tracedPromotions)} ${traced.length === 1 ? 'is' : 'are'} traced reign by reign from the first champion, ${num(tracedReigns)} reigns held by ${plural(champions, 'wrestler')}, with the names each title carried and ${plural(titleLinks, 'dated link')} to the titles it absorbed, replaced or became. The rest come from wrestlers' careers and list only the reigns indexed so far.</p>
<p>A traced history is read from the title's champions list on Wikipedia and checked: a reign whose printed length disagrees with its dates by more than a day is held back unless a note explains it, such as a tape delay or the promotion's own count. Reigns are the title changes a promotion recognizes, wherever they happened, house shows included; the match behind a change is in the archive only if it aired. Champions the archive had no record of were added as wrestlers.</p>
<p>Days are as the source counts them where it gives a count, otherwise elapsed calendar days. A reign still going runs through ${formatDate(buildDate)}.${trees ? ` The main WWE titles also keep ${plural(trees, 'hand-drawn title-history tree')} from the original site.` : ''}</p>
</section>
<section class="section" aria-labelledby="stories-h">
<h2 id="stories-h">Storylines</h2>
<p>${plural(storylines.length, 'storyline')} from ${sentenceList(storyPromotions)}, told in ${plural(chapters, 'dated chapter')}. They are selected connections between sourced events, not official or complete histories. A storyline runs from its first researched chapter to its last, so its ends aren't definitive, and a gap doesn't mean the story stopped.</p>
</section>
<section class="section" aria-labelledby="families-h">
<h2 id="families-h">Families</h2>
<p>${plural(families.length, 'wrestling family', 'wrestling families')} with ${plural(members, 'member')}. They aren't complete family trees. Each link says how two people are related, from parents and siblings to marriage, adoption and honorary ties, and a storyline family is not a family relationship.</p>
</section>
<section class="section" aria-labelledby="calendar-h">
<h2 id="calendar-h">Calendar</h2>
<p>The ${cal.year} calendar lists ${plural(cal.events.length, 'event')} from ${plural(cal.promotions.length, 'promotion and brand', 'promotions and brands')}, checked ${formatDate(cal.checked)}. Dates, venues and cards can change.</p>
</section>
<section class="section" aria-labelledby="ratings-h">
<h2 id="ratings-h">Match ratings</h2>
<p>${plural(rated, 'match has', 'matches have')} a published rating, and ${num(scored)} of them have enough for a PWL rating.${scored ? html` The <a href="/shows/top-rated/">top-rated matches</a> list them, highest first.` : ''}</p>
<h3>How the PWL rating works</h3>
<p>${method}</p>
<ul class="rules">${providers.map(providerLine)}</ul>
${r.coverage?.scope ? html`<p class="section-note">${r.coverage.scope}</p>` : ''}
${r.coverage?.pwi ? html`<p class="section-note">${r.coverage.pwi}${r.coverage.pwiSource ? html` <a href="${r.coverage.pwiSource}" rel="noopener">PWI ratings</a>` : ''}</p>` : ''}
${r.coverage?.excluded ? html`<p class="section-note">${r.coverage.excluded}</p>` : ''}
</section>
<section class="section" aria-labelledby="sources-h">
<h2 id="sources-h">Sources</h2>
<p>Every show and every match or segment links at least one source, and people, reigns, storyline chapters and family links carry their own. Records cite ${plural(sources.length, 'site')}; these are the most cited.</p>
<div class="table-wrap"><table class="data data--compact">
<thead><tr><th scope="col">Source</th><th scope="col" class="num">Records citing it</th></tr></thead>
<tbody>${sources.slice(0, SHOWN_SOURCES).map(([h, n]) => html`<tr><td>${sourceLink(h)}</td><td class="num">${num(n)}</td></tr>`)}</tbody>
</table></div>
${citing.has(BULK) && !bulkOnly ? html`<p class="section-note">The Ringside Analytics dataset helped find shows and cards, but it is never the only source for a published show or match.</p>` : ''}
</section>
<section class="section" aria-labelledby="photos-h">
<h2 id="photos-h">Photos</h2>
<p>Wrestler photos will appear once free-licensed ones with credits are added. Promotion-owned photos, belt images and event posters are not used.</p>
</section>
</div>`;

  return {
    meta: {
      nav: 'about',
      title: 'Coverage and sources',
      description: `What the Pro Wrestling Lore archive covers: ${plural(site.shows.size, 'televised show')} from ${first.slice(0, 4)} to ${last.slice(0, 4)}, what counts as a record, how match ratings work and where every record comes from.`,
      path: '/about/',
      breadcrumbs: [{ name: 'Coverage and sources', url: '/about/' }],
    },
    body,
  };
}
