# Pro Wrestling Lore

A visual archive of pro wrestling history: every televised match and segment, with careers, title lineages, storylines and wrestling families shown as pictures first and the facts underneath.

**Status:** rebuild in progress. Phase 0 (reference snapshot and audit) and Phase 1 (data model and migration) are done; Phase 2 (site shell and design system) is next. The current site is at <https://wrestling-atlas.johnetaylor667212.chatgpt.site>.

## Scope

- **In:** everything that aired — weekly TV (flagship shows and B-shows), PPVs/PLEs, TV specials, streamed events and televised pre-shows; matches, promos, interviews, angles and appearances; men's, women's and mixed.
- **Out:** dark matches, house shows, untelevised tournament rounds, and anything taped but never aired.
- Every record cites a source. Rows whose airing can't be confirmed are held back, never published or counted.

## Layout

| Path | What it holds |
| --- | --- |
| `data/` | The archive: one JSON file per person, show, title, storyline and family ([data model](docs/data-model.md)) |
| `migration/v69/` | Legacy ID map, review queue, migration log and parity report |
| `reference/v69/` | Frozen snapshot of the legacy site's data, plus the audit report |
| `scripts/` | Migration, validation and parity scripts |
| `docs/` | [Decisions](docs/decisions.md) and the [data model](docs/data-model.md) |

## Running

Node 22.18 or later; there are no dependencies.

```sh
npm run check             # validate data/ and check parity with the v69 reference
npm run migrate:v69       # rebuild data/ from the reference (until Phase 1 data is edited by hand)
npm run audit:reference   # regenerate reference/v69/AUDIT.md and audit.json
```

Raw sources, staging data and the legacy export live in a private research repository.
