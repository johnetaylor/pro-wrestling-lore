# Pro Wrestling Lore

A visual archive of pro wrestling history: every televised match and segment, with careers, title lineages, storylines and wrestling families shown as pictures first and the facts underneath.

**Status:** rebuild in progress. Phase 0 (reference snapshot and audit) and Phase 1 (data model and migration) are done. Phase 2 (site generator, design system and SEO base) is built and in design review. The current site is at <https://wrestling-atlas.johnetaylor667212.chatgpt.site>.

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
| `site/` | The static site generator: pages, components, styles, client scripts and assets |
| `docs/` | [Decisions](docs/decisions.md) and the [data model](docs/data-model.md) |

## Running

Node 22.18 or later; there are no dependencies.

```sh
npm run check             # validate data/ and check parity with the v69 reference
npm run migrate:v69       # rebuild data/ from the reference (until Phase 1 data is edited by hand)
npm run audit:reference   # regenerate reference/v69/AUDIT.md and audit.json

npm run build             # build the site into dist/ (preview mode: noindex, robots blocked)
npm run check:site        # every internal link, asset and #anchor resolves; titles, h1s, descriptions
npm run serve             # serve dist/ at http://localhost:4321/
SITE_URL=https://example.org npm run build -- --production   # canonical URLs, sitemaps, robots
```

`npm run typecheck` needs TypeScript 5.8 or later and `@types/node` installed globally or with `npx`; the site and scripts run without them.

## The site

Every page is a static HTML file built from `data/`. A wrestler page leads with the career strip: title reigns, every indexed match and segment as a dot, and runs in each promotion, on one time axis. Shows list their card in running order with linked names; championships show every reign on a single line. Search runs in the browser from a small index built with the site.

The design keeps the v69 navy and cyan and the wordmark, sets everything in Barlow (Barlow Condensed for names and headings), and uses color only for meaning: gold for championships and pay-per-views, violet for promos and appearances, and one color per promotion. Fonts are self-hosted, so pages make no third-party requests.

Raw sources, staging data and the legacy export live in a private research repository.
