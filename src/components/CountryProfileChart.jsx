/**
 * CountryProfileChart — on-screen rendering of an 8-factor profile.
 *
 * Renders 4×2 grid of factor sections, each containing labeled horizontal
 * bars for its subfactors. Layout intentionally matches the WJP ROLI report
 * style so readers can cross-reference.
 *
 * The corresponding SVG export is built in utils/svgBuilder.js — keep both
 * in visual sync if you change one.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import {
  FACTOR_STRUCTURE,
  FACTOR_TITLES,
  SUBFACTOR_SHORT_LABELS,
  FACTOR_COLORS,
  COLORS,
  FONTS,
} from '../config';

function SubfactorBar({ label, value, color }) {
  const pct = value != null ? Math.max(0, Math.min(1, value)) : 0;
  const display = value != null ? value.toFixed(2) : '—';

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: FONTS.sans,
          fontSize: 12,
          color: COLORS.text,
          marginBottom: 4,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: 10,
            backgroundColor: COLORS.track,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              backgroundColor: color,
              borderRadius: 2,
              transition: 'width 240ms ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.ink,
            minWidth: 30,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {display}
        </span>
      </div>
    </div>
  );
}

SubfactorBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  color: PropTypes.string.isRequired,
};

function FactorSection({ factor, subfactors, data }) {
  const color = FACTOR_COLORS[factor];
  return (
    <section>
      <header
        style={{
          fontFamily: FONTS.sans,
          fontSize: 13,
          fontWeight: 700,
          color,
          paddingBottom: 6,
          marginBottom: 16,
          borderBottom: `1.5px solid ${color}`,
          minHeight: 36,
          lineHeight: 1.25,
        }}
      >
        {FACTOR_TITLES[factor]}
      </header>
      {subfactors.map(sf => (
        <SubfactorBar
          key={sf}
          label={SUBFACTOR_SHORT_LABELS[sf]}
          value={data[sf]}
          color={color}
        />
      ))}
    </section>
  );
}

FactorSection.propTypes = {
  factor: PropTypes.string.isRequired,
  subfactors: PropTypes.arrayOf(PropTypes.string).isRequired,
  data: PropTypes.object.isRequired,
};

function CountryProfileChart({ profile, title, year }) {
  if (!profile) {
    return (
      <div
        style={{
          padding: 64,
          textAlign: 'center',
          color: COLORS.muted,
          fontFamily: FONTS.sans,
        }}
      >
        No data available for this selection.
      </div>
    );
  }

  return (
    <article
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        padding: '32px 36px 40px',
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            margin: 0,
            color: COLORS.ink,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 13,
            color: COLORS.muted,
            marginTop: 6,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          ROLI {year}
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '36px 28px',
        }}
      >
        {FACTOR_STRUCTURE.map(({ factor, subfactors }) => (
          <FactorSection
            key={factor}
            factor={factor}
            subfactors={subfactors}
            data={profile}
          />
        ))}
      </div>
    </article>
  );
}

CountryProfileChart.propTypes = {
  profile: PropTypes.object,
  title: PropTypes.string.isRequired,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

export default memo(CountryProfileChart);
