/**
 * ControlPanel — the top toolbar.
 *
 * Composes:
 *   - Region selector (dropdown)
 *   - Country selector (dropdown, restricted to the active region)
 *   - "Download SVG" button (current country)
 *   - "Download PDF" button (every country in the dataset, alphabetical)
 *
 * The component is purely presentational: parent (App) owns state and
 * passes callbacks down. This keeps reasoning straightforward and makes
 * it trivial to swap out the export strategy later.
 */
import PropTypes from 'prop-types';
import { COLORS, FONTS, REGIONS, REGION_LABELS, REGIONAL_AVG_KEY } from '../config';

const labelStyle = {
  fontFamily: FONTS.sans,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: COLORS.muted,
  marginBottom: 6,
  display: 'block',
};

const selectStyle = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  fontWeight: 500,
  color: COLORS.ink,
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 3,
  padding: '10px 14px',
  width: '100%',
  cursor: 'pointer',
  appearance: 'none',
  // Custom chevron using inline SVG data URI (safe under our CSP because img-src allows data:).
  backgroundImage:
    "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%237a7a7a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
};

const buttonBase = {
  fontFamily: FONTS.sans,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.02em',
  padding: '11px 18px',
  borderRadius: 3,
  cursor: 'pointer',
  border: `1px solid ${COLORS.ink}`,
  transition: 'transform 120ms ease, opacity 120ms ease',
  whiteSpace: 'nowrap',
};

const primaryButton = {
  ...buttonBase,
  backgroundColor: COLORS.ink,
  color: COLORS.accentText,
};

const secondaryButton = {
  ...buttonBase,
  backgroundColor: 'transparent',
  color: COLORS.ink,
};

function ControlPanel({
  region,
  onRegionChange,
  selectedCode,
  onSelectedChange,
  countries,
  visibleCountries,
  onDownloadSvg,
  onDownloadPdf,
  pdfBusy,
  pdfProgress,
}) {
  const avgLabel = region === '__global__' ? 'Global Average' : `${region} — Average`;
  // The PDF always contains every country in the dataset (alphabetical order),
  // regardless of the on-screen region filter.
  const totalCountries = countries.length;
  const pdfButtonText = pdfBusy
    ? `Generating PDF… ${pdfProgress?.current ?? 0}/${pdfProgress?.total ?? '?'}`
    : `Download PDF (${totalCountries} countries)`;

  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        padding: '24px 28px',
        marginBottom: 32,
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) auto auto',
        gap: 20,
        alignItems: 'end',
      }}
    >
      <div>
        <label htmlFor="region-select" style={labelStyle}>Region</label>
        <select
          id="region-select"
          value={region}
          onChange={e => onRegionChange(e.target.value)}
          style={selectStyle}
        >
          {REGIONS.map(r => (
            <option key={r} value={r}>{REGION_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="country-select" style={labelStyle}>Country</label>
        <select
          id="country-select"
          value={selectedCode}
          onChange={e => onSelectedChange(e.target.value)}
          style={selectStyle}
        >
          <option value={REGIONAL_AVG_KEY}>{avgLabel}</option>
          <optgroup label="Countries">
            {visibleCountries.map(c => (
              <option key={c.code} value={c.code}>{c.country}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <button
        type="button"
        style={secondaryButton}
        onClick={onDownloadSvg}
        title="Download the currently-displayed profile as SVG"
        aria-label="Download current profile as SVG"
      >
        ↓ SVG
      </button>

      <button
        type="button"
        style={{ ...primaryButton, opacity: pdfBusy ? 0.7 : 1 }}
        disabled={pdfBusy || totalCountries === 0}
        onClick={onDownloadPdf}
        title={`Download a multi-page PDF with every country, one per page (${totalCountries} pages, alphabetical order)`}
        aria-label={`Download PDF with all ${totalCountries} countries`}
        aria-busy={pdfBusy}
      >
        {pdfButtonText}
      </button>
    </div>
  );
}

ControlPanel.propTypes = {
  region: PropTypes.string.isRequired,
  onRegionChange: PropTypes.func.isRequired,
  selectedCode: PropTypes.string.isRequired,
  onSelectedChange: PropTypes.func.isRequired,
  countries: PropTypes.array.isRequired,
  visibleCountries: PropTypes.array.isRequired,
  onDownloadSvg: PropTypes.func.isRequired,
  onDownloadPdf: PropTypes.func.isRequired,
  pdfBusy: PropTypes.bool,
  pdfProgress: PropTypes.shape({
    current: PropTypes.number,
    total: PropTypes.number,
  }),
};

export default ControlPanel;
