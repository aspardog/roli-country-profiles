# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
npm run lint         # ESLint on src/
npm run parse-data   # Regenerate public/data/roli.json from the WJP Excel workbook
npm run audit        # High-severity npm audit
```

No automated test suite exists. After any significant change, manually verify:
1. On-screen rendering in the browser
2. SVG export of the visible profile
3. Full-country PDF export

## Architecture

### Data flow

```
WJP Excel (.xlsx)
  → scripts/parse-roli-data.py   # Python; requires pandas + openpyxl
  → public/data/roli.json
  → src/hooks/useRoliData.js     # fetches once; year is read from JSON, never hardcoded
  → App.jsx state (region, selectedCode)
  → src/utils/filters.js         # pure helpers; no React or DOM dependency
  → CountryProfileChart.jsx      # on-screen React renderer
  → svgBuilder.js / exportSvg.js / exportPdf.js
```

### Two separate visual renderers

The screen chart (`CountryProfileChart.jsx`) and the export chart (`svgBuilder.js`) are **independent implementations**. `src/config/` is the shared semantic source of truth — both renderers iterate over it. When changing visual content or structure, update both. When changing layout details (positioning, spacing), replicate the change manually in both files.

### `src/config/` is the semantic source of truth

- `structure.js` — factor/subfactor hierarchy and region list
- `labels.js` — editorial display labels for factors and subfactors
- `colors.js` — factor color palette and font family constants. The 8 factor colors follow WJP's official publication convention and are semantically fixed — do not change them without coordinating with whoever produced prior charts, since readers recognize categories by color.

### JSON data shape

Each country record: `country`, `code`, `region`, `income`, `overall`, `f1`–`f8`, `sf11`–`sf87`.  
Top-level metadata: `year`, `sourceSheet`, `sourceFile`.

The parser always computes derived stats for the current release: `globalRank`, `globalTotal`, `regionalRank`, `regionalTotal`, `incomeRank`, `incomeTotal`. When a previous-year score sheet is available, it also fills `globalRankChange`, `scoreChange`, `pctChange`, and sets top-level payload metadata `previousYear`. `StatsCard.jsx` renders when `globalRank != null`; year-over-year fields remain `null` only if no prior score sheet can be resolved.

If the parser output shape changes, audit: `useRoliData.js`, `filters.js`, `CountryProfileChart.jsx`, `svgBuilder.js`, `StatsCard.jsx`.

### Key behavioral contracts

- Region change resets `selectedCode` to `REGIONAL_AVG_KEY` (avoids invalid state).
- PDF export always includes every country alphabetically, ignoring the active region filter — this is intentional.
- `svg2pdf.js` requires the SVG to be mounted in the DOM; `exportPdf.js` uses a temporary off-screen sandbox node for this.
- PDF libraries (`jspdf`, `svg2pdf.js`) are loaded lazily (dynamic import) to avoid penalizing the initial bundle.

## Updating the dataset

1. Place the new WJP Excel workbook in `data/`.
2. Run `npm run parse-data`. The parser will auto-compare against the previous score sheet in the same workbook when possible. Use an explicit override only if needed:
   ```bash
   python3 scripts/parse-roli-data.py --prev-input path/to/previous_year.xlsx
   # Or, to augment an already-parsed JSON without re-parsing the source Excel:
   python3 scripts/parse-roli-data.py \
       --base-json public/data/roli.json \
       --prev-input path/to/previous_year.xlsx
   ```
3. The parser writes to **two locations**: `data/roli.json` (version-controlled canonical) and `public/data/roli.json` (served by Vite at runtime). Both are overwritten on every run.
4. Verify `public/data/roli.json` (year, country count, score structure).
5. If WJP changed index structure (not just a new year), update `src/config/structure.js` and `src/config/labels.js`.
6. Manually validate UI, SVG export, and PDF export.

The parser auto-discovers the workbook and detects the latest `WJP ROL Index <YYYY> Scores` sheet by label scanning, not fixed row indices.

## Security constraints

- CSP is enforced via `vercel.json` — any new inline assets or external connections must be compatible with it.
- Avoid `eval`, `new Function`, and `dangerouslySetInnerHTML`.
- Do not introduce runtime dependencies on third-party domains.
- Fonts are self-hosted in `public/fonts/` (Inter Tight TTF). If fonts change, update `src/utils/fonts.js` and verify CSP in `vercel.json`.

## Deployment

Vercel static hosting. `vercel.json` configures the build command, SPA rewrite (all routes → `index.html`), security headers, and cache policy (`/assets/` is long-lived; `/data/` uses a shorter TTL).
