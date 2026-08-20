/**
 * Vector PDF export for the two country-profile design prototypes.
 *
 * The renderer intentionally uses only jsPDF drawing primitives. This keeps
 * every chart, bar and text label selectable/vector-based and also lets the
 * builder run in Node for QA (pass `loadFonts: false` there).
 */
import {
  FACTOR_COLORS,
  FACTOR_STRUCTURE,
  FACTOR_TITLES,
  SUBFACTOR_SHORT_LABELS,
} from '../config/index.js';
import { registerInterTightFonts } from './fonts.js';

const PAGE = {
  vertical: { width: 612, height: 792, orientation: 'portrait' },
  horizontal: { width: 792, height: 612, orientation: 'landscape' },
};

const VERTICAL_COLUMNS = [
  ['f1', 'f2', 'f3'],
  ['f4', 'f5', 'f6'],
  ['f7', 'f8'],
];

const HORIZONTAL_COLUMNS = [
  ['f1', 'f2'],
  ['f3', 'f5'],
  ['f4', 'f6'],
  ['f7', 'f8'],
];

const PALETTE = {
  ink: '#191919',
  softInk: '#434343',
  muted: '#737373',
  faint: '#A7A7A7',
  border: '#D9D9D6',
  track: '#E8E8E5',
  paper: '#FFFFFF',
  panel: '#F5F5F2',
  positive: '#247A52',
  negative: '#B73A35',
  global: '#161616',
  regional: '#FFFFFF',
};

const SCORE_KEYS = [
  'overall',
  ...FACTOR_STRUCTURE.flatMap(({ factor, subfactors }) => [factor, ...subfactors]),
];

function numeric(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, numeric(value) ?? minimum));
}

function formatScore(value) {
  const parsed = numeric(value);
  return parsed == null ? 'N/A' : parsed.toFixed(2);
}

function formatChange(value) {
  const parsed = numeric(value);
  if (parsed == null) return { text: 'N/A', color: PALETTE.muted };
  if (Math.abs(parsed) < 0.05) return { text: '0.0%', color: PALETTE.muted };
  return {
    text: `${parsed > 0 ? '+' : ''}${parsed.toFixed(1)}%`,
    color: parsed > 0 ? PALETTE.positive : PALETTE.negative,
  };
}

function editionYears(entry) {
  const label = String(entry?.label ?? '');
  const range = label.match(/^(\d{4})[-–](\d{2}|\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2].length === 2
      ? Math.floor(start / 100) * 100 + Number(range[2])
      : Number(range[2]);
    return [start, end];
  }
  const labelYears = label.match(/\d{4}/g);
  if (labelYears?.length) return [...new Set(labelYears)].map(Number);
  const year = numeric(entry?.year);
  return year == null ? [] : [year];
}

function editionOrder(entry, fallback = 0) {
  const years = editionYears(entry);
  return years.length ? Math.max(...years) : fallback;
}

function editionKey(entry) {
  const years = editionYears(entry);
  if (years.length) return String(Math.max(...years));
  return String(entry?.label ?? entry?.year ?? '');
}

function editionLabel(entry) {
  const explicit = String(entry?.label ?? entry?.year ?? '');
  const range = explicit.match(/^(\d{4})[-–](\d{2}|\d{4})$/);
  if (range) return `${range[1]}-${range[2].slice(-2)}`;
  return explicit || 'N/A';
}

