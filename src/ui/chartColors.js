// Colors drawn from the validated reference palette (categorical slots 1 and
// 3), assigned by identity and used consistently everywhere that metric
// appears: slot 1 (blue) always means "churned customers / count", slot 3
// (aqua) always means "revenue". Never reassigned per-chart.
const LIGHT = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  count: '#2a78d6',
  countSelected: '#184f95',
  revenue: '#1baf7a',
  revenueSelected: '#0d6b48',
};

const DARK = {
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  count: '#3987e5',
  countSelected: '#184f95',
  revenue: '#199e70',
  revenueSelected: '#0d6b48',
};

export function getChartColors() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? DARK : LIGHT;
}

// The validated 8-hue categorical palette, fixed order (never re-sorted by
// rank/count). Used for "each bar/slice its own color" widgets (segment and
// reason/subreason breakdowns), per the requested Salesforce-dashboard look.
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

// Stable label -> palette-index assignment per dimension, so a given label
// (e.g. "SME", "Pricing") always gets the same color no matter how sorting
// or the currently-visible set of other labels changes across renders/
// filters ("color follows the entity, never its rank"). Cycles past 8
// distinct labels (repeats colors) rather than failing, since fields like
// Churn Reason can plausibly have more than 8 values in real data.
const labelColorIndex = new Map(); // dimensionKey -> Map<label, index>

export function resetCategoricalColors() {
  labelColorIndex.clear();
}

function getOrAssignIndex(dimensionKey, label) {
  if (!labelColorIndex.has(dimensionKey)) labelColorIndex.set(dimensionKey, new Map());
  const dimMap = labelColorIndex.get(dimensionKey);
  if (!dimMap.has(label)) dimMap.set(label, dimMap.size % CATEGORICAL_LIGHT.length);
  return dimMap.get(label);
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The stable color for one label within one dimension (e.g. dimensionKey
// 'reason', label 'Pricing'). Exposed directly (not just via the
// per-labels-array helper below) so widgets that need to combine two
// dimensions at once (e.g. segment x reason) can look up a single label's
// color without recomputing a whole array.
export function getCategoricalColorForLabel(dimensionKey, label) {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const ramp = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return ramp[getOrAssignIndex(dimensionKey, label)];
}

// Dims a color (reduced alpha) rather than recoloring it, so identity (hue)
// never changes on click/selection - only emphasis does.
export function applyDim(hex, dimmed) {
  return dimmed ? hexToRgba(hex, 0.35) : hex;
}

// Returns one color per label, stable per dimensionKey. When `selected` is
// non-null, non-selected labels are dimmed rather than recolored.
export function getCategoricalColorsForLabels(dimensionKey, labels, selected = null) {
  return labels.map((label) => applyDim(
    getCategoricalColorForLabel(dimensionKey, label),
    selected !== null && label !== selected,
  ));
}
