import { memo, useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  FACTOR_COLORS,
  FACTOR_STRUCTURE,
  FACTOR_TITLES,
  SUBFACTOR_SHORT_LABELS,
} from '../config';
import { exportPrototypeCountriesPdf } from '../utils/exportPrototypePdf.js';
import './designComparison.css';

const SCORE_KEYS = [
  'overall',
  ...FACTOR_STRUCTURE.flatMap(({ factor, subfactors }) => [factor, ...subfactors]),
];
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
function numeric(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value) {
  return Math.max(0, Math.min(1, numeric(value) ?? 0));
}

function formatScore(value) {
  const parsed = numeric(value);
  return parsed == null ? '—' : parsed.toFixed(2);
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
  const editionRange = explicit.match(/^(\d{4})[-–](\d{2}|\d{4})$/);
  if (editionRange) return `${editionRange[1]}-${editionRange[2].slice(-2)}`;
  const years = editionYears(entry);
  if (years.length > 1) return `${years[0]}-${String(years.at(-1)).slice(-2)}`;
  return explicit || '—';
}

function prepareHistory(history) {
  if (!Array.isArray(history)) return [];
  const sorted = history
    .map((entry, index) => ({ ...entry, __order: editionOrder(entry, index) }))
    .sort((a, b) => a.__order - b.__order);
  const seen = new Set();
  return sorted.filter(entry => {
    const key = editionKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchAverage(point, historicalAverages) {
  const key = editionKey(point);
  return historicalAverages.find(entry => editionKey(entry) === key) ?? null;
}

function attachBenchmarks(points, historicalAverages, region) {
  return points.map(point => {
    const averages = matchAverage(point, historicalAverages);
    const regional = averages?.regional?.[region] ?? averages?.regions?.[region] ?? null;
    return {
      ...point,
      __global: numeric(averages?.global?.overall),
      __regional: numeric(regional?.overall),
    };
  });
}

function mean(rows, key) {
  const values = rows.map(row => numeric(row?.[key])).filter(value => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCurrentBenchmarks(countries, region) {
  const regionalCountries = countries.filter(country => country.region === region);
  return SCORE_KEYS.reduce(
    (result, key) => {
      result.global[key] = mean(countries, key);
      result.regional[key] = mean(regionalCountries, key);
      return result;
    },
    { global: {}, regional: {} },
  );
}

function percentageChange(points, key) {
  const values = points.map(point => numeric(point?.[key])).filter(value => value != null);
  if (values.length < 2 || values[0] === 0) return null;
  return ((values.at(-1) - values[0]) / values[0]) * 100;
}

function changeDetails(value) {
  const parsed = numeric(value);
  if (parsed == null) {
    return { className: 'dc-change--missing', symbol: '—', visual: 'No data', spoken: 'No data' };
  }
  if (Math.abs(parsed) < 0.05) {
    return { className: 'dc-change--flat', symbol: '→', visual: '0.0%', spoken: 'No change' };
  }
  const direction = parsed > 0 ? 'up' : 'down';
  return {
    className: parsed > 0 ? 'dc-change--up' : 'dc-change--down',
    symbol: parsed > 0 ? '↑' : '↓',
    visual: `${parsed > 0 ? '+' : ''}${parsed.toFixed(1)}%`,
    spoken: `${Math.abs(parsed).toFixed(1)} percent ${direction}`,
  };
}

function rankDetails(source, scope, fallback = {}) {
  const capitalized = `${scope[0].toUpperCase()}${scope.slice(1)}`;
  const nested = source?.[scope];
  const rank = numeric(
    source?.[`${scope}Rank`] ?? source?.[`rank${capitalized}`]
      ?? (typeof nested === 'object' ? nested?.rank : nested),
  );
  const total = numeric(
    source?.[`${scope}Total`] ?? source?.[`total${capitalized}`]
      ?? (typeof nested === 'object' ? nested?.total : null)
      ?? fallback?.[`${scope}Total`],
  );
  return { rank, total };
}

function ChangeValue({ value, compact = false }) {
  const details = changeDetails(value);
  return (
    <span
      className={`dc-change ${details.className}${compact ? ' dc-change--compact' : ''}`}
      aria-label={details.spoken}
    >
      <span aria-hidden="true">{details.visual} {details.symbol}</span>
    </span>
  );
}

ChangeValue.propTypes = {
  value: PropTypes.number,
  compact: PropTypes.bool,
};

function pathFor(points, key, xScale, yScale) {
  let path = '';
  let drawing = false;
  points.forEach((point, index) => {
    const value = numeric(point?.[key]);
    if (value == null) {
      drawing = false;
      return;
    }
    path += `${drawing ? ' L' : ' M'} ${xScale(index)} ${yScale(value)}`;
    drawing = true;
  });
  return path;
}

function ScoreChart({ points, countryName, region, showGlobal = true, layout }) {
  const width = layout === 'vertical' ? 330 : 348;
  const height = layout === 'vertical' ? 86 : 94;
  const left = 22;
  const right = width - 7;
  const top = 7;
  const bottom = height - 22;
  const xScale = index => (
    points.length > 1 ? left + ((right - left) * index) / (points.length - 1) : (left + right) / 2
  );
  const yScale = value => bottom - clampScore(value) * (bottom - top);
  const countryPath = pathFor(points, 'overall', xScale, yScale);
  const globalPath = pathFor(points, '__global', xScale, yScale);
  const regionalPath = pathFor(points, '__regional', xScale, yScale);
  const change = percentageChange(points, 'overall');

  return (
    <div className={`dc-score-chart dc-score-chart--${layout}`}>
      <div className="dc-chart-heading">
        <h3>Score over time</h3>
        <div className="dc-chart-legend" aria-label="Chart legend">
          <span><i className="dc-legend-line dc-legend-line--country" />{countryName}</span>
          {showGlobal && <span><i className="dc-legend-line dc-legend-line--global" />Global</span>}
          <span><i className="dc-legend-line dc-legend-line--regional" />Regional</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${countryName} Rule of Law score history, ${changeDetails(change).spoken}`}
      >
        <title>{countryName} score over time compared with {region}</title>
        {[0, 0.5, 1].map(value => (
          <g key={value}>
            <line
              className="dc-chart-grid"
              x1={left}
              x2={right}
              y1={yScale(value)}
              y2={yScale(value)}
            />
            <text className="dc-chart-axis" x="1" y={yScale(value) + 2}>{value.toFixed(1)}</text>
          </g>
        ))}
        {showGlobal && globalPath && <path className="dc-line dc-line--global" d={globalPath} />}
        {regionalPath && <path className="dc-line dc-line--regional" d={regionalPath} />}
        {countryPath && <path className="dc-line dc-line--country" d={countryPath} />}
        {points.map((point, index) => {
          const value = numeric(point.overall);
          if (value == null) return null;
          return (
            <g key={`${editionKey(point)}-${index}`}>
              <circle className="dc-chart-point" cx={xScale(index)} cy={yScale(value)} r="2.7">
                <title>{editionLabel(point)}: {formatScore(value)}</title>
              </circle>
              <text className="dc-chart-value" x={xScale(index)} y={yScale(value) + 9} textAnchor="middle">
                {formatScore(value)}
              </text>
              <text className="dc-chart-axis" x={xScale(index)} y={height - 4} textAnchor="middle">
                {editionLabel(point)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

ScoreChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  countryName: PropTypes.string.isRequired,
  region: PropTypes.string.isRequired,
  showGlobal: PropTypes.bool,
  layout: PropTypes.oneOf(['vertical', 'horizontal']).isRequired,
};

function Sparkline({ points, factor, countryName }) {
  const values = points.map(point => numeric(point?.[factor]));
  const present = values.filter(value => value != null);
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 1;
  const padding = Math.max((max - min) * 0.35, 0.012);
  const floor = Math.max(0, min - padding);
  const ceiling = Math.min(1, max + padding);
  const range = Math.max(ceiling - floor, 0.01);
  const xScale = index => (points.length > 1 ? (94 * index) / (points.length - 1) : 47);
  const yScale = value => 17 - ((value - floor) / range) * 14;
  const path = pathFor(points, factor, xScale, yScale);

  return (
    <svg
      className="dc-sparkline"
      viewBox="0 0 94 20"
      role="img"
      aria-label={`${FACTOR_TITLES[factor]} trend for ${countryName}`}
    >
      <title>{FACTOR_TITLES[factor]} trend, {editionLabel(points[0])} to {editionLabel(points.at(-1))}</title>
      {path && (
        <path
          d={path}
          fill="none"
          stroke={FACTOR_COLORS[factor]}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

Sparkline.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  factor: PropTypes.string.isRequired,
  countryName: PropTypes.string.isRequired,
};

function SubfactorBar({ label, value, color, globalAverage, regionalAverage }) {
  const ariaParts = [
    `${label}: ${formatScore(value)}`,
    globalAverage == null ? null : `global average ${formatScore(globalAverage)}`,
    regionalAverage == null ? null : `regional average ${formatScore(regionalAverage)}`,
  ].filter(Boolean);

  return (
    <div className="dc-subfactor">
      <div className="dc-subfactor-label">{label}</div>
      <div className="dc-subfactor-row">
        <div className="dc-bar-track" role="img" aria-label={ariaParts.join(', ')}>
          <span
            className="dc-bar-fill"
            style={{ width: `${clampScore(value) * 100}%`, backgroundColor: color }}
          />
          {globalAverage != null && (
            <span
              className="dc-marker dc-marker--global"
              style={{ left: `${clampScore(globalAverage) * 100}%` }}
              aria-hidden="true"
            />
          )}
          {regionalAverage != null && (
            <span
              className="dc-marker dc-marker--regional"
              style={{ left: `${clampScore(regionalAverage) * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>
        <span className="dc-subfactor-value">{formatScore(value)}</span>
      </div>
    </div>
  );
}

SubfactorBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  color: PropTypes.string.isRequired,
  globalAverage: PropTypes.number,
  regionalAverage: PropTypes.number,
};

function FactorBlock({
  country,
  factor,
  history,
  benchmarks,
  layout,
  headingId,
}) {
  const structure = FACTOR_STRUCTURE.find(item => item.factor === factor);
  const latestHistory = history.at(-1);
  const score = numeric(country?.[factor]) ?? numeric(latestHistory?.[factor]);
  const change = percentageChange(history, factor);
  const ranks = country?.factorRanks?.[factor] ?? {};
  const globalRank = rankDetails(ranks, 'global', country).rank;
  const regionalRank = rankDetails(ranks, 'regional', country).rank;
  const incomeRank = rankDetails(ranks, 'income', country).rank;
  const color = FACTOR_COLORS[factor];

  return (
    <section
      className={`dc-factor dc-factor--${layout}`}
      style={{ '--dc-factor-color': color }}
      aria-labelledby={headingId}
    >
      <h4 id={headingId}>{FACTOR_TITLES[factor]}</h4>
      {layout === 'vertical' ? (
        <div className="dc-factor-metrics dc-factor-metrics--ranked">
          <div className="dc-factor-score">
            <span>Score</span>
            <strong>{formatScore(score)}</strong>
            <ChangeValue value={change} compact />
          </div>
          <div><span>Global</span><strong>{globalRank ?? '—'}</strong></div>
          <div><span>Region</span><strong>{regionalRank ?? '—'}</strong></div>
          <div><span>Income</span><strong>{incomeRank ?? '—'}</strong></div>
        </div>
      ) : (
        <div className="dc-factor-metrics dc-factor-metrics--trend">
          <div className="dc-factor-score">
            <span>Score</span>
            <strong>{formatScore(score)}</strong>
            <ChangeValue value={change} compact />
          </div>
          <div className="dc-factor-trend">
            <div><span>{editionLabel(history[0])}</span><span>{editionLabel(history.at(-1))}</span></div>
            <Sparkline points={history} factor={factor} countryName={country.country} />
          </div>
        </div>
      )}
      <div className="dc-subfactor-list">
        {structure.subfactors.map(subfactor => (
          <SubfactorBar
            key={subfactor}
            label={SUBFACTOR_SHORT_LABELS[subfactor]}
            value={numeric(country?.[subfactor])}
            color={color}
            globalAverage={benchmarks.global[subfactor]}
            regionalAverage={benchmarks.regional[subfactor]}
          />
        ))}
      </div>
    </section>
  );
}

FactorBlock.propTypes = {
  country: PropTypes.object.isRequired,
  factor: PropTypes.string.isRequired,
  history: PropTypes.arrayOf(PropTypes.object).isRequired,
  benchmarks: PropTypes.shape({
    global: PropTypes.object.isRequired,
    regional: PropTypes.object.isRequired,
  }).isRequired,
  layout: PropTypes.oneOf(['vertical', 'horizontal']).isRequired,
  headingId: PropTypes.string.isRequired,
};

function RankCell({ label, details }) {
  return (
    <div className="dc-rank-cell">
      <span>{label}</span>
      <strong>{details.rank ?? '—'}{details.total != null && <small>/{details.total}</small>}</strong>
    </div>
  );
}

RankCell.propTypes = {
  label: PropTypes.string.isRequired,
  details: PropTypes.shape({
    rank: PropTypes.number,
    total: PropTypes.number,
  }).isRequired,
};

function OverallCard({ country, points, globalAverage, layout }) {
  const score = numeric(country.overall) ?? numeric(points.at(-1)?.overall);
  const change = percentageChange(points, 'overall');
  const globalRank = rankDetails(country, 'global');
  const regionalRank = rankDetails(country, 'regional');
  const incomeRank = rankDetails(country, 'income');
  let comparison = 'Global comparison unavailable';
  let comparisonClass = '';
  if (globalAverage != null && score != null) {
    if (Math.abs(score - globalAverage) < 0.005) {
      comparison = `At the global average (${formatScore(globalAverage)})`;
      comparisonClass = ' dc-comparison--same';
    } else if (score > globalAverage) {
      comparison = `Above the global average (${formatScore(globalAverage)})`;
      comparisonClass = ' dc-comparison--above';
    } else {
      comparison = `Below the global average (${formatScore(globalAverage)})`;
      comparisonClass = ' dc-comparison--below';
    }
  }

  if (layout === 'horizontal') {
    return (
      <section className="dc-overall dc-overall--horizontal" aria-label="Overall score and ranking">
        <div className="dc-overall-main">
          <span className="dc-kicker">Overall Score</span>
          <div className="dc-overall-score">
            <strong>{formatScore(score)}</strong>
            <ChangeValue value={change} />
          </div>
          <div className={`dc-comparison${comparisonClass}`}>{comparison}</div>
        </div>
        <div className="dc-ranking-block">
          <span className="dc-kicker">Ranking</span>
          <div className="dc-ranking-grid">
            <RankCell label="Global" details={globalRank} />
            <RankCell label="Region" details={regionalRank} />
            <RankCell label="Income" details={incomeRank} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dc-overall dc-overall--vertical" aria-label="Overall score and ranking">
      <span className="dc-kicker">Overall Score</span>
      <div className="dc-overall-score">
        <strong>{formatScore(score)}</strong>
        <ChangeValue value={change} />
      </div>
      <div className={`dc-comparison${comparisonClass}`}>{comparison}</div>
      <div className="dc-ranking-grid">
        <RankCell label="Global Rank" details={globalRank} />
        <RankCell label="Region Rank" details={regionalRank} />
        <RankCell label="Income Rank" details={incomeRank} />
      </div>
    </section>
  );
}

OverallCard.propTypes = {
  country: PropTypes.object.isRequired,
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  globalAverage: PropTypes.number,
  layout: PropTypes.oneOf(['vertical', 'horizontal']).isRequired,
};

function BenchmarkLegend() {
  return (
    <div className="dc-benchmark-legend" aria-label="Bar marker legend">
      <span><i className="dc-legend-dot dc-legend-dot--global" />Global Average</span>
      <span><i className="dc-legend-dot dc-legend-dot--regional" />Regional Average</span>
    </div>
  );
}

function MovementKey({ editions }) {
  const first = editionLabel(editions[0]);
  const last = editionLabel(editions.at(-1));
  return (
    <p className="dc-method-note">
      Scores range from 0 (lowest) to 1 (highest). Changes compare {first} with {last}.
      {' '}<span className="dc-up">Moved up ↑</span>{' '}
      <span className="dc-down">Moved down ↓</span>{' '}
      <span>No change →</span>
    </p>
  );
}

MovementKey.propTypes = {
  editions: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function PaperHeader({ country, year, editions, layout }) {
  return (
    <header className={`dc-paper-header dc-paper-header--${layout}`}>
      <div className="dc-paper-eyebrow">
        <span>WJP RULE OF LAW INDEX {year}</span>
        <span>COUNTRY PROFILE</span>
      </div>
      <div className="dc-paper-identity">
        <div>
          <h2>{country.country}</h2>
          <p><strong>Region:</strong> {country.region}</p>
          <p><strong>Income:</strong> {country.income}</p>
        </div>
        <MovementKey editions={editions} />
      </div>
    </header>
  );
}

PaperHeader.propTypes = {
  country: PropTypes.object.isRequired,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  editions: PropTypes.arrayOf(PropTypes.object).isRequired,
  layout: PropTypes.oneOf(['vertical', 'horizontal']).isRequired,
};

function PaperFooter({ year }) {
  return (
    <footer className="dc-paper-footer">
      <span>Source: World Justice Project, Rule of Law Index {year}.</span>
      <span>Visual prototype · Scores rounded to two decimals</span>
    </footer>
  );
}

PaperFooter.propTypes = {
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

function FactorColumns({
  columns,
  country,
  history,
  benchmarks,
  layout,
  idPrefix,
}) {
  return (
    <div className={`dc-factor-columns dc-factor-columns--${layout}`}>
      {columns.map((column, columnIndex) => (
        <div className="dc-factor-column" key={`${layout}-${columnIndex}`}>
          {column.map(factor => (
            <FactorBlock
              key={factor}
              country={country}
              factor={factor}
              history={history}
              benchmarks={benchmarks}
              layout={layout}
              headingId={`${idPrefix}-${layout}-${factor}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

FactorColumns.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
  country: PropTypes.object.isRequired,
  history: PropTypes.arrayOf(PropTypes.object).isRequired,
  benchmarks: PropTypes.shape({
    global: PropTypes.object.isRequired,
    regional: PropTypes.object.isRequired,
  }).isRequired,
  layout: PropTypes.oneOf(['vertical', 'horizontal']).isRequired,
  idPrefix: PropTypes.string.isRequired,
};

function VerticalPaper({ country, history, benchmarks, year, idPrefix }) {
  const globalAverage = history.at(-1)?.__global ?? benchmarks.global.overall;
  return (
    <svg
      className="dc-paper-svg dc-paper-svg--vertical"
      viewBox="0 0 612 792"
      role="group"
      aria-label={`Vertical ten-edition country profile prototype for ${country.country}`}
    >
      <foreignObject width="612" height="792">
        <article xmlns="http://www.w3.org/1999/xhtml" className="dc-paper dc-paper--vertical">
          <PaperHeader country={country} year={year} editions={history} layout="vertical" />
          <div className="dc-vertical-summary">
            <OverallCard
              country={country}
              points={history}
              globalAverage={globalAverage}
              layout="vertical"
            />
            <ScoreChart
              points={history}
              countryName={country.country}
              region={country.region}
              layout="vertical"
            />
          </div>
          <div className="dc-factor-heading">
            <h3>Factor Score</h3>
            <BenchmarkLegend />
          </div>
          <FactorColumns
            columns={VERTICAL_COLUMNS}
            country={country}
            history={history}
            benchmarks={benchmarks}
            layout="vertical"
            idPrefix={idPrefix}
          />
          <PaperFooter year={year} />
        </article>
      </foreignObject>
    </svg>
  );
}

VerticalPaper.propTypes = {
  country: PropTypes.object.isRequired,
  history: PropTypes.arrayOf(PropTypes.object).isRequired,
  benchmarks: PropTypes.shape({
    global: PropTypes.object.isRequired,
    regional: PropTypes.object.isRequired,
  }).isRequired,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  idPrefix: PropTypes.string.isRequired,
};

function HorizontalPaper({ country, history, benchmarks, year, idPrefix }) {
  const globalAverage = history.at(-1)?.__global ?? benchmarks.global.overall;
  return (
    <svg
      className="dc-paper-svg dc-paper-svg--horizontal"
      viewBox="0 0 792 612"
      role="group"
      aria-label={`Horizontal five-year country profile prototype for ${country.country}`}
    >
      <foreignObject width="792" height="612">
        <article xmlns="http://www.w3.org/1999/xhtml" className="dc-paper dc-paper--horizontal">
          <div className="dc-horizontal-top">
            <div>
              <PaperHeader country={country} year={year} editions={history} layout="horizontal" />
              <ScoreChart
                points={history}
                countryName={country.country}
                region={country.region}
                showGlobal={false}
                layout="horizontal"
              />
            </div>
            <OverallCard
              country={country}
              points={history}
              globalAverage={globalAverage}
              layout="horizontal"
            />
          </div>
          <div className="dc-factor-heading dc-factor-heading--horizontal">
            <h3>Factor Score</h3>
            <BenchmarkLegend />
          </div>
          <FactorColumns
            columns={HORIZONTAL_COLUMNS}
            country={country}
            history={history}
            benchmarks={benchmarks}
            layout="horizontal"
            idPrefix={idPrefix}
          />
          <PaperFooter year={year} />
        </article>
      </foreignObject>
    </svg>
  );
}

HorizontalPaper.propTypes = {
  country: PropTypes.object.isRequired,
  history: PropTypes.arrayOf(PropTypes.object).isRequired,
  benchmarks: PropTypes.shape({
    global: PropTypes.object.isRequired,
    regional: PropTypes.object.isRequired,
  }).isRequired,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  idPrefix: PropTypes.string.isRequired,
};

function countryOptionValue(country, index) {
  return String(country.code ?? country.country ?? index);
}

function DesignComparison({ countries = [], historicalAverages = [], year = '—' }) {
  const idPrefix = useId().replaceAll(':', '');
  const orderedCountries = useMemo(
    () => [...countries].sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')),
    [countries],
  );
  const peru = orderedCountries.find(country => (
    country.code === 'PER' || country.country?.localeCompare('Peru', undefined, { sensitivity: 'base' }) === 0
  ));
  const [selectedCode, setSelectedCode] = useState(() => (
    peru ? countryOptionValue(peru, orderedCountries.indexOf(peru)) : ''
  ));
  const [exportsByLayout, setExportsByLayout] = useState({
    vertical: { busy: false, completed: 0, total: 0, error: null },
    horizontal: { busy: false, completed: 0, total: 0, error: null },
  });
  const selectedCountry = orderedCountries.find(
    (country, index) => countryOptionValue(country, index) === selectedCode,
  ) ?? peru ?? orderedCountries[0] ?? null;
  const selectedValue = selectedCountry
    ? countryOptionValue(selectedCountry, orderedCountries.indexOf(selectedCountry))
    : '';

  const preparedHistory = useMemo(
    () => prepareHistory(selectedCountry?.history),
    [selectedCountry],
  );
  const verticalBase = preparedHistory.slice(-10);
  const from2020 = preparedHistory.filter(entry => editionOrder(entry) >= 2020);
  const horizontalBase = (from2020.length >= 2 ? from2020 : preparedHistory.slice(-6)).slice(-6);
  const verticalHistory = attachBenchmarks(
    verticalBase,
    historicalAverages,
    selectedCountry?.region,
  );
  const horizontalHistory = attachBenchmarks(
    horizontalBase,
    historicalAverages,
    selectedCountry?.region,
  );
  const benchmarks = useMemo(
    () => buildCurrentBenchmarks(countries, selectedCountry?.region),
    [countries, selectedCountry?.region],
  );
  const displayYear = year ?? editionLabel(preparedHistory.at(-1));
  const exporting = exportsByLayout.vertical.busy || exportsByLayout.horizontal.busy;

  const updateExportState = (layout, nextState) => {
    setExportsByLayout(current => ({
      ...current,
      [layout]: {
        ...current[layout],
        ...(typeof nextState === 'function' ? nextState(current[layout]) : nextState),
      },
    }));
  };

  const downloadAllCountries = async layout => {
    const total = orderedCountries.length;
    updateExportState(layout, {
      busy: true,
      completed: 0,
      total,
      error: null,
    });

    try {
      await exportPrototypeCountriesPdf({
        countries,
        historicalAverages,
        year,
        layout,
        onProgress: (progress, progressTotal) => {
          const completed = typeof progress === 'number'
            ? progress
            : progress?.completed ?? progress?.current ?? 0;
          const nextTotal = typeof progressTotal === 'number'
            ? progressTotal
            : progress?.total ?? total;
          updateExportState(layout, {
            completed,
            total: nextTotal,
          });
        },
      });
      updateExportState(layout, {
        busy: false,
        completed: total,
        total,
      });
    } catch (error) {
      updateExportState(layout, {
        busy: false,
        error: error instanceof Error ? error.message : 'The PDF could not be generated.',
      });
    }
  };

  const dismissExportError = layout => updateExportState(layout, { error: null });

  if (!selectedCountry) {
    return (
      <section className="design-comparison dc-empty" role="status">
        No country data is available for the design prototypes.
      </section>
    );
  }

  return (
    <section className="design-comparison" aria-labelledby={`${idPrefix}-comparison-title`}>
      <header className="dc-comparison-header">
        <div>
          <span className="dc-section-kicker">Design study</span>
          <h2 id={`${idPrefix}-comparison-title`}>Country profile prototypes</h2>
          <p>
            The same live dataset rendered in two editorial formats. Select a country to compare
            the ten-edition portrait profile with the five-year landscape profile.
          </p>
        </div>
        <div className="dc-comparison-controls">
          <label className="dc-country-picker">
            <span>Country</span>
            <select value={selectedValue} onChange={event => setSelectedCode(event.target.value)}>
              {orderedCountries.map((country, index) => (
                <option key={countryOptionValue(country, index)} value={countryOptionValue(country, index)}>
                  {country.country}
                </option>
              ))}
            </select>
          </label>
          <div className="dc-download-actions" aria-label="Download all country profiles">
            {['vertical', 'horizontal'].map(layout => {
              const exportState = exportsByLayout[layout];
              const layoutLabel = layout === 'vertical' ? 'vertical' : 'horizontal';
              return (
                <button
                  aria-busy={exportState.busy}
                  className="dc-download-button"
                  disabled={exporting}
                  key={layout}
                  onClick={() => downloadAllCountries(layout)}
                  type="button"
                >
                  <span aria-live="polite">
                    {exportState.busy
                      ? `Generating ${exportState.completed}/${exportState.total}`
                      : `Download ${layoutLabel} PDF (${orderedCountries.length} countries)`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="dc-export-messages">
            {['vertical', 'horizontal'].map(layout => {
              const exportState = exportsByLayout[layout];
              if (!exportState.error) return null;
              return (
                <div className="dc-export-error" key={layout} role="alert">
                  <p>
                    <strong>{layout === 'vertical' ? 'Vertical' : 'Horizontal'} PDF failed.</strong>{' '}
                    {exportState.error}
                  </p>
                  <div>
                    <button
                      disabled={exporting}
                      onClick={() => downloadAllCountries(layout)}
                      type="button"
                    >
                      Retry
                    </button>
                    <button onClick={() => dismissExportError(layout)} type="button">
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {preparedHistory.length < 2 ? (
        <div className="dc-empty" role="status">
          Historical data is required to preview the prototypes for {selectedCountry.country}.
          {' '}The all-country PDF downloads remain available above.
        </div>
      ) : (
        <div className="dc-preview-grid">
          <section className="dc-preview-card" aria-labelledby={`${idPrefix}-vertical-title`}>
            <header className="dc-preview-heading">
              <div>
                <span className="dc-format-number">01</span>
                <div>
                  <h3 id={`${idPrefix}-vertical-title`}>Vertical · 10 editions</h3>
                  <p>Letter portrait · 612 × 792 pt · factor rankings</p>
                </div>
              </div>
              <span className="dc-status-pill">Prototype</span>
            </header>
            <div className="dc-paper-stage dc-paper-stage--vertical">
              <VerticalPaper
                country={selectedCountry}
                history={verticalHistory}
                benchmarks={benchmarks}
                year={displayYear}
                idPrefix={idPrefix}
              />
            </div>
          </section>

          <section className="dc-preview-card" aria-labelledby={`${idPrefix}-horizontal-title`}>
            <header className="dc-preview-heading">
              <div>
                <span className="dc-format-number">02</span>
                <div>
                  <h3 id={`${idPrefix}-horizontal-title`}>Horizontal · 5 years</h3>
                  <p>Letter landscape · 792 × 612 pt · factor trends</p>
                </div>
              </div>
              <span className="dc-status-pill">Prototype</span>
            </header>
            <div className="dc-paper-stage dc-paper-stage--horizontal">
              <HorizontalPaper
                country={selectedCountry}
                history={horizontalHistory}
                benchmarks={benchmarks}
                year={displayYear}
                idPrefix={idPrefix}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

DesignComparison.propTypes = {
  countries: PropTypes.arrayOf(PropTypes.object),
  historicalAverages: PropTypes.arrayOf(PropTypes.object),
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default memo(DesignComparison);
