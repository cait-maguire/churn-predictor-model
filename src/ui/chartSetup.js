import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

// Registered once, tree-shaken to bar-chart components only - every Phase 1
// widget is bar-chart-based, so no Pie/Line/Radar controllers are pulled in.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
Chart.defaults.borderColor = '#e1e0d9';
Chart.defaults.color = '#898781';

export { Chart };
