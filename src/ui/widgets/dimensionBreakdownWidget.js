// Generic breakdown for files that are not the Phase 1 churn export: case
// counts (and value, when a value column exists) by any detected dimension.
//
// The churn widgets know what a "segment" and a "churn reason" are. This
// one knows only that some columns are categorical, which is all a
// complaints or NPS export can promise.

import { Chart } from '../chartSetup.js';
import { getChartColors, getCategoricalColorsForLabels } from '../chartColors.js';
import { setActiveDimension } from '../../state/store.js';
import { dimensionsFor, ROLE } from '../../lib/roles.js';
import { buildRecords, amountIsPerEntity } from '../../lib/findings.js';
import { escapeHtml, formatNumber } from '../utils.js';

let countChart = null;
let valueChart = null;

function destroyCharts() {
  if (countChart) { countChart.destroy(); countChart = null; }
  if (valueChart) { valueChart.destroy(); valueChart = null; }
}

export function render(container, state) {
  const dimensions = dimensionsFor(state.columnProfiles, state.roles);
  if (dimensions.length === 0) {
    destroyCharts();
    container.innerHTML = '<div class="widget"><p class="hint">No categorical columns were detected to break this file down by.</p></div>';
    return;
  }

  const active = dimensions.includes(state.activeDimension) ? state.activeDimension : dimensions[0];
  const records = buildRecords(state.rawRows, state.roles, dimensions);
  const perEntity = amountIsPerEntity(records);
  const hasAmount = Boolean(state.roles[ROLE.AMOUNT]);

  const buckets = new Map();
  const seenEntities = new Map(); // per-entity amounts must not be double counted
  let blank = 0;
  for (const record of records) {
    const value = record.dims[active];
    if (value === null) { blank += 1; continue; }
    if (!buckets.has(value)) buckets.set(value, { count: 0, amount: 0 });
    const bucket = buckets.get(value);
    bucket.count += 1;
    if (record.amount !== null) {
      if (perEntity) {
        const key = `${value}|${record.entity}`;
        if (!seenEntities.has(key)) {
          seenEntities.set(key, true);
          bucket.amount += record.amount;
        }
      } else {
        bucket.amount += record.amount;
      }
    }
  }

  const entries = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20);
  const labels = entries.map(([value]) => value);
  const colors = getChartColors();
  const barColors = getCategoricalColorsForLabels(`dimension:${active}`, labels);

  destroyCharts();
  container.innerHTML = `
    <div class="widget widget-wide dimension-breakdown-widget">
      <div class="widget-header">
        <h3>Breakdown by column</h3>
        <select id="dimension-select">
          ${dimensions.map((d) => `<option value="${escapeHtml(d)}" ${d === active ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
        </select>
      </div>
      ${blank > 0 ? `<p class="hint">${formatNumber(blank)} rows have no value for this column and are excluded.</p>` : ''}
      <div class="${hasAmount ? 'chart-pair' : ''}">
        <div>
          <p class="chart-caption">Cases</p>
          <div class="chart-wrap chart-wrap-small"><canvas id="dimension-count-canvas"></canvas></div>
        </div>
        ${hasAmount ? `
          <div>
            <p class="chart-caption">${escapeHtml(state.roles[ROLE.AMOUNT])}${perEntity ? ' (once per customer)' : ''}</p>
            <div class="chart-wrap chart-wrap-small"><canvas id="dimension-value-canvas"></canvas></div>
          </div>` : ''}
      </div>
    </div>
  `;

  container.querySelector('#dimension-select').addEventListener('change', (e) => {
    setActiveDimension(e.target.value);
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: colors.textMuted }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: colors.textMuted }, grid: { color: colors.gridline } },
    },
  };

  countChart = new Chart(container.querySelector('#dimension-count-canvas'), {
    type: 'bar',
    data: { labels, datasets: [{ data: entries.map(([, b]) => b.count), backgroundColor: barColors }] },
    options,
  });

  if (hasAmount) {
    valueChart = new Chart(container.querySelector('#dimension-value-canvas'), {
      type: 'bar',
      data: { labels, datasets: [{ data: entries.map(([, b]) => Math.round(b.amount)), backgroundColor: barColors }] },
      options,
    });
  }
}