function prepareHistory(history) {
  if (!Array.isArray(history)) return [];
  const sorted = history
    .filter(entry => entry && typeof entry === 'object')
    .map((entry, index) => ({ ...entry, __order: editionOrder(entry, index) }))
    .sort((left, right) => left.__order - right.__order);
  const seen = new Set();
  return sorted.filter(entry => {
    const key = editionKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchEdition(entry, entries) {
  const key = editionKey(entry);
  return entries.find(candidate => editionKey(candidate) === key) ?? null;
}

function canonicalEditions(countryHistory, historicalAverages, layout, reportYear) {
  const averages = prepareHistory(historicalAverages);
  const country = prepareHistory(countryHistory);
  let editions;

  if (layout === 'vertical') {
    editions = (averages.length ? averages : country).slice(-10);
  } else {
    const source = averages.length ? averages : country;
    const latestAvailable = editionOrder(source.at(-1));
    const requestedEnd = numeric(reportYear);
    const endYear = requestedEnd ?? latestAvailable;
    const startYear = endYear - 5;
    editions = source
      .filter(entry => {
        const order = editionOrder(entry);
        return order >= startYear && order <= endYear;
      });

    // Keep the horizontal format anchored to six annual observations even if
    // an input omits averages or a country entered the Index during the span.
    const annual = new Map(editions.map(entry => [editionOrder(entry), entry]));
    editions = Array.from({ length: 6 }, (_, index) => startYear + index)
      .map(year => annual.get(year) ?? { year, label: String(year) });
  }

  return editions.map(edition => {
    const point = matchEdition(edition, country);
    const average = matchEdition(edition, averages);
    return {
      ...edition,
      ...(point ?? {}),
      label: editionLabel(edition),
      __global: average?.global ?? null,
      __regional: average?.regional ?? average?.regions ?? null,
    };
  });
}

function percentageChange(points, key) {
  const available = points.map(point => numeric(point?.[key])).filter(value => value != null);
  if (available.length < 2) return null;
  const first = available[0];
  const last = available.at(-1);
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

function changeSpan(points, key = 'overall') {
  const available = points.filter(point => numeric(point?.[key]) != null);
  if (available.length < 2) return null;
  return {
    start: editionLabel(available[0]),
    end: editionLabel(available.at(-1)),
  };
}

function mean(rows, key) {
  const values = rows.map(row => numeric(row?.[key])).filter(value => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCurrentBenchmarks(countries, region) {
  const valid = countries.filter(country => country && typeof country === 'object');
  const regional = valid.filter(country => country.region === region);
  return SCORE_KEYS.reduce((result, key) => {
    result.global[key] = mean(valid, key);
    result.regional[key] = mean(regional, key);
    return result;
  }, { global: {}, regional: {} });
}

function rankDetails(source, scope, fallback = {}) {
  const capitalized = `${scope[0].toUpperCase()}${scope.slice(1)}`;
  const nested = source?.[scope];
  return {
    rank: numeric(
      source?.[`${scope}Rank`]
      ?? source?.[`rank${capitalized}`]
      ?? (typeof nested === 'object' ? nested?.rank : nested),
    ),
    total: numeric(
      source?.[`${scope}Total`]
      ?? source?.[`total${capitalized}`]
      ?? (typeof nested === 'object' ? nested?.total : null)
      ?? fallback?.[`${scope}Total`],
    ),
  };
}

function hexToRgb(hex) {
  const normalized = String(hex).replace('#', '');
  return [0, 1, 2].map(index => Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16));
}

function setDrawColor(pdf, color) {
  pdf.setDrawColor(...hexToRgb(color));
}

function setFillColor(pdf, color) {
  pdf.setFillColor(...hexToRgb(color));
}

function setTextColor(pdf, color) {
  pdf.setTextColor(...hexToRgb(color));
}

function setTypeface(pdf, fontName, weight = 400) {
  if (fontName === 'Inter Tight') {
    pdf.setFont(fontName, weight >= 700 ? 'bold' : 'normal', weight);
  } else {
    pdf.setFont('helvetica', weight >= 600 ? 'bold' : 'normal');
  }
}

function applyTextStyle(pdf, context, { size = 8, weight = 400, color = PALETTE.ink } = {}) {
  setTypeface(pdf, context.fontName, weight);
  pdf.setFontSize(size);
  setTextColor(pdf, color);
}

function fittedFontSize(pdf, context, value, maxWidth, preferredSize, minimumSize, weight = 700) {
  applyTextStyle(pdf, context, { size: preferredSize, weight });
  let size = preferredSize;
  while (size > minimumSize && pdf.getTextWidth(String(value ?? 'N/A')) > maxWidth) {
    size -= 0.5;
    pdf.setFontSize(size);
  }
  return size;
}

function truncateText(pdf, value, maxWidth) {
  const text = String(value ?? 'N/A');
  if (!maxWidth || pdf.getTextWidth(text) <= maxWidth) return text;
  const suffix = '...';
  let result = text;
  while (result.length && pdf.getTextWidth(`${result}${suffix}`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}${suffix}`;
}

function drawText(pdf, context, value, x, y, options = {}) {
  applyTextStyle(pdf, context, options);
  const text = truncateText(pdf, value, options.maxWidth);
  pdf.text(text, x, y, { align: options.align ?? 'left' });
}

function wrappedLines(pdf, context, value, maxWidth, options = {}) {
  applyTextStyle(pdf, context, options);
  const lines = pdf.splitTextToSize(String(value ?? 'N/A'), maxWidth);
  const maxLines = options.maxLines ?? lines.length;
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = truncateText(pdf, clipped[maxLines - 1], maxWidth);
  return clipped;
}

function drawRule(pdf, x1, y1, x2, y2, color = PALETTE.border, width = 0.5) {
  setDrawColor(pdf, color);
  pdf.setLineWidth(width);
  pdf.line(x1, y1, x2, y2);
}

function drawHeader(pdf, context, country, history) {
  const { width, layout, year } = context;
  const margin = layout === 'vertical' ? 22 : 24;
  const countryName = country.country ?? 'Unknown country';
  const titleMaxWidth = layout === 'vertical' ? 260 : 475;
  const titleSize = fittedFontSize(
    pdf,
    context,
    countryName,
    titleMaxWidth,
    layout === 'vertical' ? 21 : 20,
    15,
  );

  drawText(pdf, context, `WJP RULE OF LAW INDEX ${year}`, margin, 22, {
    size: 7.2,
    weight: 700,
    color: PALETTE.softInk,
  });
  drawText(pdf, context, 'COUNTRY PROFILE', width - margin, 22, {
    size: 7.2,
    weight: 700,
    color: PALETTE.softInk,
    align: 'right',
  });
  drawRule(pdf, margin, 29, width - margin, 29, PALETTE.ink, 0.7);

  drawText(pdf, context, countryName, margin, 54, {
    size: titleSize,
    weight: 700,
    maxWidth: titleMaxWidth,
  });

  if (layout === 'vertical') {
    drawText(pdf, context, 'Region:', margin, 70, { size: 6.8, weight: 700 });
    drawText(pdf, context, country.region ?? 'N/A', margin + 29, 70, {
      size: 6.8,
      maxWidth: 225,
    });
    drawText(pdf, context, 'Income:', margin, 80, { size: 6.8, weight: 700 });
    drawText(pdf, context, country.income ?? 'N/A', margin + 29, 80, {
      size: 6.8,
      maxWidth: 225,
    });
    const span = changeSpan(history);
    const comparison = span
      ? `Changes compare ${span.start} with ${span.end}`
      : 'Change requires at least two available editions';
    const note = `Scores range from 0 (lowest) to 1 (highest). ${comparison}; scores are rounded to two decimals.`;
    const lines = wrappedLines(pdf, context, note, 297, { size: 6.4, color: PALETTE.muted, maxLines: 3 });
    lines.forEach((line, index) => drawText(pdf, context, line, 293, 64 + index * 8, {
      size: 6.4,
      color: PALETTE.muted,
      maxWidth: 297,
    }));
  } else {
    const identity = `Region: ${country.region ?? 'N/A'}  |  Income: ${country.income ?? 'N/A'}`;
    drawText(pdf, context, identity, margin, 68, { size: 6.8, maxWidth: 485 });
    const span = changeSpan(history);
    const comparison = span
      ? `Changes compare ${span.start} with ${span.end}.`
      : 'Change requires at least two available editions.';
    drawText(pdf, context, `Scores range from 0 (lowest) to 1 (highest). ${comparison}`, margin, 78, {
      size: 6.2,
      color: PALETTE.muted,
      maxWidth: 490,
    });
  }
}

function drawRankCell(pdf, context, x, y, width, label, details, compact = false) {
  drawText(pdf, context, label, x, y, { size: compact ? 5.2 : 5.8, color: PALETTE.muted, maxWidth: width });
  const rank = details.rank == null ? 'N/A' : String(Math.round(details.rank));
  const total = details.total == null ? '' : ` /${Math.round(details.total)}`;
  drawText(pdf, context, `${rank}${total}`, x, y + (compact ? 9 : 12), {
    size: compact ? 8 : 10,
    weight: 700,
    maxWidth: width,
  });
}

function drawOverallCard(pdf, context, country, history, globalAverage, bounds) {
  const { x, y, width, height } = bounds;
  const score = numeric(country.overall) ?? numeric(history.at(-1)?.overall);
  const change = formatChange(percentageChange(history, 'overall'));
  const globalRank = rankDetails(country, 'global');
  const regionalRank = rankDetails(country, 'regional');
  const incomeRank = rankDetails(country, 'income');

  setFillColor(pdf, PALETTE.panel);
  pdf.roundedRect(x, y, width, height, 2, 2, 'F');
  drawText(pdf, context, 'OVERALL SCORE', x + 10, y + 15, {
    size: 6.2,
    weight: 700,
    color: PALETTE.muted,
  });
  drawText(pdf, context, formatScore(score), x + 10, y + 42, { size: 23, weight: 700 });
  drawText(pdf, context, change.text, x + 72, y + 40, {
    size: 8,
    weight: 700,
    color: change.color,
  });

  let comparison = 'Global comparison unavailable';
  if (score != null && globalAverage != null) {
    const direction = Math.abs(score - globalAverage) < 0.005
      ? 'At'
      : score > globalAverage ? 'Above' : 'Below';
    comparison = `${direction} the global average (${formatScore(globalAverage)})`;
  }
  drawText(pdf, context, comparison, x + 10, y + 55, {
    size: 5.9,
    color: PALETTE.softInk,
    maxWidth: width - 20,
  });
  drawRule(pdf, x + 10, y + 63, x + width - 10, y + 63, PALETTE.border, 0.45);

  const cellWidth = (width - 20) / 3;
  drawRankCell(pdf, context, x + 10, y + 75, cellWidth, 'GLOBAL RANK', globalRank, context.layout === 'horizontal');
  drawRankCell(pdf, context, x + 10 + cellWidth, y + 75, cellWidth, 'REGION RANK', regionalRank, context.layout === 'horizontal');
  drawRankCell(pdf, context, x + 10 + cellWidth * 2, y + 75, cellWidth, 'INCOME RANK', incomeRank, context.layout === 'horizontal');
}

function seriesValue(point, key, region) {
  if (key === '__regional') return numeric(point?.__regional?.[region]);
  if (key === '__global') return numeric(point?.__global?.overall);
  return numeric(point?.[key]);
}

function drawSeries(pdf, points, key, region, xScale, yScale, options) {
  setDrawColor(pdf, options.color);
  setFillColor(pdf, options.color);
  pdf.setLineWidth(options.width ?? 1);
  pdf.setLineDashPattern(options.dash ?? [], 0);
  let previous = null;
  points.forEach((point, index) => {
    const value = seriesValue(point, key, region);
    if (value == null) {
      previous = null;
      return;
    }
    const current = { x: xScale(index), y: yScale(value) };
    if (previous) pdf.line(previous.x, previous.y, current.x, current.y);
    if (options.points) pdf.circle(current.x, current.y, options.radius ?? 1.7, 'F');
    previous = current;
  });
  pdf.setLineDashPattern([], 0);
}

function drawLegendItem(pdf, context, x, y, label, color, dashed = false, maxWidth = 72) {
  setDrawColor(pdf, color);
  pdf.setLineWidth(1.15);
  pdf.setLineDashPattern(dashed ? [2, 1.5] : [], 0);
  pdf.line(x, y - 1.6, x + 11, y - 1.6);
  pdf.setLineDashPattern([], 0);
  drawText(pdf, context, label, x + 15, y, {
    size: 5.2,
    color: PALETTE.muted,
    maxWidth,
  });
}

function drawScoreChart(pdf, context, country, points, bounds, showGlobal) {
  const { x, y, width, height } = bounds;
  const region = country.region;
  drawText(pdf, context, 'SCORE OVER TIME', x, y + 8, {
    size: 6.2,
    weight: 700,
    color: PALETTE.muted,
  });
  const legendX = x + (context.layout === 'vertical' ? 95 : 146);
  const countryLegendSlot = context.layout === 'vertical' ? 106 : 145;
  drawLegendItem(
    pdf,
    context,
    legendX,
    y + 8,
    country.country ?? 'Country',
    PALETTE.ink,
    false,
    countryLegendSlot - 20,
  );
  let nextLegend = legendX + countryLegendSlot;
  if (showGlobal) {
    drawLegendItem(pdf, context, nextLegend, y + 8, 'Global', PALETTE.faint, true);
    nextLegend += 66;
  }
  drawLegendItem(pdf, context, nextLegend, y + 8, 'Regional', '#8D8D8D', true);

  const plot = {
    left: x + 19,
    right: x + width - 5,
    top: y + 18,
    bottom: y + height - 18,
  };
  const xScale = index => (
    points.length > 1
      ? plot.left + ((plot.right - plot.left) * index) / (points.length - 1)
      : (plot.left + plot.right) / 2
  );
  const yScale = value => plot.bottom - clamp(value) * (plot.bottom - plot.top);

  [0, 0.5, 1].forEach(value => {
    const plotY = yScale(value);
    drawRule(pdf, plot.left, plotY, plot.right, plotY, PALETTE.border, 0.35);
    drawText(pdf, context, value.toFixed(1), plot.left - 5, plotY + 1.6, {
      size: 4.6,
      color: PALETTE.muted,
      align: 'right',
    });
  });

  if (showGlobal) {
    drawSeries(pdf, points, '__global', region, xScale, yScale, {
      color: PALETTE.faint,
      width: 0.75,
      dash: [2, 1.4],
    });
  }
  drawSeries(pdf, points, '__regional', region, xScale, yScale, {
    color: '#8D8D8D',
    width: 0.9,
    dash: [3, 1.4],
  });
  drawSeries(pdf, points, 'overall', region, xScale, yScale, {
    color: PALETTE.ink,
    width: 1.35,
    points: true,
    radius: 1.55,
  });

  points.forEach((point, index) => {
    const pointX = xScale(index);
    const value = numeric(point.overall);
    drawText(pdf, context, editionLabel(point), pointX, y + height - 5, {
      size: context.layout === 'vertical' ? 4.3 : 4.9,
      color: PALETTE.muted,
      align: 'center',
      maxWidth: context.layout === 'vertical' ? 30 : 44,
    });
    if (value != null) {
      const labelY = Math.max(plot.top + 5, Math.min(plot.bottom - 3, yScale(value) - 4));
      const edgeOffset = index === 0 ? 2 : index === points.length - 1 ? -2 : 0;
      const align = index === 0 ? 'left' : index === points.length - 1 ? 'right' : 'center';
      drawText(pdf, context, value.toFixed(2), pointX + edgeOffset, labelY, {
        size: context.layout === 'vertical' ? 4.1 : 4.6,
        weight: 700,
        align,
      });
    }
  });
}

function drawBenchmarkLegend(pdf, context, x, y) {
  setFillColor(pdf, PALETTE.global);
  pdf.circle(x, y - 1.4, 1.7, 'F');
  drawText(pdf, context, 'Global Average', x + 5, y, { size: 5.2, color: PALETTE.muted });
  setFillColor(pdf, PALETTE.regional);
  setDrawColor(pdf, PALETTE.ink);
  pdf.setLineWidth(0.6);
  pdf.circle(x + 71, y - 1.4, 1.8, 'FD');
  drawText(pdf, context, 'Regional Average', x + 76, y, { size: 5.2, color: PALETTE.muted });
}

function drawSparkline(pdf, points, factor, bounds) {
  const { x, y, width, height } = bounds;
  const values = points.map(point => numeric(point?.[factor])).filter(value => value != null);
  if (!values.length) {
    drawRule(pdf, x, y + height / 2, x + width, y + height / 2, PALETTE.border, 0.45);
    return;
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.35, 0.012);
  const floor = Math.max(0, minimum - padding);
  const ceiling = Math.min(1, maximum + padding);
  const range = Math.max(ceiling - floor, 0.01);
  const xScale = index => x + (points.length > 1 ? width * index / (points.length - 1) : width / 2);
  const yScale = value => y + height - ((value - floor) / range) * height;
  drawSeries(pdf, points, factor, null, xScale, yScale, {
    color: FACTOR_COLORS[factor],
    width: 1.25,
    points: true,
    radius: 0.7,
  });
}

function factorMetricsHeight(layout) {
  return layout === 'vertical' ? 34 : 31;
}

function drawSubfactorBar(pdf, context, x, y, width, label, value, color, globalAverage, regionalAverage) {
  const lines = wrappedLines(pdf, context, label, width - 3, {
    size: 5.25,
    color: PALETTE.softInk,
    maxLines: 2,
  });
  lines.forEach((line, index) => drawText(pdf, context, line, x, y + index * 5.6, {
    size: 5.25,
    color: PALETTE.softInk,
    maxWidth: width - 3,
  }));

  const barY = y + lines.length * 5.6 + 1.6;
  const valueWidth = 20;
  const trackWidth = width - valueWidth;
  setFillColor(pdf, PALETTE.track);
  pdf.rect(x, barY, trackWidth, 3.1, 'F');
  if (numeric(value) != null) {
    setFillColor(pdf, color);
    pdf.rect(x, barY, trackWidth * clamp(value), 3.1, 'F');
  }

  if (numeric(globalAverage) != null) {
    setFillColor(pdf, PALETTE.global);
    pdf.circle(x + trackWidth * clamp(globalAverage), barY + 1.55, 1.35, 'F');
  }
  if (numeric(regionalAverage) != null) {
    setFillColor(pdf, PALETTE.regional);
    setDrawColor(pdf, PALETTE.ink);
    pdf.setLineWidth(0.45);
    pdf.circle(x + trackWidth * clamp(regionalAverage), barY + 1.55, 1.4, 'FD');
  }
  drawText(pdf, context, formatScore(value), x + width, barY + 2.8, {
    size: 5.3,
    weight: 700,
    align: 'right',
    maxWidth: valueWidth - 2,
  });
  return barY + 8;
}

function drawFactorMetrics(pdf, context, country, history, factor, x, y, width) {
  const score = numeric(country?.[factor]) ?? numeric(history.at(-1)?.[factor]);
  const change = formatChange(percentageChange(history, factor));
  drawText(pdf, context, 'SCORE', x, y, { size: 4.7, weight: 700, color: PALETTE.muted });
  drawText(pdf, context, formatScore(score), x, y + 12, { size: 10.5, weight: 700 });
  drawText(pdf, context, change.text, x + 29, y + 11, {
    size: 6,
    weight: 700,
    color: change.color,
  });

  if (context.layout === 'vertical') {
    const ranks = country?.factorRanks?.[factor] ?? {};
    const metrics = [
      ['GLOBAL', rankDetails(ranks, 'global', country)],
      ['REGION', rankDetails(ranks, 'regional', country)],
      ['INCOME', rankDetails(ranks, 'income', country)],
    ];
    const rankStart = x + 67;
    const rankWidth = (width - 67) / 3;
    metrics.forEach(([label, details], index) => {
      const cellX = rankStart + rankWidth * index;
      drawText(pdf, context, label, cellX, y, { size: 4.3, color: PALETTE.muted, maxWidth: rankWidth - 2 });
      drawText(pdf, context, details.rank == null ? 'N/A' : Math.round(details.rank), cellX, y + 12, {
        size: 7.4,
        weight: 700,
        maxWidth: rankWidth - 2,
      });
    });
  } else {
    const sparkX = x + 70;
    drawText(pdf, context, editionLabel(history[0]), sparkX, y, { size: 4.4, color: PALETTE.muted });
    drawText(pdf, context, editionLabel(history.at(-1)), x + width, y, {
      size: 4.4,
      color: PALETTE.muted,
      align: 'right',
    });
    drawSparkline(pdf, history, factor, { x: sparkX, y: y + 4, width: width - 70, height: 11 });
  }
}

function drawFactorBlock(pdf, context, country, history, benchmarks, factor, bounds) {
  const { x, y, width } = bounds;
  const structure = FACTOR_STRUCTURE.find(item => item.factor === factor);
  const color = FACTOR_COLORS[factor];
  setFillColor(pdf, color);
  pdf.rect(x, y, 3, 13, 'F');
  drawText(pdf, context, FACTOR_TITLES[factor], x + 7, y + 9, {
    size: context.layout === 'vertical' ? 7 : 6.7,
    weight: 700,
    maxWidth: width - 7,
  });
  drawRule(pdf, x, y + 16, x + width, y + 16, color, 0.75);

  const metricsY = y + 26;
  drawFactorMetrics(pdf, context, country, history, factor, x, metricsY, width);
  let rowY = metricsY + factorMetricsHeight(context.layout);
  structure.subfactors.forEach(subfactor => {
    rowY = drawSubfactorBar(
      pdf,
      context,
      x,
      rowY,
      width,
      SUBFACTOR_SHORT_LABELS[subfactor],
      numeric(country?.[subfactor]),
      color,
      benchmarks.global[subfactor],
      benchmarks.regional[subfactor],
    );
  });
  return rowY + 5;
}

function drawFactorColumns(pdf, context, country, history, benchmarks, columns, startY) {
  const margin = context.layout === 'vertical' ? 22 : 24;
  const gap = context.layout === 'vertical' ? 13 : 12;
  const columnWidth = (context.width - margin * 2 - gap * (columns.length - 1)) / columns.length;
  columns.forEach((column, columnIndex) => {
    const x = margin + columnIndex * (columnWidth + gap);
    let y = startY;
    column.forEach(factor => {
      y = drawFactorBlock(pdf, context, country, history, benchmarks, factor, {
        x,
        y,
        width: columnWidth,
      });
    });
  });
}

function drawFooter(pdf, context, pageNumber, totalPages) {
  const margin = context.layout === 'vertical' ? 22 : 24;
  const y = context.height - 17;
  drawRule(pdf, margin, y - 9, context.width - margin, y - 9, PALETTE.border, 0.5);
  drawText(pdf, context, `Source: World Justice Project, Rule of Law Index ${context.year}.`, margin, y, {
    size: 5.3,
    color: PALETTE.muted,
    maxWidth: context.width * 0.48,
  });
  drawText(pdf, context, 'Visual prototype | Scores rounded to two decimals', context.width / 2, y, {
    size: 5.3,
    color: PALETTE.muted,
    align: 'center',
  });
  drawText(pdf, context, `${pageNumber} / ${totalPages}`, context.width - margin, y, {
    size: 5.3,
    weight: 700,
    color: PALETTE.muted,
    align: 'right',
  });
}

function drawVerticalPage(pdf, context, country, history, benchmarks, pageNumber, totalPages) {
  drawHeader(pdf, context, country, history);
  const latestGlobal = numeric(history.at(-1)?.__global?.overall) ?? benchmarks.global.overall;
  drawOverallCard(pdf, context, country, history, latestGlobal, {
    x: 22,
    y: 94,
    width: 176,
    height: 102,
  });
  drawScoreChart(pdf, context, country, history, {
    x: 217,
    y: 94,
    width: 373,
    height: 102,
  }, true);
  drawText(pdf, context, 'FACTOR SCORE', 22, 216, { size: 7.3, weight: 700 });
  drawBenchmarkLegend(pdf, context, 107, 216);
  drawFactorColumns(pdf, context, country, history, benchmarks, VERTICAL_COLUMNS, 228);
  drawFooter(pdf, context, pageNumber, totalPages);
}

function drawHorizontalPage(pdf, context, country, history, benchmarks, pageNumber, totalPages) {
  drawHeader(pdf, context, country, history);
  const latestGlobal = numeric(history.at(-1)?.__global?.overall) ?? benchmarks.global.overall;
  drawScoreChart(pdf, context, country, history, {
    x: 24,
    y: 88,
    width: 492,
    height: 79,
  }, false);
  drawOverallCard(pdf, context, country, history, latestGlobal, {
    x: 539,
    y: 43,
    width: 229,
    height: 114,
  });
  drawText(pdf, context, 'FACTOR SCORE', 24, 182, { size: 7.3, weight: 700 });
  drawBenchmarkLegend(pdf, context, 110, 182);
  drawFactorColumns(pdf, context, country, history, benchmarks, HORIZONTAL_COLUMNS, 194);
  drawFooter(pdf, context, pageNumber, totalPages);
}

function sanitizeFilenameSegment(value) {
  const cleaned = String(value ?? 'unknown')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'unknown';
}

function normalizedLimit(limit, total) {
  if (limit == null) return total;
  const parsed = Math.floor(Number(limit));
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error('limit must be a positive integer');
  }
  return Math.min(parsed, total);
}

/**
 * Build, but do not download, a vector PDF of all requested country profiles.
 *
 * @param {object} options
 * @param {object[]} options.countries
 * @param {object[]} options.historicalAverages
 * @param {string|number} options.year
 * @param {'vertical'|'horizontal'} options.layout
 * @param {(progress: {current: number, total: number}) => void} [options.onProgress]
 * @param {boolean} [options.loadFonts=true]
 * @param {number} [options.limit] Useful for previews and automated QA.
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function buildPrototypeCountriesPdf({
  countries,
  historicalAverages = [],
  year,
  layout,
  onProgress,
  loadFonts = true,
  limit,
} = {}) {
  if (!Array.isArray(countries) || !countries.length) {
    throw new Error('No countries provided');
  }
  if (layout !== 'vertical' && layout !== 'horizontal') {
    throw new Error('layout must be "vertical" or "horizontal"');
  }
  if (onProgress != null && typeof onProgress !== 'function') {
    throw new Error('onProgress must be a function');
  }

  const ordered = [...countries]
    .filter(country => country && typeof country === 'object')
    .sort((left, right) => String(left.country ?? '').localeCompare(
      String(right.country ?? ''),
      undefined,
      { sensitivity: 'base' },
    ));
  if (!ordered.length) throw new Error('No valid country records provided');
  const selected = ordered.slice(0, normalizedLimit(limit, ordered.length));
  const page = PAGE[layout];
  const { jsPDF: JsPdf, default: defaultExport } = await import('jspdf');
  const PdfConstructor = JsPdf ?? defaultExport;
  const pdf = new PdfConstructor({
    orientation: page.orientation,
    unit: 'pt',
    format: [page.width, page.height],
    compress: true,
    putOnlyUsedFonts: true,
  });

  let fontName = 'helvetica';
  if (loadFonts) {
    await registerInterTightFonts(pdf);
    fontName = 'Inter Tight';
  }
  pdf.setProperties({
    title: `WJP Rule of Law Index ${year} - ${layout} country profiles`,
    subject: `${layout === 'vertical' ? 'Ten-edition portrait' : 'Five-year landscape'} country profiles`,
    author: 'World Justice Project',
    creator: 'ROLI Country Profiles',
  });

  const context = {
    ...page,
    layout,
    year: year ?? 'N/A',
    fontName,
  };
  const benchmarkCache = new Map();
  for (let index = 0; index < selected.length; index += 1) {
    const country = selected[index];
    if (index > 0) pdf.addPage([page.width, page.height], page.orientation);
    setFillColor(pdf, PALETTE.paper);
    pdf.rect(0, 0, page.width, page.height, 'F');
    const history = canonicalEditions(country.history, historicalAverages, layout, year);
    const regionKey = String(country.region ?? '');
    if (!benchmarkCache.has(regionKey)) {
      benchmarkCache.set(regionKey, buildCurrentBenchmarks(ordered, country.region));
    }
    const benchmarks = benchmarkCache.get(regionKey);
    if (layout === 'vertical') {
      drawVerticalPage(pdf, context, country, history, benchmarks, index + 1, selected.length);
    } else {
      drawHorizontalPage(pdf, context, country, history, benchmarks, index + 1, selected.length);
    }
    onProgress?.({ current: index + 1, total: selected.length });
    // Large all-country exports must periodically yield so the browser can
    // repaint progress and process input between groups of pages.
    if ((index + 1) % 4 === 0 && index + 1 < selected.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return pdf;
}

/** Build and immediately download a prototype PDF. */
export async function exportPrototypeCountriesPdf(options = {}) {
  const pdf = await buildPrototypeCountriesPdf(options);
  const year = sanitizeFilenameSegment(options.year);
  const descriptor = options.layout === 'vertical'
    ? 'vertical_10_editions'
    : 'horizontal_5_years';
  pdf.save(`ROLI_${year}_${descriptor}_all_countries.pdf`);
  return pdf;
}
