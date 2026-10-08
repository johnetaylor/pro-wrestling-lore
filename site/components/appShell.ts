// The explorer's page shell: the container the app mounts into, with its controls, and the
// static version of the page for readers and crawlers that don't run scripts. The app reads its
// starting state from the data attributes; site/app/main.ts does the rest.
import { html, type Raw } from '../lib/html.ts';
import { STORY_PROMOTIONS } from '../appData.ts';

export interface AppShellOptions {
  view: 'careers' | 'storylines';
  /** Root-absolute folder of the data bundles, ending in a slash. */
  data: string;
  person?: string;
  story?: string;
  promotion?: string;
  /** Document title for the plain timeline, restored when a focus is cleared. */
  homeTitle: string;
  /** Static content shown when the app can't run. */
  fallback: Raw;
}

const STAR = html`<svg class="key-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"/></svg>`;

/** The key to the marks, shared by Careers and Storylines. */
export const legend = html`<ul class="legend" aria-label="Key to the timeline">
<li><i class="key key-match" aria-hidden="true"></i>Match</li>
<li><i class="key key-title" aria-hidden="true"></i>Title match</li>
<li>${STAR}Pay-per-view or premium live event</li>
<li><i class="key key-segment" aria-hidden="true"></i>Promo or appearance</li>
<li><i class="key key-involved" aria-hidden="true"></i>Involved, not competing</li>
<li><i class="key key-reign" aria-hidden="true"></i>Title reign</li>
</ul>`;

export function appShell(o: AppShellOptions): Raw {
  const careers = o.view === 'careers';
  const attrs = [['person', o.person], ['story', o.story], ['promotion', o.promotion]].filter(([, v]) => v).map(([k, v]) => html` data-${k}="${v}"`);
  return html`<div class="app" id="app" data-data="${o.data}" data-view="${o.view}" data-home-title="${o.homeTitle}"${attrs}>
<div class="app-tools" data-tools="careers"${careers ? '' : html` hidden`}>
<div class="mode-switch" role="group" aria-label="Show careers as">
<button type="button" data-mode="timeline" aria-pressed="true">Timeline</button>
<button type="button" data-mode="statistics" aria-pressed="false">Statistics</button>
</div>
<div class="filters">
<label class="f-search">Find a wrestler<input type="search" data-control="search" placeholder="Name, e.g. Randy Orton" autocomplete="off" spellcheck="false"></label>
<label data-for="timeline">Moments<select data-control="kind">
<option value="all">All moments</option>
<option value="match">Matches</option>
<option value="title">Title matches</option>
<option value="story">Promos and appearances</option>
<option value="promo">Promos and interviews</option>
<option value="appearance">Other appearances</option>
</select></label>
<label data-for="timeline">From<input type="date" data-control="from"></label>
<label data-for="timeline">To<input type="date" data-control="to"></label>
<label data-for="timeline">Month<select data-control="month"><option value="custom">Custom range</option></select></label>
<label data-for="statistics" hidden>Records<select data-control="records">
<option value="available">All available records</option>
<option value="career">Career totals</option>
<option value="archive">Indexed broadcasts</option>
</select></label>
<label data-for="statistics" hidden>Minimum matches<select data-control="minimum">
<option value="0">Any</option>
<option value="10">10</option>
<option value="25">25</option>
<option value="100">100</option>
<option value="500">500</option>
</select></label>
<label data-for="statistics" hidden>Results<select data-control="format">
<option value="counts">Counts</option>
<option value="percentages">Percentages</option>
</select></label>
</div>
</div>
<div class="app-tools" data-tools="storylines"${careers ? html` hidden` : ''}>
<div class="promo-tabs" role="group" aria-label="Storylines by promotion">${STORY_PROMOTIONS.map(
    (p) => html`<button type="button" data-promotion="${p.id}" aria-pressed="${p.id === (o.promotion ?? 'wwe')}" style="--c:${p.color}">${p.name}</button>`,
  )}</div>
<div class="filters">
<label data-brand-filter>Brand<select data-control="brand"><option value="all">All brands</option></select></label>
<label>Period<select data-control="period"><option value="all">Full history</option></select></label>
<label>Sort by start<select data-control="order"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
<label>Scale<select data-control="scale"><option value="overview">Overview</option><option value="months">Month by month</option></select></label>
</div>
</div>
<div class="app-key">${legend}</div>
<p class="app-status" data-status role="status">Loading the timeline…</p>
<div class="app-view" data-root="careers"${careers ? '' : html` hidden`}></div>
<div class="app-view" data-root="statistics" hidden></div>
<div class="app-view" data-root="storylines"${careers ? html` hidden` : ''}></div>
</div>
<div class="app-fallback" data-fallback>
${o.fallback}
</div>`;
}
