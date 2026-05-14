/**
 * WJP Rule of Law Index — 8 factors and their subfactors.
 *
 * This is the single source of truth for the data shape. Both the on-screen
 * chart and the SVG export iterate over this. If WJP ever revises the index,
 * you change it here and the rest follows.
 */
export const FACTOR_STRUCTURE = [
  { factor: 'f1', subfactors: ['sf11', 'sf12', 'sf13', 'sf14', 'sf15', 'sf16'] },
  { factor: 'f2', subfactors: ['sf21', 'sf22', 'sf23', 'sf24'] },
  { factor: 'f3', subfactors: ['sf31', 'sf32', 'sf33', 'sf34'] },
  { factor: 'f4', subfactors: ['sf41', 'sf42', 'sf43', 'sf44', 'sf45', 'sf46', 'sf47', 'sf48'] },
  { factor: 'f5', subfactors: ['sf51', 'sf52', 'sf53'] },
  { factor: 'f6', subfactors: ['sf61', 'sf62', 'sf63', 'sf64', 'sf65'] },
  { factor: 'f7', subfactors: ['sf71', 'sf72', 'sf73', 'sf74', 'sf75', 'sf76', 'sf77'] },
  { factor: 'f8', subfactors: ['sf81', 'sf82', 'sf83', 'sf84', 'sf85', 'sf86', 'sf87'] },
];

/**
 * Region keys exactly as they appear in the WJP source data.
 * '__global__' is a synthetic value for the "All regions / global" option.
 */
export const REGIONS = [
  '__global__',
  'EU, EFTA, and North America',
  'East Asia and Pacific',
  'Eastern Europe and Central Asia',
  'Latin America and Caribbean',
  'Middle East and North Africa',
  'South Asia',
  'Sub-Saharan Africa',
];

export const REGION_LABELS = {
  __global__: 'All regions (Global)',
  'EU, EFTA, and North America': 'EU, EFTA, and North America',
  'East Asia and Pacific': 'East Asia and Pacific',
  'Eastern Europe and Central Asia': 'Eastern Europe and Central Asia',
  'Latin America and Caribbean': 'Latin America and Caribbean',
  'Middle East and North Africa': 'Middle East and North Africa',
  'South Asia': 'South Asia',
  'Sub-Saharan Africa': 'Sub-Saharan Africa',
};

export const REGIONAL_AVG_KEY = '__regional_avg__';
