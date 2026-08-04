import { Chart } from '../chartSetup.js';
import { getChartColors, getCategoricalColorForLabel, getSubreasonColor, applyDim } from '../chartColors.js';
import { renderLegendHtml, bindLegend } from '../legend.js';
import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { SEGMENT_FIELDS } from '../../lib/fieldCatalog.js';
import { setActiveSegmentField, setSegmentReasonFilter, toggleFilter } from '../../state/store.js';
import { buildSegmentMatrix } from './segmentMatrix.js';
import { escapeHtml, formatNumber } from '../utils.js';

let mainChart = null;
let subreasonChart = null;

export function render(container, state) {
  const colors = getChartColors();

  // Both segment and reason (and its subreason drill-down) are "owned" by
  // this widget's own axes, so they're excluded here - the chart always
  // shows the full segment x reason matrix; active filters only change
  // which slice is highlighted vs. dimmed, never which bars appear.
  const base = computeFilteredExcluding(state, ['segment', 'reason', 'subreason']);
  const {
    matrix, segmentTotals, segmentValues, categories: reasons, blankSegmentCount, blankCategoryCount,
  } = buildSegmentMatrix(base, state.activeSegmentField, (c) => c.canonicalCase.churnReason);

  const activeSegment = state.filters.segmentValue;
  const activeReason = state.filters.churnReason;
  const comboActive = activeSegment !== null && activeReason !== null;

  const showSubreason = comboActive;
  let subEntries = [];
  let subBlankCount = 0;
  if (showSubreason) {
    const forSub = computeFilteredExcluding(state, ['subreason']);
    const counts = new Map();
    for (const c of forSub) {
      const sr = c.canonicalCase.churnSubreason;
      if (sr === null || sr === undefined || sr === '') { subBlankCount += 1; continue; }
      counts.set(sr, (counts.get(sr) || 0) + 1);
    }
    subEntries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  const legendItems = reasons.map((reason) => ({
    value: reason,
    label: reason,
    color: getCategoricalColorForLabel('reason', reason),
    active: reason === activeReason,
  }));

  container.innerHTML = `
    <div class="widget widget-wide segment-reason-widget">
      <div class="widget-header">
        <h3>Churned customers by segment &amp; churn reason</h3>
        <select id="segreason-field-select">
          ${SEGMENT_FIELDS.map((f) => `<option value="${f.key}" ${f.key === state.activeSegmentField ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
      </div>
      <p class="hint">Each bar is one segment value; its height is the total churned customers in that segment, split into colored slices by churn reason. Click a slice to drill into subreason.</p>
      ${comboActive ? `<p class="hint">Filtered to: <strong>${escapeHtml(activeSegment)}</strong> &rarr; <strong>${escapeHtml(activeReason)}</strong> — click that slice again, or <button type="button" id="clear-segreason-filter" class="link-btn">clear</button></p>` : ''}
      ${segmentValues.length === 0
        ? '<p class="hint">No segment + reason data available in the current selection.</p>'
        : `<div class="chart-wrap"><canvas id="segment-reason-canvas"></canvas></div>
           <div id="segreason-legend">${renderLegendHtml(legendItems)}</div>`}
      ${blankSegmentCount > 0 ? `<p class="hint">${formatNumber(blankSegmentCount)} churned customers have no value for this segment field.</p>` : ''}
      ${blankCategoryCount > 0 ? `<p class="hint">${formatNumber(blankCategoryCount)} churned customers (with a segment value) have no Churn Reason recorded.</p>` : ''}

      ${showSubreason ? `
        <h4>Subreason drill-down: ${escapeHtml(activeSegment)} &rarr; ${escapeHtml(activeReason)}</h4>
        ${state.filters.churnSubreason !== null ? `<p class="hint">Filtered to subreason: <strong>${escapeHtml(state.filters.churnSubreason)}</strong> — click its bar again, or <button type="button" id="clear-segreason-subreason-filter" class="link-btn">clear</button></p>` : ''}
        ${subEntries.length === 0
          ? '<p class="hint">No subreasons recorded for this segment + reason combination.</p>'
          : '<div class="chart-wrap chart-wrap-small"><canvas id="segment-reason-subreason-canvas"></canvas></div>'}
        ${subBlankCount > 0 ? `<p class="hint">${formatNumber(subBlankCount)} of these customers have no Churn Subreason recorded.</p>` : ''}
      ` : ''}
    </div>
  `;

  container.querySelector('#segreason-field-select').addEventListener('change', (e) => {
    setActiveSegmentField(e.target.value);
  });
  const clearBtn = container.querySelector('#clear-segreason-filter');
  if (clearBtn) clearBtn.addEventListener('click', () => setSegmentReasonFilter(activeSegment, activeReason));
  const clearSubBtn = container.querySelector('#clear-segreason-subreason-filter');
  if (clearSubBtn) clearSubBtn.addEventListener('click', () => toggleFilter('churnSubreason', state.filters.churnSubreason));

  const legendMount = container.querySelector('#segreason-legend');
  if (legendMount) bindLegend(legendMount, (reason) => toggleFilter('churnReason', reason));

  if (mainChart) { mainChart.destroy(); mainChart = null; }
  if (subreasonChart) { subreasonChart.destroy(); subreasonChart = null; }
  if (segmentValues.length === 0) return;

  const xLabels = segmentValues.map((v) => `${v} (${formatNumber(segmentTotals.get(v))})`);
  const anyFilterActive = activeSegment !== null || activeReason !== null;

  const datasets = reasons.map((reason) => ({
    label: reason,
    data: segmentValues.map((segValue) => matrix.get(segValue)?.get(reason) || 0),
    backgroundColor: segmentValues.map((segValue) => {
      const isMatch = (activeSegment === null || activeSegment === segValue) && (activeReason === null || activeReason === reason);
      return applyDim(getCategoricalColorForLabel('reason', reason), anyFilterActive && !isMatch);
    }),
    borderRadius: 4,
  }));

  mainChart = new Chart(container.querySelector('#segment-reason-canvas'), {
    type: 'bar',
    data: { labels: xLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick: (evt, elements) => {
        if (elements.length === 0) return;
        const { index, datasetIndex } = elements[0];
        setSegmentReasonFilter(segmentValues[index], reasons[datasetIndex]);
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: colors.gridline } },
      },
    },
  });

  if (showSubreason && subEntries.length > 0) {
    const labels = subEntries.map(([value]) => value);
    subreasonChart = new Chart(container.querySelector('#segment-reason-subreason-canvas'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: subEntries.map(([, count]) => count),
          // Shades of the active reason's own color, since every subreason
          // here belongs to that one reason.
          backgroundColor: labels.map((l) => applyDim(getSubreasonColor(activeReason, l), state.filters.churnSubreason !== null && l !== state.filters.churnSubreason)),
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
