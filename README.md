# Rule of Law Index — Country Profiles

Static dashboard and export pipeline for **World Justice Project Rule of Law Index**
country profiles.

This repository has two responsibilities:

1. Parse the WJP Excel workbook into a stable JSON artifact
2. Render and export country profiles from that JSON in the browser

The app is optimized for annual data refreshes, predictable static deployment,
and consistent SVG/PDF output rather than for multi-user analytics or a backend workflow.

## Current Dataset

- Year: `2025`
- Previous year used for comparison: `2024`
- Countries: `143`
- Runtime payload: `public/data/roli.json`
- Versioned source-of-truth artifact: `data/roli.json`

The runtime payload currently includes:

- top-level metadata
- country records
- precomputed global averages
- precomputed regional averages
- year-over-year derived stats

## What the Application Does

- Browse one country profile at a time
- Filter countries by region
- View a precomputed global or regional average profile
- Display ranking and year-over-year change metrics for real countries
- Export the currently visible profile as SVG
- Export a multi-page PDF containing every country in alphabetical order

## Product Rules That Matter

- The visible year comes from the JSON payload, not from hardcoded UI text.
- When the region changes, the selected profile resets to the regional average.
- Global/regional average views come from `averages` in the JSON, not from frontend recomputation.
- The PDF export always includes every country, regardless of the active region filter.
- The PDF export intentionally excludes synthetic average profiles.
- The React chart and the SVG export are separate renderers and must stay in sync manually.

## Technology Stack

### Frontend

- `React 18`
- `Vite 5`
- `PropTypes`

### Export

- `jsPDF`
- `svg2pdf.js`
- self-hosted `Inter Tight` font files

### Data Pipeline

- `Python 3.14`
- `uv`
- `pandas`
- `openpyxl`

## Repository Structure

```text
roli-country-profiles/
├── .claude/
│   ├── CONTEXT.md
│   └── settings.json
├── data/
│   └── roli.json
├── public/
│   ├── data/
│   │   └── roli.json
│   └── fonts/
│       ├── InterTight-Bold.ttf
│       ├── InterTight-Regular.ttf
│       └── InterTight-SemiBold.ttf
├── scripts/
│   └── parse-roli-data.py
├── src/
│   ├── components/
│   ├── config/
│   ├── hooks/
│   ├── utils/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .gitignore
├── .npmrc
├── .nvmrc
├── .python-version
├── package.json
├── pyproject.toml
├── SECURITY.md
├── uv.lock
├── vercel.json
└── vite.config.js
```

## Architecture Overview

### End-to-end flow

```text
WJP Excel workbook
  -> scripts/parse-roli-data.py
  -> data/roli.json
  -> public/data/roli.json
  -> useRoliData()
  -> App.jsx
  -> resolveSelection()
  -> CountryProfileChart.jsx
  -> exportSvg.js / exportPdf.js
```

### Separation of concerns

- `src/config/`
  Semantic source of truth for factors, regions, labels, and colors

- `src/hooks/useRoliData.js`
  Runtime fetch/load boundary for the JSON payload

- `src/utils/filters.js`
  Pure selection helpers

- `src/components/CountryProfileChart.jsx`
  On-screen renderer

- `src/utils/svgBuilder.js`
  Export renderer

- `scripts/parse-roli-data.py`
  Data-ingestion and derivation layer

## Data Contract

The frontend assumes the parser outputs this top-level shape:

```json
{
  "year": 2025,
  "previousYear": 2024,
  "sourceSheet": "WJP ROL Index 2025 Scores",
  "sourceFile": "2025_wjp_rule_of_law_index_HISTORICAL_DATA_FILE.xlsx",
  "averages": {
    "global": {},
    "regional": {}
  },
  "countries": []
}
```

### `averages`

The `averages` object must contain:

- `global`
- `regional`

`regional` is keyed by the exact region labels present in the source data.

These average profiles contain:

- `overall`
- `f1..f8`
- `sf11..sf87`

They do not carry ranking/change fields.

### Country records

Each country record includes:

- identifiers:
  - `country`
  - `code`
  - `region`
  - `income`
- score metrics:
  - `overall`
  - `f1..f8`
  - `sf11..sf87`
- derived rank fields:
  - `globalRank`, `globalTotal`
  - `regionalRank`, `regionalTotal`
  - `incomeRank`, `incomeTotal`
- derived comparison fields:
  - `globalRankChange`
  - `scoreChange`
  - `pctChange`

If the data contract changes, review at minimum:

- `src/hooks/useRoliData.js`
- `src/utils/filters.js`
- `src/components/StatsCard.jsx`
- `src/components/CountryProfileChart.jsx`
- `src/utils/svgBuilder.js`

## Setup

### Prerequisites

