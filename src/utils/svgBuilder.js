/**
 * SVG builder for a country profile.
 *
 * This module is the single source of the visual representation when
 * exporting. The on-screen chart is rendered in React (CountryProfileChart),
 * but for SVG download and PDF embedding we build a standalone, self-
 * contained SVG document via DOM APIs. Keeping this code separate means
 * the exported file does not depend on the runtime React stack.
 *
 * Design constants below mirror the on-screen layout proportions but are
 * tuned for print/export at a fixed pixel size.
 */
import {
  FACTOR_STRUCTURE,
  FACTOR_TITLES,
  SUBFACTOR_SHORT_LABELS,
  FACTOR_COLORS,
  COLORS,
  FONTS,
} from '../config';

// --- Layout constants ---------------------------------------------------

const LAYOUT = {
  width: 1280,
  margin: 48,
  headerHeight: 100,
  columnGap: 36,
  rowGap: 60,
  columns: 4,
  rows: 2,
  factorHeaderHeight: 46,
  barRowHeight: 46,
  labelHeight: 16,
  barHeight: 10,
  valueColWidth: 46, // reserved width for the numeric value on the right
};

const STATS = {
  cardHeight: 88,
  gap: 20,
};

const GREEN = '#2e7d32';
const RED = '#c62828';

/** Compute the height needed for a single factor column based on its subfactor count. */
function factorColumnHeight(subfactorCount) {
  return LAYOUT.factorHeaderHeight + subfactorCount * LAYOUT.barRowHeight;
}

/** Compute the total SVG height given the data structure. */
function computeHeight(hasStats = false) {
  const colsPerRow = LAYOUT.columns;
  const row1Max = Math.max(
    ...FACTOR_STRUCTURE.slice(0, colsPerRow).map(f => factorColumnHeight(f.subfactors.length)),
  );
  const row2Max = Math.max(
    ...FACTOR_STRUCTURE.slice(colsPerRow).map(f => factorColumnHeight(f.subfactors.length)),
  );
  const statsExtra = hasStats ? STATS.cardHeight + STATS.gap : 0;
  return LAYOUT.margin * 2 + LAYOUT.headerHeight + statsExtra + row1Max + LAYOUT.rowGap + row2Max;
}

// --- DOM helpers --------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k, String(v));
  }
  return node;
}

