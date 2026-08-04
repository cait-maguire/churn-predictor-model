import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

import { inlineDataLabels } from './dataLabels.js';

// Registered once, tree-shaken to bar-chart components only - every Phase 1
// widget is bar-chart-based, so no Pie/Line/Radar controllers are pulled in.
// Chart.js's own Legend is registered for completeness, but the widgets use
// HTML swatch legends instead (see legend.js) since their charts color each
// *bar* individually rather than per dataset, which the built-in legend
// cannot represent.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, inlineDataLabels);

Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
Chart.defaults.borderColor = '#e1e0d9';
Chart.defaults.color = '#898781';

export { Chart };
