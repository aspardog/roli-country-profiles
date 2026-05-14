# Rule of Law Index — Country Profiles

Interactive country-profile dashboard for the **World Justice Project Rule of Law Index**. The application renders one country or one synthetic average profile at a time, supports regional filtering, exports the visible profile as SVG, and generates a multi-page PDF with **all countries in the dataset**.

The current dataset bundled in the repo is:

- **Year:** 2025
- **Countries:** 143
- **Runtime source:** `public/data/roli.json`

## What the app does

- Browse Rule of Law Index country profiles across 8 factors and their subfactors
- Filter the country list by region
- View a country profile or a computed regional/global average
- Export the currently visible profile as SVG
- Export a complete alphabetical PDF reference with one page per country
- Keep the displayed year in sync with the parsed data payload rather than hardcoding it in the UI

## Product behavior that matters

- The **country selector is region-aware**. When the region changes, the app resets selection to the regional average to avoid invalid state.
- The **SVG export matches the profile currently shown on screen**.
- The **PDF export ignores the active region filter on purpose**. It always contains every country in the dataset, sorted alphabetically, and excludes synthetic averages.
- The **year displayed in the UI comes from the JSON payload**. Updating the data file is enough to move the application to a new release year.

## Tech stack

- `React 18`
- `Vite 5`
- `jsPDF`
- `svg2pdf.js`
- self-hosted `Inter Tight` for both UI and PDF output

## Project structure

```text
roli-country-profiles/
├── public/
│   ├── data/
│   │   └── roli.json
│   └── fonts/
│       ├── InterTight-Regular.ttf
│       ├── InterTight-SemiBold.ttf
│       └── InterTight-Bold.ttf
├── scripts/
│   └── parse-roli-data.py
├── src/
│   ├── components/
│   │   ├── ControlPanel.jsx
│   │   ├── CountryProfileChart.jsx
│   │   ├── ErrorBoundary.jsx
│   │   └── index.js
│   ├── config/
│   │   ├── colors.js
│   │   ├── index.js
│   │   ├── labels.js
│   │   └── structure.js
│   ├── hooks/
│   │   └── useRoliData.js
│   ├── utils/
│   │   ├── exportPdf.js
│   │   ├── exportSvg.js
│   │   ├── filters.js
│   │   ├── fonts.js
│   │   └── svgBuilder.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── SECURITY.md
├── package.json
├── vercel.json
└── vite.config.js
```

## Architecture overview

### Data flow

```text
WJP Excel workbook
  -> scripts/parse-roli-data.py
  -> public/data/roli.json
  -> useRoliData()
  -> App state
  -> filters.js
  -> CountryProfileChart.jsx
  -> exportSvg.js / exportPdf.js
```

### Separation of concerns

- `src/config/` is the semantic source of truth for factor structure, region labels, chart colors, and display labels.
- `src/utils/filters.js` contains pure data helpers with no React or DOM dependency.
- `src/components/CountryProfileChart.jsx` renders the on-screen chart in React.
- `src/utils/svgBuilder.js` renders a standalone SVG for export.

That split is intentional: the screen chart and exported chart are **separate renderers**. If you change visual layout details, you may need to update both.

## Data model

The parsed JSON payload contains:

- top-level metadata: `year`, `sourceSheet`, `sourceFile`
- `countries`: an array of country records

Each country record includes:

- identifiers: `country`, `code`, `region`, `income`
- summary score: `overall`
- factors: `f1` through `f8`
- subfactors: `sf11` through `sf87`

The app assumes those keys exist. If the parser output changes shape, review:

- `src/hooks/useRoliData.js`
- `src/utils/filters.js`
- `src/components/CountryProfileChart.jsx`
- `src/utils/svgBuilder.js`

## Getting started

### Prerequisites

- `Node.js 18+`
- `npm`
- `Python 3` only if you need to regenerate the dataset

### Install

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