function text(content, attrs = {}) {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/**
 * Word-wrap a string into N lines by character width budget.
 * Used for long factor titles like "Constraints on Government Powers".
 */
function wrapWords(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Stats card ---------------------------------------------------------

function statChangeColor(value) {
  if (value == null || value === 0) return COLORS.ink;
  return value > 0 ? GREEN : RED;
}

function fmtChange(value, decimals = 2) {
  if (value == null) return 'n/a';
  const abs = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return '0';
}

function buildStatsCard(svg, profile, year, x, y, totalWidth) {
  const rankChange = profile.globalRankChange;
  const rankChangeVal =
    rankChange == null ? 'n/a' : rankChange === 0 ? '0' : fmtChange(rankChange, 0);
  const pctLabel =
    year != null ? `% CHG ${Number(year) - 1}-${year}` : '% CHANGE';
  const pctVal =
    profile.pctChange != null ? fmtChange(profile.pctChange, 1) + '%' : 'n/a';

  const cols = [
    {
      label: 'GLOBAL RANK',
      value: `${profile.globalRank} / ${profile.globalTotal}`,
      color: COLORS.ink,
    },
    { label: 'RANK CHANGE', value: rankChangeVal, color: statChangeColor(rankChange) },
    {
      label: 'REGION RANK',
      value: profile.regionalRank != null
        ? `${profile.regionalRank} / ${profile.regionalTotal}`
        : 'n/a',
      color: COLORS.ink,
    },
    {
      label: 'SCORE CHANGE',
      value: fmtChange(profile.scoreChange),
      color: statChangeColor(profile.scoreChange),
    },
    {
      label: 'INCOME RANK',
      value: profile.incomeRank != null
        ? `${profile.incomeRank} / ${profile.incomeTotal}`
        : 'n/a',
      color: COLORS.ink,
    },
    { label: pctLabel, value: pctVal, color: statChangeColor(profile.pctChange) },
  ];

  const numCols = cols.length;
  const colWidth = totalWidth / numCols;
  const { cardHeight } = STATS;
  const dividerY = y + 30;

  svg.appendChild(el('rect', {
    x, y,
    width: totalWidth,
    height: cardHeight,
    fill: COLORS.bg,
    stroke: COLORS.border,
    'stroke-width': 1,
    rx: 3,
  }));

  svg.appendChild(el('line', {
    x1: x, y1: dividerY,
    x2: x + totalWidth, y2: dividerY,
    stroke: COLORS.border,
    'stroke-width': 1,
  }));

  cols.forEach(({ label, value, color }, i) => {
    const colX = x + i * colWidth;
    const centerX = colX + colWidth / 2;

    if (i > 0) {
      svg.appendChild(el('line', {
        x1: colX, y1: y,
        x2: colX, y2: y + cardHeight,
        stroke: COLORS.border,
        'stroke-width': 1,
      }));
    }

    svg.appendChild(text(label, {
      x: centerX,
      y: y + 19,
      'font-family': FONTS.sans,
      'font-weight': 700,
      'font-size': 9,
      fill: COLORS.muted,
      'text-anchor': 'middle',
      'letter-spacing': '0.08em',
    }));

    svg.appendChild(text(value, {
      x: centerX,
      y: dividerY + (cardHeight - 30) / 2 + 8,
      'font-family': FONTS.sans,
      'font-weight': 700,
      'font-size': 19,
      fill: color,
      'text-anchor': 'middle',
    }));
  });
}

// --- Public API ---------------------------------------------------------

/**
 * Build a complete SVGSVGElement for a country profile.
 *
 * @param {object} profile - Country data record (must contain f1..f8 and sf11..sf87 numeric scores).
 * @param {string} title - Country name (or "Global Average", etc.).
 * @param {number|string} year - Year label shown below the title.
 * @returns {SVGSVGElement} Standalone SVG element ready to be serialized.
 */
export function buildProfileSvg(profile, title, year) {
  const hasStats = profile.globalRank != null;
  const height = computeHeight(hasStats);
  const { width, margin, headerHeight, columnGap, rowGap, columns } = LAYOUT;
  const statsOffset = hasStats ? STATS.cardHeight + STATS.gap : 0;

  const svg = el('svg', {
    xmlns: NS,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
  });

  // White background (so the SVG renders correctly when embedded in PDFs and
  // when viewed standalone on dark UAs).
  svg.appendChild(el('rect', { x: 0, y: 0, width, height, fill: COLORS.surface }));

  // --- Header ---
  svg.appendChild(text(title, {
    x: margin,
    y: margin + 34,
    'font-family': FONTS.display,
    'font-weight': 700,
    'font-size': 38,
    fill: COLORS.ink,
  }));

  svg.appendChild(text(String(year), {
    x: margin,
    y: margin + 62,
    'font-family': FONTS.sans,
    'font-weight': 400,
    'font-size': 16,
    fill: COLORS.muted,
    'letter-spacing': '0.06em',
  }));

  // --- Stats card ---
  if (hasStats) {
    buildStatsCard(svg, profile, year, margin, margin + headerHeight, width - margin * 2);
  }

  // --- Factor grid ---
  const colWidth = (width - margin * 2 - columnGap * (columns - 1)) / columns;
  const barAreaWidth = colWidth - LAYOUT.valueColWidth;

  const row1Max = Math.max(
    ...FACTOR_STRUCTURE.slice(0, columns).map(f => factorColumnHeight(f.subfactors.length)),
  );

  FACTOR_STRUCTURE.forEach(({ factor, subfactors }, idx) => {
    const row = idx < columns ? 0 : 1;
    const col = idx % columns;
    const color = FACTOR_COLORS[factor];
    const x = margin + col * (colWidth + columnGap);
    const y = margin + headerHeight + statsOffset + (row === 0 ? 0 : row1Max + rowGap);

    // Factor title (wraps to 2 lines if needed)
    const titleStr = FACTOR_TITLES[factor];
    const lines = wrapWords(titleStr, 26);
    lines.forEach((line, i) => {
      svg.appendChild(text(line, {
        x,
        y: y + 15 + i * 17,
        'font-family': FONTS.sans,
        'font-weight': 700,
        'font-size': 14,
        fill: color,
      }));
    });

    // Underline beneath the title (always 2 lines of height even for 1-line titles
    // so that all 8 columns align vertically)
    svg.appendChild(el('line', {
      x1: x,
      y1: y + 36,
      x2: x + colWidth - 16,
      y2: y + 36,
      stroke: color,
      'stroke-width': 1.5,
    }));

    // Subfactors
    subfactors.forEach((sf, sfIdx) => {
      const sfY = y + LAYOUT.factorHeaderHeight + sfIdx * LAYOUT.barRowHeight;
      const value = profile[sf];
      const valueWidth = value != null ? barAreaWidth * value : 0;

      // Label
      svg.appendChild(text(SUBFACTOR_SHORT_LABELS[sf], {
        x,
        y: sfY + 12,
        'font-family': FONTS.sans,
        'font-weight': 400,
        'font-size': 12,
        fill: COLORS.text,
      }));

      // Background track
      svg.appendChild(el('rect', {
        x,
        y: sfY + 16,
        width: barAreaWidth,
        height: LAYOUT.barHeight,
        fill: COLORS.track,
        rx: 2,
      }));

      // Value bar
      if (value != null) {
        svg.appendChild(el('rect', {
          x,
          y: sfY + 16,
          width: Math.max(0, valueWidth),
          height: LAYOUT.barHeight,
          fill: color,
          rx: 2,
        }));
      }

      // Numeric value
      svg.appendChild(text(value != null ? value.toFixed(2) : '--', {
        x: x + colWidth - 4,
        y: sfY + 28,
        'font-family': FONTS.sans,
        'font-weight': 600,
        'font-size': 12,
        fill: COLORS.ink,
        'text-anchor': 'end',
      }));
    });
  });

  return svg;
}

/**
 * Serialize an SVG element to a string, including the XML declaration.
 */
export function serializeSvg(svg) {
  const serializer = new XMLSerializer();
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svg);
}

/** Helper: dimensions exposed for the PDF code so pages match the SVG aspect ratio. */
export function getSvgDimensions(hasStats = true) {
  return { width: LAYOUT.width, height: computeHeight(hasStats) };
}
