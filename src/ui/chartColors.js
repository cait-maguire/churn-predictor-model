// Chart chrome plus the two identity colors: slot 1 always means "churned
// customers / count", slot 3 always means "revenue". Never reassigned
// per-chart. Both are taken from the categorical palette below so a metric
// reads the same everywhere it appears.
const LIGHT = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  count: '#87b6f4',
  revenue: '#61b58e',
};

const DARK = {
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  count: '#6997d1',
  revenue: '#4da27d',
};

export function getChartColors() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? DARK : LIGHT;
}

// The 8-hue categorical palette, fixed order (never re-sorted by
// rank/count). Used for "each bar/slice its own color" widgets (segment and
// reason/subreason breakdowns).
//
// These are the muted/pastel steps of the same eight hues as the original
// bold set - same hue angles and same order, lifted in lightness and pulled
// down in chroma. Each set was searched against the accessibility checks
// rather than picked by eye, and both clear every hard gate:
//   light: CVD ΔE 8.1, normal-vision ΔE 15.1
//   dark:  CVD ΔE 8.0, normal-vision ΔE 15.0
// Pastels sit below 3:1 contrast on the light surface by nature; the
// mitigation is the data label on every bar plus the text legend, so a
// color never carries meaning alone. If these are ever re-tuned, re-run the
// validator - going paler or greyer from here starts failing the CVD gate.
const CATEGORICAL_LIGHT = ['#87b6f4', '#ee855e', '#61b58e', '#e3a74a', '#ec96b4', '#7ab275', '#ababf4', '#ee9992'];
const CATEGORICAL_DARK = ['#6997d1', '#db724d', '#4da27d', '#c98500', '#ca7790', '#5b9157', '#9085e9', '#e26a6a'];

// Stable label -> palette-index assignment per dimension, so a given label
// (e.g. "SME", "Pricing") always gets the same color no matter how sorting
// or the currently-visible set of other labels changes across renders/
// filters ("color follows the entity, never its rank"). Cycles past 8
// distinct labels (repeats colors) rather than failing, since fields like
// Churn Reason can plausibly have more than 8 values in real data.
const labelColorIndex = new Map(); // dimensionKey -> Map<label, index>

export function resetCategoricalColors() {
  labelColorIndex.clear();
  subreasonIndexByReason.clear();
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

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function mixHex(hex, targetHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

// Subreasons are colored as shades of their parent reason's hue, so the
// relationship reads visually (e.g. every "Service Experience" subreason is
// a variant of that reason's blue). Shades alternate lighter/darker away
// from the base color; the darkening target is kept above the dark surface
// in dark mode so a deep shade never disappears into the background.
// Base colors are already pale, so there is far more usable range below them
// than above: darkening leads, and the lightening steps stay small enough
// that a shade never washes out into the surface.
const SUBREASON_SHADE_STEPS = [
  [null, 0],        // the parent reason's own base color
  ['dark', 0.24],
  ['light', 0.30],
  ['dark', 0.42],
  ['light', 0.50],
  ['dark', 0.58],
  ['light', 0.66],
];

// subreason index is scoped per parent reason, so shade assignment restarts
// for each reason's own list of subreasons.
const subreasonIndexByReason = new Map(); // reason -> Map<subreason, index>

function getSubreasonIndex(reason, subreason) {
  if (!subreasonIndexByReason.has(reason)) subreasonIndexByReason.set(reason, new Map());
  const m = subreasonIndexByReason.get(reason);
  if (!m.has(subreason)) m.set(subreason, m.size);
  return m.get(subreason);
}

export function getSubreasonColor(reason, subreason) {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  // A subreason with no known parent reason falls back to its own
  // categorical slot rather than borrowing an unrelated reason's hue.
  if (reason === null || reason === undefined || reason === '') {
    return getCategoricalColorForLabel('subreason', subreason);
  }
  const base = getCategoricalColorForLabel('reason', reason);
  const [direction, amount] = SUBREASON_SHADE_STEPS[getSubreasonIndex(reason, subreason) % SUBREASON_SHADE_STEPS.length];
  if (direction === null) return base;
  if (direction === 'light') return mixHex(base, '#ffffff', amount);
  // Darkening target differs by mode so dark-mode shades stay off the surface.
  return mixHex(base, isDark ? '#4a4a46' : '#141413', isDark ? Math.min(amount, 0.4) : amount);
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
