import { memo } from 'react';
import PropTypes from 'prop-types';
import { COLORS, FONTS } from '../config';

const GREEN = '#2e7d32';
const RED = '#c62828';

function changeColor(value) {
  if (value == null || value === 0) return COLORS.ink;
  return value > 0 ? GREEN : RED;
}

function fmtChange(value, decimals = 2) {
  if (value == null) return '—';
  const abs = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return '0';
}

const thStyle = {
  fontFamily: FONTS.sans,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: COLORS.muted,
  padding: '8px 16px',
  textAlign: 'center',
  borderRight: `1px solid ${COLORS.border}`,
  whiteSpace: 'nowrap',
};

const thLastStyle = {
  ...thStyle,
  borderRight: 'none',
};

function tdStyle(color) {
  return {
    fontFamily: FONTS.sans,
    fontSize: 18,
    fontWeight: 700,
    color: color ?? COLORS.ink,
    padding: '10px 16px',
    textAlign: 'center',
    borderRight: `1px solid ${COLORS.border}`,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };
}

const tdLastStyle = { ...tdStyle(), borderRight: 'none' };

function StatsCard({ profile, year }) {
  if (!profile || profile.globalRank == null) return null;

  const globalRank = `${profile.globalRank} / ${profile.globalTotal}`;
  const regionRank =
    profile.regionalRank != null
      ? `${profile.regionalRank} / ${profile.regionalTotal}`
      : '—';
  const incomeRank =
    profile.incomeRank != null
      ? `${profile.incomeRank} / ${profile.incomeTotal}`
      : '—';

  const rankChange = profile.globalRankChange;
  const rankChangeVal =
    rankChange == null ? '—' : rankChange === 0 ? '0' : fmtChange(rankChange, 0);

  const pctLabel =
    year != null ? `% Change (${year - 1}–${year})` : '% Change';

  const pctVal =
    profile.pctChange != null ? fmtChange(profile.pctChange, 1) + '%' : '—';

  return (
    <div
      style={{
        overflowX: 'auto',
        marginBottom: 32,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          overflow: 'hidden',
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
            <th style={thStyle}>Global Rank</th>
            <th style={thStyle}>Rank Change</th>
            <th style={thStyle}>Region Rank</th>
            <th style={thStyle}>Score Change</th>
            <th style={thStyle}>Income Rank</th>
            <th style={thLastStyle}>{pctLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ backgroundColor: COLORS.surface }}>
            <td style={tdStyle()}>{globalRank}</td>
            <td style={tdStyle(changeColor(rankChange))}>{rankChangeVal}</td>
            <td style={tdStyle()}>{regionRank}</td>
            <td style={tdStyle(changeColor(profile.scoreChange))}>
              {fmtChange(profile.scoreChange)}
            </td>
            <td style={tdStyle()}>{incomeRank}</td>
            <td style={{ ...tdLastStyle, color: changeColor(profile.pctChange) }}>
              {pctVal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

StatsCard.propTypes = {
  profile: PropTypes.object,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default memo(StatsCard);
