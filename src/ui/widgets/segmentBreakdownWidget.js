import { Chart } from '../chartSetup.js';
import { getChartColors, getCategoricalColorForLabel, getCategoricalColorsForLabels } from '../chartColors.js';
import { renderLegendHtml, bindLegend } from '../legend.js';
import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { SEGMENT_FIELDS } from '../../lib/fieldCatalog.js';
import { setActiveSegmentField, toggleFilter } from '../../state/store.js';
import { escapeHtml, formatNumber } from '../utils.js';

let countChart = null;
let revenueChart = null;

function getSegmentValue(customer, fieldKey) {
  return fieldKey === 'companyNo' ? customer.companyNo : customer.segments[fieldKey]?.value ?? null;
}

export function render(container, state) {
  const filtered = computeFilteredExcluding(state, ['segment']);
  const colors = getChartColors();

  const counts = new Map(); // value -> { count, revenue }
  let blankCount = 0;
  for (const customer of filtered) {
    const value = getSegmentValue(customer, state.activeSegmentField);
    if (value === null) { blankCount += 1; continue; }
    if (!counts.has(value)) counts.set(value, { count: 0, revenue: 0 });
    const bucket = counts.get(value);
    bucket.count += 1;
    bucket.revenue += customer.revenue ?? 0;
  }

  const entries = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  const labels = entries.map(([value]) => value);
  const selected = state.filters.segmentValue;

  container.innerHTML = `
    <div class="widget segment-breakdown-widget">
      <div class="widget-header">
        <h3>Churned customers &amp; revenue by segment</h3>
        <select id="segment-field-select">
          ${SEGMENT_FIELDS.map((f) => `<option value="${f.key}" ${f.key === state.activeSegmentField ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
      </div>
      ${selected !== null ? `<p class="hint">Filtered to: <strong>${escapeHtml(selected)}</strong> — click the bar again, or <button type="button" id="clear-segment-filter" class="link-btn">clear</button></p>` : ''}
      ${entries.length === 0 ? '<p class="hint">No values found for this segment field in the current selection.</p>' : `
        <div class="chart-pair">
          <div>
            <p class="chart-caption">Churned customers</p>
            <div class="chart-wrap chart-wrap-small"><canvas id="segment-count-canvas"></canvas></div>
          </div>
          <div>
            <p class="chart-caption">Revenue lost</p>
            <div class="chart-wrap chart-wrap-small"><canvas id="segment-revenue-canvas"></canvas></div>
          </div>
        </div>
        <div id="segment-legend">${renderLegendHtml(labels.map((l) => ({
          value: l,
          label: l,
          color: getCategoricalColorForLabel(`segment:${state.activeSegmentField}`, l),
          active: l === selected,
        })))}</div>
      `}
      ${blankCount > 0 ? `<p class="hint">${formatNumber(blankCount)} churned customers have no value for this segment field.</p>` : ''}
    </div>
  `;

  container.querySelector('#segment-field-select').addEventListener('change', (e) => {
    setActiveSegmentField(e.target.value);
  });
  const clearBtn = container.querySelector('#clear-segment-filter');
  if (clearBtn) clearBtn.addEventListener('click', () => toggleFilter('segmentValue', selected));
  const legendMount = container.querySelector('#segment-legend');
  if (legendMount) bindLegend(legendMount, (value) => toggleFilter('segmentValue', value));

  if (countChart) { countChart.destroy(); countChart = null; }
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  if (entries.length === 0) return;

  const onClick = (evt, elements) => {
    if (elements.length === 0) return;
    toggleFilter('segmentValue', labels[elements[0].index]);
  };

  // Each segment value gets its own color from the categorical palette
  // (stable per label, keyed by the active segment field so switching
  // fields doesn't mix unrelated label sets) - the same color is used in
  // both the count and revenue charts so a segment value reads as one
  // color across both.
  const barColors = getCategoricalColorsForLabels(`segment:${state.activeSegmentField}`, labels, selected);

  countChart = new Chart(container.querySelector('#segment-count-canvas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: entries.map(([, v]) => v.count),
        backgroundColor: barColors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick,
      scales: { y: { beginAtZero: true, grid: { color: colors.gridline } }, x: { grid: { display: false } } },
    },
  });

  revenueChart = new Chart(container.querySelector('#segment-revenue-canvas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: entries.map(([, v]) => Math.round(v.revenue)),
        backgroundColor: barColors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick,
      scales: { y: { beginAtZero: true, grid: { color: colors.gridline } }, x: { grid: { display: false } } },
    },
  });
}
