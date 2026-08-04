import { Chart } from '../chartSetup.js';
import { getChartColors } from '../chartColors.js';
import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { formatNumber } from '../utils.js';

const HISTOGRAM_THRESHOLD = 75; // above this many customers, switch to a binned histogram for legibility

let chartInstance = null;

export function render(container, state) {
  const filtered = computeFilteredExcluding(state, []).filter((c) => c.revenue !== null);

  container.innerHTML = `
    <div class="widget revenue-distribution-widget">
      <h3>Revenue per churned customer</h3>
      ${filtered.length === 0
        ? '<p class="hint">No churned customers with a usable Revenue value in the current selection.</p>'
        : '<div class="chart-wrap"><canvas id="revenue-distribution-canvas"></canvas></div>'}
    </div>
  `;

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (filtered.length === 0) return;

  const canvas = container.querySelector('#revenue-distribution-canvas');
  const sorted = [...filtered].sort((a, b) => b.revenue - a.revenue);

  const { labels, values } = sorted.length > HISTOGRAM_THRESHOLD
    ? buildHistogram(sorted)
    : {
        labels: sorted.map((c) => c.accountName || c.companyNo),
        values: sorted.map((c) => c.revenue),
      };

  const colors = getChartColors();
  const isHistogram = sorted.length > HISTOGRAM_THRESHOLD;

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: isHistogram ? colors.count : colors.revenue,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: isHistogram ? 'x' : 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.gridline, display: !isHistogram }, ticks: { autoSkip: true, maxRotation: 45 } },
        y: { grid: { color: colors.gridline, display: isHistogram } },
      },
    },
  });
}

function buildHistogram(sortedDescending) {
  const values = sortedDescending.map((c) => c.revenue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketCount = 12;
  const bucketSize = (max - min) / bucketCount || 1;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    from: min + i * bucketSize,
    to: min + (i + 1) * bucketSize,
    count: 0,
  }));

  for (const v of values) {
    let idx = Math.floor((v - min) / bucketSize);
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    buckets[idx].count += 1;
  }

  return {
    labels: buckets.map((b) => `${formatNumber(Math.round(b.from))}–${formatNumber(Math.round(b.to))}`),
    values: buckets.map((b) => b.count),
  };
}
