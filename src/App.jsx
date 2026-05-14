/**
 * App — top-level orchestrator.
 *
 * Owns selection state (region, selected country) and wires the data hook,
 * the chart, and the export utilities together. Deliberately small: any
 * logic heavier than "pick the right entity to display" lives in utils/
 * so it can be tested without React.
 *
 * The year displayed is read from the parsed JSON payload (`data.year`),
 * so when the data file is updated for a new release the dashboard
 * automatically follows. No code changes required.
 */
import { useMemo, useState, useCallback } from 'react';
import { ControlPanel, CountryProfileChart } from './components';
import { useRoliData } from './hooks/useRoliData.js';
import { resolveSelection, buildPdfEntries } from './utils/filters.js';
import { downloadCountrySvg } from './utils/exportSvg.js';
import { exportCountriesPdf } from './utils/exportPdf.js';
import { COLORS, FONTS, REGIONAL_AVG_KEY } from './config';

const containerStyle = {
  maxWidth: 1320,
  margin: '0 auto',
  padding: '40px 32px 80px',
};

const pageHeaderStyle = {
  marginBottom: 36,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: 42,
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  color: COLORS.ink,
  margin: 0,
};

const aboutButtonStyle = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  fontWeight: 500,
  color: COLORS.muted,
  background: 'none',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const aboutPanelStyle = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  color: COLORS.text,
  lineHeight: 1.7,
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 32,
  maxWidth: 720,
};

const errorBannerStyle = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  color: '#991b1b',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  padding: '12px 16px',
  marginBottom: 24,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const loadingStyle = {
  maxWidth: 1320,
  margin: '0 auto',
  padding: '40px 32px 80px',
  fontFamily: FONTS.sans,
};

const skeletonStyle = {
  background: `linear-gradient(90deg, ${COLORS.border} 25%, ${COLORS.surface} 50%, ${COLORS.border} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 4,
};

export default function App() {
  const { status, data, error } = useRoliData();

  const [region, setRegion] = useState('__global__');
  const [selectedCode, setSelectedCode] = useState(REGIONAL_AVG_KEY);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [exportError, setExportError] = useState(null);

  const countries = useMemo(() => data?.countries ?? [], [data?.countries]);
  const year = data?.year ?? '—';

  // Memoize filtered and sorted countries list
  const visibleCountries = useMemo(() => {
    const filtered = region === '__global__'
      ? countries
      : countries.filter(c => c.region === region);
    return [...filtered].sort((a, b) => a.country.localeCompare(b.country));
  }, [countries, region]);

  // When region changes, reset selection to the regional average so we never
  // end up displaying a country that doesn't exist in the active region.
  const handleRegionChange = useCallback(nextRegion => {
    setRegion(nextRegion);
    setSelectedCode(REGIONAL_AVG_KEY);
  }, []);

  const handleSelectedChange = useCallback(code => {
    setSelectedCode(code);
  }, []);

  // Resolve the entity to display every render. Cheap — pure lookup or
  // an O(N) average over ≤200 records.
  const { profile, title } = useMemo(
    () => resolveSelection({ countries, selectedCode, region }),
    [countries, selectedCode, region],
  );

  const handleDownloadSvg = useCallback(() => {
    if (!profile) return;
    downloadCountrySvg(profile, title, year);
  }, [profile, title, year]);

  const handleDownloadPdf = useCallback(async () => {
    const entries = buildPdfEntries({ countries });
    if (entries.length === 0) return;
    setExportError(null);
    setPdfBusy(true);
    setPdfProgress({ current: 0, total: entries.length });
    try {
      await exportCountriesPdf(entries, {
        filename: `ROLI_${year}_all_countries`,
        year,
        onProgress: setPdfProgress,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportError(err.message || 'PDF export failed. Please try again.');
    } finally {
      setPdfBusy(false);
      setPdfProgress(null);
    }
  }, [countries, year]);

  // --- Render states ---

  if (status === 'loading') {
    return (
      <div style={loadingStyle} role="status" aria-label="Loading data">
        <div style={{ ...skeletonStyle, width: 320, height: 40, marginBottom: 24 }} />
        <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
          <div style={{ ...skeletonStyle, width: 160, height: 36 }} />
          <div style={{ ...skeletonStyle, width: 200, height: 36 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ ...skeletonStyle, height: 180 }} />
          ))}
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ ...containerStyle, color: COLORS.muted, fontFamily: FONTS.sans }} role="alert">
        Failed to load data: {error?.message ?? 'unknown error'}
      </div>
    );
  }

  return (
    <div style={containerStyle} role="main">
      <header style={pageHeaderStyle}>
        <h1 style={titleStyle}>Rule of Law Index — Country Profiles</h1>
        <button
          style={aboutButtonStyle}
          onClick={() => setAboutOpen(!aboutOpen)}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = COLORS.ink;
            e.currentTarget.style.color = COLORS.ink;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.muted;
          }}
          aria-expanded={aboutOpen}
          aria-controls="about-panel"
        >
          {aboutOpen ? 'Close' : 'About'}
        </button>
      </header>

      {exportError && (
        <div style={errorBannerStyle} role="alert">
          <span>{exportError}</span>
          <button
            onClick={() => setExportError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#991b1b' }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {aboutOpen && (
        <div id="about-panel" style={aboutPanelStyle}>
          <p style={{ margin: '0 0 12px' }}>
            <strong>World Justice Project Rule of Law Index {year}</strong>
          </p>
          <p style={{ margin: '0 0 12px' }}>
            This interactive dashboard displays country profiles for the WJP Rule of Law Index,
            the world's leading source for original data on the rule of law. The Index measures
            how the rule of law is experienced and perceived by the general public across 8 factors:
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Constraints on Government Powers, Absence of Corruption, Open Government, Fundamental Rights,
            Order and Security, Regulatory Enforcement, Civil Justice, and Criminal Justice.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Select a region to filter countries, choose a specific country to view its profile,
            or download individual SVG charts and a complete multi-page PDF with all {countries.length} countries.
          </p>
          <p style={{ margin: 0, color: COLORS.muted, fontSize: 13 }}>
            Data source: <a href="https://worldjusticeproject.org" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.muted }}>worldjusticeproject.org</a>
          </p>
        </div>
      )}

      <ControlPanel
        region={region}
        onRegionChange={handleRegionChange}
        selectedCode={selectedCode}
        onSelectedChange={handleSelectedChange}
        countries={countries}
        visibleCountries={visibleCountries}
        onDownloadSvg={handleDownloadSvg}
        onDownloadPdf={handleDownloadPdf}
        pdfBusy={pdfBusy}
        pdfProgress={pdfProgress}
      />

      <CountryProfileChart profile={profile} title={title} year={year} />

      <footer
        style={{
          marginTop: 40,
          fontFamily: FONTS.sans,
          fontSize: 12,
          color: COLORS.muted,
          lineHeight: 1.6,
        }}
        role="contentinfo"
      >
        Source: World Justice Project, Rule of Law Index {year}. Scores are normalized
        between 0 and 1, where higher scores indicate stronger adherence to rule of law.
        Region average computed over {visibleCountries.length} {visibleCountries.length === 1 ? 'country' : 'countries'}.
      </footer>
    </div>
  );
}
