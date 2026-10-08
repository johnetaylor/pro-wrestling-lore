# Decisions

Decided = Blimper's call. Default = proposed in the rebuild plan and standing unless overturned. Open = still to settle.

| Decision | Choice | Status |
| --- | --- | --- |
| Women's divisions | Covered from the start, same pages and pipeline | Decided |
| What counts as TV | Everything that aired: flagship TV, B-shows, PPVs/PLEs, specials, streamed events, televised pre-shows | Decided |
| Images | Free-licensed only (Wikimedia Commons and similar) with credits; initials where none exist | Decided |
| Running cost | As close to $0 as possible: no database server, no paid functions | Decided |
| Repositories | Public `pro-wrestling-lore` (code, verified data); private `pro-wrestling-lore-research` (legacy export, raw sources, staging) | Decided |
| Site framework | Dependency-free: Node's standard library only (TypeScript through Node's type stripping, built-in `node:sqlite` at build time), no npm packages | Decided |
| Unconfirmed broadcasts | Held back and logged, never published or counted | Default |
| Visual identity | Keep the dark theme (#080c11), cyan accent (#5ce4df) and the wordmark; turn them into design tokens | Default |
| Data storage | JSON files in git, one per show (with its card), person, title, storyline and family; SQLite only during the build | Decided |
| Identity: shared and renamed characters | El Grande Americano is a ring name of Chad Gable (to July 6, 2025) and Ludwig Kaiser (from July 7, 2025); `rayo-americano` → Pete Dunne, `bravo-americano` → Tyler Bate | Decided |
| Identity: merged duplicates | Cruz Montana is Mike Santana ([POST Wrestling](https://www.postwrestling.com/2026/07/27/mike-santana-reveals-new-nxt-name-cruz-montana/)); EK Prosper is Eli Knight ([F4W](https://www.f4wonline.com/news/wwe-nxts-eli-knight-gets-new-in-ring-name)) | Decided |
| Title lineages | Reign names map to one title per lineage (e.g. the 2002 WWE Tag Team → Raw Tag Team → World Tag Team lineage); see `migration/v69/review-queue.json` for the rules | Default |
| Match pages | Matches live on show and wrestler pages; standalone pages only for notable matches | Default |
| URLs | `/wrestlers/<id>/`, `/shows/<promotion>/<series>/<date>/` (matches are `#m1`, `#m2` on the show page), `/shows/<promotion>/<series>/<year>/`, `/titles/<id>/` (reigns are `#r1`…), `/storylines/<id>/`, `/families/<id>/` | Default |
| Fonts | Barlow and Barlow Condensed (SIL OFL), subset to Latin and self-hosted; no third-party requests | Default |
| Structured data | BreadcrumbList on every page, Person on wrestler pages, WebSite on the home page. SportsEvent waits until shows have venues, since Google flags events without a location | Default |
| Inherited errors | Fixed before migrating, each with a reason and source (`scripts/migrate/v69/corrections.ts`); parity compares against v69 as corrected | Default |
| Ring names from billing | A name a person was billed under twice or more, that belongs to no one else and isn't a team name, becomes a ring name with its first and last billing dates; names billed once go to review | Default |
| The product | The interactive explorer from v69 (Careers timeline with the scrub bar, Statistics, Storylines by promotion, then Shows, Championships, Calendar and Dynasties) at parity; static pages are the version behind it for search engines and readers without scripts | Decided |
| Explorer pages | `/` and `/wrestlers/<id>/` open Careers, `/storylines/…` Storylines, `/shows/…` Shows (a show's page opens its card in the grid), `/titles/…` Championships, `/calendar/` the Calendar and `/families/…` Dynasties. Each is a small app shell plus the static record as a fallback. States go in the query string (`year`, `moment`, `from`, `to`, `view`, `promotion`, `period`, `chapter`, `reign`, `member`) | Default |
| Title-history trees | Ported from v69's explorer code into `scripts/migrate/v69/lineage-trees.ts` and written into `data/title-lineages.json`; belt pictures left out, as v69's were WWE images | Default |
| Explorer data | Content-addressed bundles under `/data/<hash>/`, cached forever: the timeline core (about 1.8 MB, 360 KB gzipped) up front; match details by year, profiles and storylines when first needed | Default |
| Explorer zoom | The visible range always fits the screen; the scrub bar, sideways scrolling and pinch zoom change the range (v69's horizontal-scroll month mode is a zoom level instead) | Default |
| Search | Own compact name index; no search service | Default |
| Growth | Promotion waves from the bulk dataset, plus full-career completion for featured wrestlers | Default |
| Weekly updates | A scheduled import drafts each new show as a pull request; a person approves | Default |
| Moderation | Edits are reviewed pull requests; no database | Default |
| Wave order | WWE gaps → WCW/ECW → AEW/TNA → beyond the bulk data | Open |
| Hosting | Chosen at launch; output is plain files | Open |
| Domain | Needed before launch | Open |
| Data and code license | Needed before launch | Open |
