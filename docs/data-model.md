# Data model

All site data lives in `data/` as JSON, one file per record, so every change is a small, reviewable diff. Types are defined in `scripts/lib/types.ts`; `npm run validate` checks every rule below.

## Layout

| Path | Record | ID |
| --- | --- | --- |
| `data/promotions.json` | Promotion registry | `wwe`, `wcw`, `aew` … |
| `data/series.json` | Show series registry | `<promotion>/<slug>`, e.g. `wwe/raw`, `wcw/nitro` |
| `data/people/<id>.json` | One person | slug of the name they are best known by, e.g. `hulk-hogan` |
| `data/shows/<promotion>/<series>/<year>/<date>.json` | One show with its full card | `<series>/<date>`, e.g. `wwe/raw/1997-03-10` |
| `data/titles/<id>.json` | One championship lineage with all its reigns | e.g. `wwe-championship` |
| `data/title-lineages.json` | How lineages split, merge and rename (diagram data) | lineage keys link to title ids |
| `data/storylines/<promotion>/<id>.json` | One storyline with its chapters | slug |
| `data/families/<id>.json` | One family tree | slug |
| `data/calendar/<year>.json` | Upcoming and recent events | — |
| `data/ratings.json` | Rating method and providers | — |
| `data/reports/v69/` | Import and coverage reports from the legacy site (provenance) | — |

## References

- A segment is referenced as `<show id>#<key>`, e.g. `wwe/raw/1997-03-10#m1`. Keys are `m1, m2…` for matches and `s1, s2…` for other segments. A key is never renumbered; new segments take the next free number, and `order` holds the running order when a source gives it.
- A reign is referenced as `<title id>#r<n>`; a chapter as `<storyline id>#c<n>`.
- People are referenced by ID everywhere. A segment lists `participants` (person, role `competitor` or `involved`, optional `outcome`) and, separately, `billing`: the names exactly as billed, teams included.

## People and names

- One ID per human. A character played by more than one person (El Grande Americano) is a **ring name**, not a person.
- `ringNames` lists every name with documented `from`/`to` boundaries where known. `billed.first` / `billed.last` record the first and last show where that person alone was billed under the name; this is evidence, not a boundary.
- `gender` carries `genderBasis: legacy-placeholder` until confirmed from a source, or `division` when it comes from the division of a title the person held.
- A past champion the archive had no record of becomes a person when a title history is imported, with the printed name as a ring name. A name that isn't exactly one person's goes to review instead of being matched on a near miss.
- `externalTotals` are career totals from another database (CAGEMATCH), never computed from our records. Our own totals are always labeled as indexed records.
- A ring name with `note: "Billed under this name in indexed matches."` was added from billing evidence: billed at least twice, nobody else's name, and not a team name on that card.
- `curated` holds the full career standard (Hulk Hogan and Cody Rhodes so far): `promotionPeriods`, `relationships` (feuds, factions, teams), `signatureMatches` (with segment references) and `profile` (intro, career in brief, trainers, signature moves, managers and guest cornermen, profile links). `legacyHtml` keeps the v69 explorer text for reference only; pages use the structured fields.

## Shows and coverage

- A show is one broadcast. Its `date` is the air date when known (`dateBasis: aired`); otherwise the taping date (`dateBasis: recorded`, shown as "Recorded").
- `coverage.card`: `indexed` (card with linked people), `unlinked` (card listed, names not yet linked to people), `listed` (show known, card not indexed), `career-only` (known only from career records).
- `coverage.segments`: `reviewed-partial`, `not-indexed` or `unknown`. No show claims complete promo and appearance coverage.
- Only confirmed broadcast material is published. Held-back rows stay in the private research repo.

## Storylines

- A storyline is a promotion's story told through dated chapters. `start` is the first researched milestone and `end` the last; a storyline without `end` is still going and is drawn through the archive date. Neither is a definitive start or end of the feud.
- A chapter's `kind` is `match`, `title` (a championship match) or `story` (a promo, angle or appearance). `segment` links it to the archived match or segment when there is one; `showCategory` records a source's pay-per-view label.
- `source` is the storyline's overall reference, when it has one; every chapter carries its own `sources`.

## Championships

- A title record is one lineage: every recognized reign from the first champion on, under all the names the title has carried. `eras` lists those names with the date each began; `names` keeps every other name it has been written as.
- `promotion`, `division` (`men`, `women`, `mixed`) and `format` (`singles`, `tag`, `trios`) describe the title; `established` and `retired` bound it. A title retired and later revived has no `retired`.
- `history` holds dated events in the title's own story (unifications, splits, brand and owner changes, deactivations and revivals), each with its source.
- How titles connect is in `data/title-lineages.json`: v69's hand-drawn trees for the main WWE titles, and `links`, one dated record per connection, each with its sources. A link's `kind` is `merge` (the `from` titles were unified into `to` and ended), `succeed` (`to` is a new title that took the place of `from`) or `shared` (held together as one for a time, both records kept). The explorer draws a title's tree from its links when it has no hand-drawn one, and a title unified into or replaced by another, with no reign after that, is retired on the link's date.
- A reign's `holder` is the champion as the source prints it, a team's name for teams; `people` links the holders who are people in the archive, and `unlinked` keeps printed names that aren't (an unnamed masked team, or a name with two candidates waiting for review).
- `number` is the source's overall reign number. `kind` marks an `interim` or `unrecognized` reign, which runs beside the lineal one and doesn't end it. `days` is the length the source prints; when it disagrees with the dates by more than a day, `dateNote` says so and why.
- A reign ends where the next change of the same lineage begins (a new champion, a vacancy, a retirement or a unification), or where the source's own count of days says it did.
- Reigns are title changes the promotion recognizes, wherever they happened, house shows and other promotions' events included. The match behind a change is archived only if it aired.

## Sources

Every show and every segment has at least one source URL; people, reigns and chapters carry theirs. A bulk dataset is never the only source for a published match.

## Legacy fields

Records migrated from v69 keep `legacyId(s)` and a `legacy` object with fields that have no home in the model yet. `migration/v69/legacy-ids.json` maps every v69 ID to its new record, and `migration/v69/review-queue.json` lists the open questions from migration.
