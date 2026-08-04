// ---------------------------------------------------------------------------
// The approved palette. Every colour the charts draw comes from this list and
// nothing else, in both light and dark mode.
//
// Grouped into hue families, because subreasons are coloured using other
// members of their parent reason's family (see getSubreasonColor) rather than
// by generating lighter/darker tints - generating tints would invent colours
// outside the approved set.
//
// Within each family, members are listed strongest-first (by contrast against
// a white card), so the faintest tones are only reached when a reason has
// three or more subreasons.
// ---------------------------------------------------------------------------
const FAMILIES = [
  { name: 'blue', members: ['#4b72ee', '#7b8eed', '#74b2f5'] },       // royal, periwinkle, sky
  { name: 'purple', members: ['#9b4eea', '#c08fee'] },                 // violet, orchid
  { name: 'pink', members: ['#f0899e', '#f49be2', '#f5d3ef'] },        // salmon rose, orchid pink, pale pink
  { name: 'green', members: ['#8ccc46', '#78e294', '#c4ef9b'] },       // apple, mint, light lime
  { name: 'orange', members: ['#f0a05a', '#f3c89a', '#efd79b'] },      // orange, peach, sand
];

const ALL_PALETTE = FAMILIES.flatMap((f) => f.members);

// The eight categorical slots, in a fixed order (never re-sorted by rank).
// Both the subset and the order were chosen by scoring options against the
// colour-blind separation checks (adjacent CVD ΔE 13.6, normal-vision 21.0),
// under one extra constraint: the first five slots come from five DIFFERENT
// hue families. Most charts here show four to six categories, and a purely
// separation-optimal order front-loaded three blues, which measured fine but
// looked muddled. Leading with blue also keeps slot 1 matching the "churned
// customers" identity colour used on the stat tile.
//
// Five of the fourteen palette colours (pale pink, sand, peach, light lime,
// mint) are too faint against a white card to carry a whole series - 1.3-1.6:1
// contrast - so they are held back for subreason drill-downs, where there are
// few bars and every one carries a data label.
//
// The same hexes serve both light and dark mode: they are light tones, so
// they sit comfortably above 3:1 on the dark surface, and re-stepping them
// for dark would mean inventing colours outside the approved set.
const CATEGORICAL = [
  '#74b2f5', // sky blue
  '#f0a05a', // orange
  '#9b4eea', // violet
  '#8ccc46', // apple green
  '#f49be2', // orchid pink
  '#4b72ee', // royal blue
  '#f0899e', // salmon rose
  '#7b8eed', // periwinkle
];

// Chart chrome. The two identity colours - slot 1 always means "churned
// customers / count", apple green always means "revenue" - are drawn from
// the palette and never reassigned per chart.
const LIGHT = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  count: '#74b2f5',
  revenue: '#8ccc46',
};

const DARK = {
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  count: '#74b2f5',
  revenue: '#8ccc46',
};

export function getChartColors() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? DARK : LIGHT;
}

// Stable label -> slot assignment per dimension, so a given label (e.g. "SME",
// "Pricing") always keeps its colour no matter how sorting or the visible set
// of other labels changes ("colour follows the entity, never its rank").
// Cycles past 8 distinct labels rather than failing, since a field like Churn
// Reason can plausibly have more than eight values.
const labelColorIndex = new Map(); // dimensionKey -> Map<label, index>
const subreasonIndexByReason = new Map(); // reason -> Map<subreason, index>

export function resetCategoricalColors() {
  labelColorIndex.clear();
  subreasonIndexByReason.clear();
}

function getOrAssignIndex(dimensionKey, label) {
  if (!labelColorIndex.has(dimensionKey)) labelColorIndex.set(dimensionKey, new Map());
  const dimMap = labelColorIndex.get(dimensionKey);
  if (!dimMap.has(label)) dimMap.set(label, dimMap.size % CATEGORICAL.length);
  return dimMap.get(label);
}

export function getCategoricalColorForLabel(dimensionKey, label) {
  return CATEGORICAL[getOrAssignIndex(dimensionKey, label)];
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Dims a colour rather than recolouring it, so identity (hue) never changes
// on click/selection - only emphasis does.
export function applyDim(hex, dimmed) {
  return dimmed ? hexToRgba(hex, 0.35) : hex;
}

export function getCategoricalColorsForLabels(dimensionKey, labels, selected = null) {
  return labels.map((label) => applyDim(
    getCategoricalColorForLabel(dimensionKey, label),
    selected !== null && label !== selected,
  ));
}

// Subreasons take other members of their parent reason's hue family, so a
// reason's subreasons still read as one family - without inventing any colour
// outside the approved palette. A reason with more subreasons than its family
// has members falls through to the rest of the palette, skipping colours the
// family already used.
function familyOrderFor(parentColor) {
  const family = FAMILIES.find((f) => f.members.includes(parentColor));
  const head = family ? [parentColor, ...family.members.filter((m) => m !== parentColor)] : [parentColor];
  return [...head, ...ALL_PALETTE.filter((c) => !head.includes(c))];
}

function getSubreasonIndex(reason, subreason) {
  if (!subreasonIndexByReason.has(reason)) subreasonIndexByReason.set(reason, new Map());
  const m = subreasonIndexByReason.get(reason);
  if (!m.has(subreason)) m.set(subreason, m.size);
  return m.get(subreason);
}

export function getSubreasonColor(reason, subreason) {
  // A subreason with no known parent reason falls back to its own categorical
  // slot rather than borrowing an unrelated reason's hue.
  if (reason === null || reason === undefined || reason === '') {
    return getCategoricalColorForLabel('subreason', subreason);
  }
  const order = familyOrderFor(getCategoricalColorForLabel('reason', reason));
  return order[getSubreasonIndex(reason, subreason) % order.length];
}
