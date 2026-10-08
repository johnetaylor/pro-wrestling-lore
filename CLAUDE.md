# Working on Pro Wrestling Lore

- Read `docs/decisions.md` before changing scope, data format, stack or hosting, and `docs/data-model.md` before touching `data/`.
- Run `npm run check` after any change to `data/` or the scripts; it must stay at zero errors and full parity.
- **Data rules:** televised only; no dark matches or house shows; every record has a source; held-back rows are never published or counted; totals are labeled as indexed records, never lifetime records.
- **Identity:** one ID per person; ring names map to people by date range; never merge identities on a fuzzy alias match — ambiguous cases go to review.
- **Reference:** `reference/v69/` is frozen. Never edit `snapshot.json.gz`; migrations read from it and parity checks compare against it.
- **Runtime:** no server rendering and no runtime database. Pages are static files.
- **Private material:** raw third-party dumps, staging rows, held-back rows and WWE-sourced images belong in the private research repo, never here.
- Node 22.18+. Prefer the standard library over new dependencies.
