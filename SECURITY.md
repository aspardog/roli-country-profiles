# Security

This document describes the security posture of the `roli-country-profiles`
repository as it exists today.

The project is a static frontend plus an offline parser. There is no backend,
no authentication layer, no session handling, and no server-side code in this
repository.

## Scope

This document covers:

- browser-side behavior of the production app
- deployment headers and CSP configured in `vercel.json`
- dependency-management practices for JavaScript and Python
- current known security gaps and operational limits

This document does not claim formal compliance or third-party audit status.

## Architecture Summary

The application has two main parts:

1. A static `React + Vite` frontend served from `dist/`
2. A local parser in `scripts/parse-roli-data.py` that converts the WJP Excel
   workbook into versioned JSON artifacts

Key implications:

- no credentials are required at runtime
- no database exists
- no user-generated content is stored
- the app fetches only its own static JSON payload at runtime

## Runtime Data Exposure

The app serves public static data only:

- `public/data/roli.json`
- self-hosted font files under `public/fonts/`

The runtime does not use:

- cookies
- `localStorage`
- `sessionStorage`
- analytics SDKs
- third-party API requests
- WebSockets

Because the app is static, the primary risks are:

- client-side script injection
- dependency vulnerabilities
- accidental CSP regression
- export-related injection through filenames or SVG/PDF rendering

## HTTP Security Headers

Production headers are defined in [`vercel.json`](./vercel.json).

Current configured headers:

| Header | Value | Purpose |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents iframe embedding / clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Legacy browser XSS filter hint |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables sensitive browser features and interest-cohort |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS on supported browsers |

## Content Security Policy

The production CSP is:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob:;
connect-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self'
```

### Practical interpretation

- `script-src 'self'`
  Only first-party scripts are allowed. No `unsafe-eval`. No third-party script hosts.

- `style-src 'self' 'unsafe-inline'`
  Inline styles are currently required because the UI relies heavily on React inline style objects.

- `font-src 'self' data:`
  Fonts are self-hosted and PDF font registration may use in-memory/base64 content.

- `img-src 'self' data: blob:`
  Needed for SVG downloads, in-memory blobs, and inline data-URI assets.

- `connect-src 'self'`
  The runtime may fetch only same-origin resources such as `/data/roli.json`.

- `object-src 'none'`
  Disables plugins and legacy active content.

- `frame-ancestors 'none'`
  Prevents embedding the app in an iframe.

### CSP limitations

The current CSP intentionally allows `'unsafe-inline'` in `style-src`.
That is the main deliberate relaxation in the browser policy today.

This is acceptable for the current architecture because:

- the app does not render arbitrary HTML
- there is no user-supplied style input path
- the codebase does not use `dangerouslySetInnerHTML`

If the styling model is refactored away from inline styles, this should be
revisited.

## Secure Coding Constraints

The current codebase avoids several high-risk browser patterns:

- no `dangerouslySetInnerHTML`
- no `eval()`
- no `new Function()`
- no direct cookie handling
- no storage of secrets in browser code

Additional implementation details:

- download filenames are sanitized in:
  - [`src/utils/exportSvg.js`](./src/utils/exportSvg.js)
  - [`src/utils/exportPdf.js`](./src/utils/exportPdf.js)
- SVG export is generated locally with DOM APIs and serialized client-side
- PDF export is generated client-side through `jspdf` and `svg2pdf.js`

## Dependency Management

### JavaScript

JavaScript dependencies are managed through:

- [`package.json`](./package.json)
- [`package-lock.json`](./package-lock.json)
- [`.npmrc`](./.npmrc)

Current controls:

- pinned package manager: `npm@11.6.2`
- pinned runtime expectations via `engines`
- `engine-strict=true`
- `save-exact=true`
- `npm overrides` for known transitive hotspots:
  - `nth-check`
  - `postcss`
  - `serialize-javascript`

### Python

Python dependencies are managed through:

- [`pyproject.toml`](./pyproject.toml)
- [`uv.lock`](./uv.lock)
- [`.python-version`](./.python-version)

Operational notes:

- Python dependency execution should go through `uv`
- the repo uses `UV_CACHE_DIR=.uv-cache` to avoid reliance on machine-global cache state
- parser dependencies should not be installed ad hoc with `pip` inside the repo workflow

## Current Audit Status

The repository was remediated to current major versions of the affected packages:

- `jspdf` -> `4.2.1`
- `vite` -> `8.0.13`
- `@vitejs/plugin-react` -> `6.0.2`

After that upgrade, `npm audit --audit-level=high` returns:

```text
found 0 vulnerabilities
```

### Ongoing expectation

This should be treated as a point-in-time clean audit result, not a permanent guarantee.
Any future dependency update should be followed by:

```bash
npm run audit
```

## Deployment and Cache Controls

The deployment config also enforces cache separation:

- `/assets/*`
  `Cache-Control: public, max-age=31536000, immutable`

- `/data/*`
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`

This is useful operationally because:

- build artifacts can be aggressively cached
- data can be refreshed more frequently without full redeploy invalidation assumptions

## Repository Hygiene

The repo intentionally ignores local and generated artifacts such as:

- `.venv/`
- `.uv-cache/`
- `dist/`
- `node_modules/`
- local `.env*`
- `.claude/settings.local.json`

Raw Excel inputs are also ignored:

- `data/*.xlsx`
- `data/*.xls`

The parsed JSON outputs are not ignored and are expected to be versioned.

## Security Review Checklist

When changing this project, re-check the following:

1. `vercel.json`
   Confirm CSP and headers still match runtime behavior

2. `package.json` and `package-lock.json`
   Confirm dependency changes are intentional and auditable

3. `pyproject.toml` and `uv.lock`
   Confirm parser dependency changes are locked and reproducible

4. `src/utils/exportSvg.js` and `src/utils/exportPdf.js`
   Confirm filename sanitization and export behavior still hold

5. `src/utils/svgBuilder.js`
   Confirm no untrusted content path is introduced into generated SVG

6. `src/hooks/useRoliData.js`
   Confirm data fetch scope remains same-origin only

## Reporting

If a security issue is discovered:

1. Do not open a public issue with exploit details first
2. Contact the repository maintainer through a private channel
3. Include reproduction steps, impact, and affected versions
4. Allow time for remediation before public disclosure
