# Reference snapshot: v69

A frozen copy of everything the legacy site loaded in the browser as of October 7, 2026 (published version 69, source commit `66cbe26`). Phase 1 migrates from this file, and parity checks compare the new data against it. Do not edit it.

| File | Contents |
| --- | --- |
| `snapshot.json.gz` | `data`: the merged `window.ATLAS` object; `rendered`: curated content that only existed as render functions (Cody and Hogan explorers, rivalry markup, show series); `meta`: script run log |
| `snapshot-meta.json` | SHA-256 of the snapshot JSON (`8c926656…53e93`), per-script results, top-level counts |
| `AUDIT.md`, `audit.json` | Findings: identity collisions, likely duplicate matches, coverage gaps, title-name variants, logic to re-implement |

The snapshot was produced in the private research repo (`npm run snapshot`) by running all 38 site scripts in their published order, skipping only the render-only `app.js`. It passes 15 of 15 checks against the export's own import reports, and a second capture is byte-identical.
