# Security Documentation

This document describes the security measures implemented in the ROLI Country
Profiles dashboard.

## Table of Contents

1. [HTTP Security Headers](#http-security-headers)
2. [Content Security Policy](#content-security-policy)
3. [Dependency Management](#dependency-management)
4. [Code Security](#code-security)
5. [Data Protection](#data-protection)
6. [Security Audit Commands](#security-audit-commands)
7. [Known Limitations](#known-limitations)

---

## HTTP Security Headers

Configured in `vercel.json` and applied to all routes:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-XSS-Protection` | `1; mode=block` | Enables browser's built-in XSS filter (legacy) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information sent with requests |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables access to sensitive browser APIs and opts out of FLoC |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years |

---

## Content Security Policy

A strict CSP is enforced to mitigate XSS and code injection:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob:;
connect-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self';
```

### CSP Directives Explained

| Directive | Allowed Sources | Reason |
|-----------|-----------------|--------|
| `default-src` | `'self'` | Block everything by default |
| `script-src` | `'self'` | Only first-party scripts. **No** `'unsafe-inline'` or `'unsafe-eval'` |
| `style-src` | `'self' 'unsafe-inline'` | Inline styles used throughout the React components |
| `font-src` | `'self' data:` | Self-hosted font files and inline font data when needed |
| `img-src` | `'self' data: blob:` | Page-generated SVG blobs (downloads) and data URIs (icons) |
| `connect-src` | `'self'` | Only fetch from this origin (JSON data file) |
| `object-src` | `'none'` | Disallow Flash, applets, etc. |
| `frame-ancestors` | `'none'` | Disallow embedding the app in iframes |
| `base-uri` | `'self'` | Prevent base tag injection |
| `form-action` | `'self'` | Disallow forms posting elsewhere |

Note: this project does **not** require `'unsafe-eval'`. Vite's production
build is fully static and does not eval at runtime.

---

## Dependency Management

### Automated Security Measures

1. **npm overrides** in `package.json` force secure versions of transitive
   dependencies (currently `nth-check`, `postcss`, `serialize-javascript`):
   ```json
   "overrides": {
     "nth-check": "^2.1.1",
     "postcss": "^8.4.49",
     "serialize-javascript": "^7.0.5"
   }
   ```

2. **Security audit scripts** available:
   ```bash
   npm run audit        # Check for high-severity vulnerabilities
   npm run audit:fix    # Automatically fix vulnerabilities
   ```

3. **Vite chosen over Create React App** specifically to reduce the
   transitive dependency surface. CRA's `react-scripts` pulled in
   ~1500 packages including the unfixable `xlsx` vulnerability; Vite +
   the few dependencies declared here total under 200 packages.

### Regular Maintenance

```bash
npm audit              # Check for vulnerabilities
npm update             # Update dependencies
npm outdated           # Check for outdated packages
```

---

## Code Security

### Secure Coding Practices

| Practice | Status | Description |
|----------|--------|-------------|
| No `dangerouslySetInnerHTML` | Enforced | Prevents XSS via innerHTML |
| No `eval()` or `new Function()` | Enforced | Prevents code injection |
| No hardcoded secrets | Enforced | No API keys or credentials in code |
| Input sanitization | Implemented | Filenames passed to `<a download>` are sanitized in `utils/exportSvg.js` and `utils/exportPdf.js` |
| HTTPS only | Enforced | HSTS header + all runtime resources served from first-party HTTPS |
| `rel="noopener"` on programmatic links | Implemented | SVG download anchor sets `rel="noopener"` |

### Files Excluded from Repository

The `.gitignore` excludes:
```
.env
.env.local
.env.*.local
node_modules/
dist/
```

---

## Data Protection

### Data Handling

| Aspect | Implementation |
|--------|----------------|
| Data source | Static JSON file (no backend, no database) |
| User data collection | None |
| Authentication | None (public dashboard) |
| API keys | None required |
| Cookies | None set by the application |
| Local storage | Not used |
| Analytics | None included by default |

### Source Data

The WJP ROLI 2025 dataset is published by the World Justice Project and is
publicly available. No private or personal data of any kind is processed by
this application.

---

## Security Audit Commands

```bash
# Full security audit
npm audit

# Audit only high/critical vulnerabilities
npm run audit

# Automatically fix vulnerabilities
npm run audit:fix
```

---

## Known Limitations

### CSP `'unsafe-inline'` for styles

We allow `'unsafe-inline'` in `style-src` because React inline styles are
used throughout the components. A future refactor to CSS Modules or vanilla
CSS files would let us drop this. The risk is low because we never inject
user-provided strings into style attributes.

### Self-hosted fonts

The web UI and PDF export use locally served Inter Tight font files from
`public/fonts/`. This avoids third-party runtime requests to Google Fonts
and keeps `script-src`, `style-src`, and `font-src` narrower.

### Client-side PDF generation

PDF generation runs entirely in the browser via `jspdf` + `svg2pdf.js`. Both
are popular, audited, MIT-licensed libraries with no native dependencies.
They run in the page's sandbox and cannot reach private data.

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue.
2. Contact the maintainers directly.
3. Provide details about the vulnerability.
4. Allow time for a fix before public disclosure.

---

## References

- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
