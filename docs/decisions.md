# Decisions

Decided = Blimper's call. Default = proposed in the rebuild plan and standing unless overturned. Open = still to settle.

| Decision | Choice | Status |
| --- | --- | --- |
| Women's divisions | Covered from the start, same pages and pipeline | Decided |
| What counts as TV | Everything that aired: flagship TV, B-shows, PPVs/PLEs, specials, streamed events, televised pre-shows | Decided |
| Images | Free-licensed only (Wikimedia Commons and similar) with credits; initials where none exist | Decided |
| Running cost | As close to $0 as possible: no database server, no paid functions | Decided |
| Repositories | Public `pro-wrestling-lore` (code, verified data); private `pro-wrestling-lore-research` (legacy export, raw sources, staging) | Decided |
| Unconfirmed broadcasts | Held back and logged, never published or counted | Default |
| Visual identity | Keep the dark theme (#080c11), cyan accent (#5ce4df) and the wordmark; turn them into design tokens | Default |
| Data storage | JSON files in git, one per show (with its card) and one per person; SQLite only during the build | Default |
| Match pages | Matches live on show and wrestler pages; standalone pages only for notable matches | Default |
| Search | Own compact name index; no search service | Default |
| Growth | Promotion waves from the bulk dataset, plus full-career completion for featured wrestlers | Default |
| Weekly updates | A scheduled import drafts each new show as a pull request; a person approves | Default |
| Moderation | Edits are reviewed pull requests; no database | Default |
| Site framework | Astro, or a dependency-free generator on Node's standard library | Open |
| Wave order | WWE gaps → WCW/ECW → AEW/TNA → beyond the bulk data | Open |
| Hosting | Chosen at launch; output is plain files | Open |
| Domain | Needed before launch | Open |
| Data and code license | Needed before launch | Open |
