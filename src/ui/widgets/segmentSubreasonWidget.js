import { Chart } from '../chartSetup.js';
import { getChartColors, getCategoricalColorForLabel, getSubreasonColor, applyDim } from '../chartColors.js';
import { renderGroupedLegendHtml, bindLegend } from '../legend.js';
import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { SEGMENT_FIELDS } from '../../lib/fieldCatalog.js';
import { setActiveSegmentField, setSegmentSubreasonFilter, toggleFilter } from '../../state/store.js';
import { buildSegmentMatrix, buildSubreasonParentMap } from './segmentMatrix.js';
import { escapeHtml, formatNumber } from '../utils.js';

let chartInstance = null;

export function render(container, state) {
  const colors = getChartColors();

  // Segment and subreason are this widget's own axes, so both are excluded:
  // the full matrix always shows, and active filters only change which
  // slice is highlighted vs. dimmed.
  const base = computeFilteredExcluding(state, ['segment', 'reason', 'subreason']);
  const {
    matrix, segmentTotals, segmentValues, categories: subreasons, blankSegmentCount, blankCategoryCount,
  } = buildSegmentMatrix(base, state.activeSegmentField, (c) => c.canonicalCase.churnSubreason);

  // Subreasons are colored as shades of the reason they sit under, so the
  // parent relationship is visible without a separate encoding.
  const { parentOf, ambiguous } = buildSubreasonParentMap(base);

  const activeSegment = state.filters.segmentValue;
  const activeSubreason = state.filters.churnSubreason;
  const comboActive = activeSegment !== null && activeSubreason !== null;
  const anyFilterActive = activeSegment !== null || activeSubreason !== null;

  // Legend grouped by parent reason, ordered by how many customers each
  // reason accounts for in the current view.
  const groupTotals = new Map();
  for (const subreason of subreasons) {
    const parent = parentOf.get(subreason) ?? null;
    let total = 0;
    for (const row of matrix.values()) total += row.get(subreason) || 0;
    groupTotals.set(parent, (groupTotals.get(parent) || 0) + total);
  }
  const legendGroups = [...groupTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([parent]) => ({
      reason: parent === null ? 'No churn reason recorded' : parent,
      reasonColor: parent === null ? colors.muted : getCategoricalColorForLabel('reason', parent),
      items: subreasons
        .filter((sr) => (parentOf.get(sr) ?? null) === parent)
        .map((sr) => ({
          value: sr,
          label: sr,
          color: getSubreasonColor(parent, sr),
          active: sr === activeSubreason,
        })),
    }));

  container.innerHTML = `
    <div class="widget widget-wide segment-subreason-widget">
      <div class="widget-header">
        <h3>Churned customers by segment &amp; churn subreason</h3>
        <select id="segsubreason-field-select">
          ${SEGMENT_FIELDS.map((f) => `<option value="${f.key}" ${f.key === state.activeSegmentField ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
      </div>
      <p class="hint">Each bar is one segment value, split by churn subreason. Subreason colors are shades of their parent churn reason, so related subreasons read as one family. Click a slice to filter the dashboard.</p>
      ${comboActive ? `<p class="hint">Filtered to: <strong>${escapeHtml(activeSegment)}</strong> &rarr; <strong>${escapeHtml(activeSubreason)}</strong> — click that slice again, or <button type="button" id="clear-segsubreason-filter" class="link-btn">clear</button></p>` : ''}
      ${segmentValues.length === 0
        ? '<p class="hint">No segment + subreason data available in the current selection.</p>'
        : `<div class="chart-wrap"><canvas id="segment-subreason-canvas"></canvas></div>
           <div id="segsubreason-legend">${renderGroupedLegendHtml(legendGroups)}</div>`}
      ${blankSegmentCount > 0 ? `<p class="hint">${formatNumber(blankSegmentCount)} churned customers have no value for this segment field.</p>` : ''}
      ${blankCategoryCount > 0 ? `<p class="hint">${formatNumber(blankCategoryCount)} churned customers (with a segment value) have no Churn Subreason recorded.</p>` : ''}
      ${ambiguous.length > 0 ? `<p class="hint">${formatNumber(ambiguous.length)} subreason(s) appear under more than one churn reason in this data; each is colored by its most frequent parent reason.</p>` : ''}
    </div>
  `;

  container.querySelector('#segsubreason-field-select').addEventListener('change', (e) => {
    setActiveSegmentField(e.target.value);
  });
  const clearBtn = container.querySelector('#clear-segsubreason-filter');
  if (clearBtn) clearBtn.addEventListener('click', () => setSegmentSubreasonFilter(activeSegment, activeSubreason));

  const legendMount = container.querySelector('#segsubreason-legend');
  if (legendMount) bindLegend(legendMount, (subreason) => toggleFilter('churnSubreason', subreason));

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (segmentValues.length === 0) return;

  const xLabels = segmentValues.map((v) => `${v} (${formatNumber(segmentTotals.get(v))})`);

  const datasets = subreasons.map((subreason) => {
    const parent = parentOf.get(subreason) ?? null;
    return {
      label: subreason,
      data: segmentValues.map((segValue) => matrix.get(segValue)?.get(subreason) || 0),
      backgroundColor: segmentValues.map((segValue) => {
        const isMatch = (activeSegment === null || activeSegment === segValue)
          && (activeSubreason === null || activeSubreason === subreason);
        return applyDim(getSubreasonColor(parent, subreason), anyFilterActive && !isMatch);
      }),
      borderRadius: 4,
    };
  });

  chartInstance = new Chart(container.querySelector('#segment-subreason-canvas'), {
    type: 'bar',
    data: { labels: xLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick: (evt, elements) => {
        if (elements.length === 0) return;
        const { index, datasetIndex } = elements[0];
        setSegmentSubreasonFilter(segmentValues[index], subreasons[datasetIndex]);
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: colors.gridline } },
      },
    },
  });
}