- `nvm` or equivalent Node version manager
- `Node.js 24.12.0`
- `npm 11.6.2`
- `uv`

### Install dependencies

```bash
nvm use
npm ci
UV_CACHE_DIR=.uv-cache uv sync
```

### Why both package managers exist

- `npm` manages the frontend and build toolchain
- `uv` manages the Python parser environment

Do not mix Python environment management back into ad hoc `pip install` workflow unless you are intentionally debugging outside the locked setup.

## Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the production app into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint the frontend source tree |
| `npm run parse-data` | Regenerate both JSON outputs from the WJP workbook |
| `npm run audit` | Run `npm audit` at high severity threshold |
| `npm run audit:fix` | Apply automatic npm audit fixes when possible |

## Local Development

### Start the dev server

```bash
npm run dev
```

By default the app loads:

- `public/data/roli.json`
- self-hosted fonts from `public/fonts/`

### Build for production

```bash
npm run build
```

### Preview production output

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Data Refresh Workflow

The parser at [`scripts/parse-roli-data.py`](./scripts/parse-roli-data.py) is designed to survive normal annual WJP releases without hardcoded row indices.

### What the parser does

- auto-discovers the workbook in `data/`
- finds the latest `WJP ROL Index <YYYY> Scores` sheet
- finds the most recent strictly older score sheet for comparison when available
- detects rows by labels instead of fixed row numbers
- parses metadata, factors, and subfactors
- computes per-country rank/change fields
- computes prebuilt global and regional average profiles
- writes:
  - `data/roli.json`
  - `public/data/roli.json`

### Standard update procedure

1. Place the latest WJP Excel workbook under `data/`
2. Run:

```bash
npm run parse-data
```

3. Inspect the generated JSON artifacts
4. Run:

```bash
npm run lint
npm run build
```

5. Manually validate:
   - year label
   - region filter behavior
   - global/regional average views
   - SVG export
   - PDF export

## Export System

### SVG export

- Implemented in `src/utils/exportSvg.js`
- Uses `src/utils/svgBuilder.js`
- Exports only the currently visible profile
- Sanitizes filenames before triggering download
- Uses `Blob` + `URL.createObjectURL`

### PDF export

- Implemented in `src/utils/exportPdf.js`
- Builds one page per country
- Always uses the full alphabetical country list
- Loads PDF dependencies lazily
- Registers local `Inter Tight` TTF files in jsPDF
- Mounts each generated SVG in an off-screen sandbox because `svg2pdf.js` needs DOM presence for style resolution

## Styling and UI Conventions

- Most component styling is inline
- Shared tokens live in `src/config/colors.js`
- Global document styles live in `src/index.css`
- Typography is intentionally restricted to a single self-hosted family
- The UI uses an editorial layout rather than a general-purpose admin dashboard pattern

## Deployment

The repository is configured for static hosting on Vercel.

### Current deployment behavior

- build command: `npm run build`
- output directory: `dist`
- SPA rewrite: all paths rewrite to `index.html`

### Cache behavior

- `/assets/*`
  long-lived immutable cache

- `/data/*`
  shorter cache with `stale-while-revalidate`

That split is intentional: code/assets change rarely, data may refresh more often.

## Security Summary

The app is designed to be a low-complexity static frontend.

Current security properties:

- no backend
- no authentication
- no secret management at runtime
- no cookies
- no local storage
- no third-party runtime API calls
- CSP and security headers are defined in `vercel.json`

Current security status:

- `npm audit` is currently clean at the configured high-severity threshold
- the repo has already been remediated to `jspdf 4.2.1` and `vite 8.0.13`

Full details live in [SECURITY.md](./SECURITY.md).

## Maintenance Notes

### High-risk change areas

- `src/config/structure.js`
  Changes the semantic shape of the chart

- `src/utils/svgBuilder.js`
  Can desynchronize exports from on-screen rendering

- `scripts/parse-roli-data.py`
  Controls the contract the entire UI depends on

- `vercel.json`
  Controls CSP, headers, and cache policies

### There is no test suite

This repo currently depends on:

- parser execution
- lint
- production build
- manual verification of UI/export behavior

For anything touching data shape, rendering, or export, assume manual regression testing is required.

## Repository Hygiene

Ignored locally:

- `node_modules/`
- `dist/`
- `.venv/`
- `.uv-cache/`
- local `.env*`
- raw `.xlsx` inputs
- `.claude/settings.local.json`

Versioned intentionally:

- parsed JSON outputs
- Vercel config
- Python lockfile
- npm lockfile
- self-hosted fonts

## License and Data Use

This repository is intended for editorial, institutional, or research workflows.
The underlying Rule of Law Index dataset remains the property of the
**World Justice Project**. Confirm any licensing, redistribution, or attribution
requirements that apply to the source data before republishing derivative outputs.
