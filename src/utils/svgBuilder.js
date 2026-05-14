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

/** Compute the height needed for a single factor column based on its subfactor count. */
function factorColumnHeight(subfactorCount) {
  return LAYOUT.factorHeaderHeight + subfactorCount * LAYOUT.barRowHeight;
}

/** Compute the total SVG height given the data structure. */
function computeHeight() {
  const colsPerRow = LAYOUT.columns;
  const row1Max = Math.max(
    ...FACTOR_STRUCTURE.slice(0, colsPerRow).map(f => factorColumnHeight(f.subfactors.length)),
  );
  const row2Max = Math.max(
    ...FACTOR_STRUCTURE.slice(colsPerRow).map(f => factorColumnHeight(f.subfactors.length)),
  );
  return LAYOUT.margin * 2 + LAYOUT.headerHeight + row1Max + LAYOUT.rowGap + row2Max;
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
  const height = computeHeight();
  const { width, margin, headerHeight, columnGap, rowGap, columns } = LAYOUT;

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
    const y = margin + headerHeight + (row === 0 ? 0 : row1Max + rowGap);

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
      svg.appendChild(text(value != null ? value.toFixed(2) : '—', {
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

// Cache computed height at module load
const SVG_HEIGHT = computeHeight();

/** Helper: dimensions exposed for the PDF code so pages match the SVG aspect ratio. */
export function getSvgDimensions() {
  return { width: LAYOUT.width, height: SVG_HEIGHT };
}
