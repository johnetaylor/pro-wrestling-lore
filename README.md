# Pro Wrestling Lore

A visual archive of pro wrestling history: every televised match and segment, with careers, title lineages, storylines and wrestling families shown as pictures first and the facts underneath.

**Status:** rebuild in progress. Phase 0 (reference snapshot and audit) is done; Phase 1 (data model and migration) is next. The current site is at <https://wrestling-atlas.johnetaylor667212.chatgpt.site>.

## Scope

- **In:** everything that aired — weekly TV (flagship shows and B-shows), PPVs/PLEs, TV specials, streamed events and televised pre-shows; matches, promos, interviews, angles and appearances; men's, women's and mixed.
- **Out:** dark matches, house shows, untelevised tournament rounds, and anything taped but never aired.
- Every record cites a source. Rows whose airing can't be confirmed are held back, never published or counted.

## Layout

| Path | What it holds |
| --- | --- |
| `reference/v69/` | Frozen snapshot of the legacy site's data, plus the audit report |
| `scripts/` | Data scripts |
| `docs/decisions.md` | Decisions and their status |

## Running

Node 22.18 or later; there are no dependencies yet.

```sh
npm run audit:reference   # regenerate reference/v69/AUDIT.md and audit.json
```

Raw sources, staging data and the legacy export live in a private research repository.
