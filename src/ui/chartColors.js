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
