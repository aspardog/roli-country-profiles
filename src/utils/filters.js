/**
 * Filtering and aggregation helpers.
 *
 * Pure functions — no side effects, no DOM, no React. Easy to unit-test
 * and reuse from export code that runs outside of components.
 */
import { REGIONAL_AVG_KEY } from '../config';

/**
 * Filter countries by region. Pass '__global__' to skip filtering.
 */
export function filterByRegion(countries, region) {
  if (!region || region === '__global__') return countries;
  return countries.filter(c => c.region === region);
}

/**
 * Resolve the currently-selected entity into a {profile, title} pair.
 *
 * Selection can be:
 *   - A country code (e.g. "COL") — returns that country's data
 *   - REGIONAL_AVG_KEY ("__regional_avg__") — returns the precomputed average from JSON
 */
export function resolveSelection({ countries, averages, selectedCode, region }) {
  if (selectedCode === REGIONAL_AVG_KEY) {
    const profile = region === '__global__'
      ? averages?.global ?? null
      : averages?.regional?.[region] ?? null;
    const title = region === '__global__' ? 'Global Average' : `${region} — Regional Average`;
    return { profile, title };
  }
  const country = countries.find(c => c.code === selectedCode);
  if (!country) return { profile: null, title: '' };
  return { profile: country, title: country.country };
}

/**
 * Build the list of entries for a PDF export.
 *
 * Always returns ALL countries, sorted alphabetically. The region filter
 * controls what the user sees on screen but does not affect the PDF —
 * the PDF is a complete reference document. Regional and global averages
 * are intentionally excluded; the PDF contains only real countries.
 */
export function buildPdfEntries({ countries }) {
  return countries
    .slice()
    .sort((a, b) => a.country.localeCompare(b.country))
    .map(c => ({ profile: c, title: c.country }));
}