Vite serves the app locally. In this project, `vite.config.js` uses `base: './'` and splits the PDF export dependencies into a separate `pdf-export` chunk so they only load when needed.

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on `src/` |
| `npm run parse-data` | Parse the latest WJP Excel workbook into JSON |
| `npm run audit` | Run a high-severity npm audit |
| `npm run audit:fix` | Apply npm audit fixes where possible |

## Updating the data

The repo includes a parser at `scripts/parse-roli-data.py` that converts the WJP Excel workbook into the JSON shape consumed by the frontend.

### What the parser does

- auto-discovers the input workbook in `data/`
- finds the most recent sheet matching `WJP ROL Index <YYYY> Scores`
- detects indicator rows by scanning labels instead of relying on fixed row numbers
- writes:
  - `data/roli.json`
  - `public/data/roli.json`

### Expected workflow

1. Place the latest WJP Excel workbook in `data/`
2. Run:

```bash
npm run parse-data
```

3. Verify the generated `public/data/roli.json`
4. Run the app and confirm the year, region filters, SVG export, and PDF export still behave correctly

### Parser dependencies

The parser requires `pandas` and `openpyxl`. If they are not available in your Python environment:

```bash
pip install pandas openpyxl
```

### When a new WJP release may require code changes

If WJP changes the structure of the index rather than just publishing a new year, you may need to update:

- `src/config/structure.js`
- `src/config/labels.js`
- `src/config/colors.js` if visual semantics change

## Export system

### SVG export

- Implemented in `src/utils/exportSvg.js`
- Uses the standalone SVG renderer from `src/utils/svgBuilder.js`
- Sanitizes filenames before download
- Produces the currently visible profile only

### PDF export

- Implemented in `src/utils/exportPdf.js`
- Builds one SVG per country, then converts each page through `jsPDF` + `svg2pdf.js`
- Loads PDF libraries lazily to avoid penalizing the initial bundle
- Registers Inter Tight `.ttf` font files from `public/fonts/`
- Adds page numbering after all pages are rendered

One implementation detail matters: `svg2pdf.js` needs the SVG mounted in the DOM to resolve computed styles, so the export code creates an off-screen sandbox node temporarily during rendering.

## Styling approach

- Inline styles are used throughout the app
- Shared visual constants live in `src/config/colors.js`
- Global document-level styles live in `src/index.css`
- The interface uses a restrained editorial style with a light paper-texture background and a single typeface

## Security and deployment

The application is designed for static deployment and includes a locked-down baseline configuration.

- `vercel.json` sets the build command, SPA rewrites, response headers, and cache behavior
- The Content Security Policy allows only self-hosted runtime connections and tightly scoped asset sources
- There is no backend, no authentication, no local storage, and no analytics by default

Security details are documented in [SECURITY.md](./SECURITY.md).

## Deployment model

The repo is configured for Vercel static hosting:

- build command: `npm run build`
- output directory: `dist`
- SPA rewrite: all routes resolve to `index.html`

Static assets under `/assets/` are cacheable long term, while `/data/` receives a shorter cache policy to make data refreshes easier.

## Maintenance notes

- There is currently **no automated test suite**.
- If you change chart layout, validate both:
  - on-screen rendering in `CountryProfileChart.jsx`
  - exported rendering in `svgBuilder.js`
- If you change fonts, also validate:
  - `src/utils/fonts.js`
  - the generated PDF output
  - CSP compatibility in `vercel.json`
- If you change data shape, treat `src/config/` and `src/utils/filters.js` as high-risk areas.

## Known limitations

- The app depends on the WJP workbook using recognizable sheet names and row labels.
- The screen chart and export chart can drift visually if only one renderer is edited.
- The codebase prioritizes simplicity and static deployment over a larger abstraction layer or design system.

## Repository purpose

This project is best understood as a static publishing tool for country profile visuals rather than a general-purpose analytics platform. The code is optimized around:

- predictable rendering
- consistent exports
- low operational complexity
- easy annual data refreshes

## License and data

This repository is intended for research, editorial, or institutional publishing workflows. The Rule of Law Index data remains the property of the **World Justice Project**. Review any distribution requirements for the underlying dataset before republishing derived outputs.
