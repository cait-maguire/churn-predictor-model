import { Chart } from '../chartSetup.js';
import { getChartColors, getCategoricalColorsForLabels } from '../chartColors.js';
import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { toggleFilter } from '../../state/store.js';
import { escapeHtml, formatNumber } from '../utils.js';

let reasonChart = null;
let subreasonChart = null;

function countBy(customers, getKey) {
  const counts = new Map();
  let blankCount = 0;
  for (const customer of customers) {
    const value = getKey(customer);
    if (value === null || value === undefined || value === '') { blankCount += 1; continue; }
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return { counts, blankCount };
}

export function render(container, state) {
  const forReasons = computeFilteredExcluding(state, ['reason', 'subreason']);
  const { counts: reasonCounts, blankCount: reasonBlankCount } = countBy(forReasons, (c) => c.canonicalCase.churnReason);
  const reasonEntries = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);

  const showSubreason = state.filters.churnReason !== null;
  let subreasonEntries = [];
  let subreasonBlankCount = 0;
  if (showSubreason) {
    const forSubreasons = computeFilteredExcluding(state, ['subreason']);
    const result = countBy(forSubreasons, (c) => c.canonicalCase.churnSubreason);
    subreasonEntries = [...result.counts.entries()].sort((a, b) => b[1] - a[1]);
    subreasonBlankCount = result.blankCount;
  }

  container.innerHTML = `
    <div class="widget reason-breakdown-widget">
      <h3>Churn reason breakdown</h3>
      <p class="hint">Customer-level: each churned customer counts once, by the reason on their most recent churn case.</p>
      ${state.filters.churnReason !== null ? `<p class="hint">Filtered to reason: <strong>${escapeHtml(state.filters.churnReason)}</strong> — click its bar again, or <button type="button" id="clear-reason-filter" class="link-btn">clear</button></p>` : ''}
      ${reasonEntries.length === 0
        ? '<p class="hint">No churn reasons found in the current selection.</p>'
        : '<div class="chart-wrap"><canvas id="reason-canvas"></canvas></div>'}
      ${reasonBlankCount > 0 ? `<p class="hint">${formatNumber(reasonBlankCount)} churned customers have no Churn Reason recorded.</p>` : ''}

      ${showSubreason ? `
        <h4>Subreason drill-down: ${escapeHtml(state.filters.churnReason)}</h4>
        ${state.filters.churnSubreason !== null ? `<p class="hint">Filtered to subreason: <strong>${escapeHtml(state.filters.churnSubreason)}</strong> — click its bar again, or <button type="button" id="clear-subreason-filter" class="link-btn">clear</button></p>` : ''}
        ${subreasonEntries.length === 0
          ? '<p class="hint">No subreasons recorded for this reason in the current selection.</p>'
          : '<div class="chart-wrap"><canvas id="subreason-canvas"></canvas></div>'}
        ${subreasonBlankCount > 0 ? `<p class="hint">${formatNumber(subreasonBlankCount)} churned customers with this reason have no Churn Subreason recorded.</p>` : ''}
      ` : ''}
    </div>
  `;

  const clearReasonBtn = container.querySelector('#clear-reason-filter');
  if (clearReasonBtn) clearReasonBtn.addEventListener('click', () => toggleFilter('churnReason', state.filters.churnReason));
  const clearSubreasonBtn = container.querySelector('#clear-subreason-filter');
  if (clearSubreasonBtn) clearSubreasonBtn.addEventListener('click', () => toggleFilter('churnSubreason', state.filters.churnSubreason));

  if (reasonChart) { reasonChart.destroy(); reasonChart = null; }
  if (subreasonChart) { subreasonChart.destroy(); subreasonChart = null; }

  const colors = getChartColors();

  if (reasonEntries.length > 0) {
    const labels = reasonEntries.map(([value]) => value);
    reasonChart = new Chart(container.querySelector('#reason-canvas'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: reasonEntries.map(([, count]) => count),
          backgroundColor: getCategoricalColorsForLabels('reason', labels, state.filters.churnReason),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (evt, elements) => {
          if (elements.length === 0) return;
          toggleFilter('churnReason', labels[elements[0].index]);
        },
        scales: { y: { beginAtZero: true, grid: { color: colors.gridline } }, x: { grid: { display: false } } },
      },
    });
  }

  if (showSubreason && subreasonEntries.length > 0) {
    const labels = subreasonEntries.map(([value]) => value);
    subreasonChart = new Chart(container.querySelector('#subreason-canvas'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: subreasonEntries.map(([, count]) => count),
          backgroundColor: getCategoricalColorsForLabels('subreason', labels, state.filters.churnSubreason),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (evt, elements) => {
          if (elements.length === 0) return;
          toggleFilter('churnSubreason', labels[elements[0].index]);
        },
        scales: { y: { beginAtZero: true, grid: { color: colors.gridline } }, x: { grid: { display: false } } },
      },
    });
  }
}
