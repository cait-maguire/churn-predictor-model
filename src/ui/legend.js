import { escapeHtml } from './utils.js';

// HTML swatch legends. The charts color each *bar* individually rather than
// per dataset, which Chart.js's built-in legend can't represent, so legends
// are built as plain markup here instead. Items carry a data-legend-value
// attribute so widgets can wire clicking a legend item to the same filter
// as clicking the bar it names.

// items: [{ value, label, color, active }]
export function renderLegendHtml(items, { compact = false } = {}) {
  if (items.length === 0) return '';
  return `
    <ul class="chart-legend ${compact ? 'chart-legend-compact' : ''}">
      ${items.map((item) => `
        <li>
          <button type="button" class="legend-item ${item.active ? 'legend-item-active' : ''}" data-legend-value="${escapeHtml(item.value)}">
            <span class="legend-swatch" style="background:${escapeHtml(item.color)}"></span>
            <span class="legend-label">${escapeHtml(item.label)}</span>
          </button>
        </li>
      `).join('')}
    </ul>
  `;
}

// Legend for subreasons, grouped under the parent reason they belong to, so
// the shade-of-parent color scheme is readable rather than a flat list of
// near-identical swatches.
// groups: [{ reason, reasonColor, items: [{ value, label, color, active }] }]
export function renderGroupedLegendHtml(groups) {
  if (groups.length === 0) return '';
  return `
    <div class="chart-legend-groups">
      ${groups.map((group) => `
        <div class="legend-group">
          <p class="legend-group-title">
            <span class="legend-swatch legend-swatch-parent" style="background:${escapeHtml(group.reasonColor)}"></span>
            ${escapeHtml(group.reason)}
          </p>
          ${renderLegendHtml(group.items, { compact: true })}
        </div>
      `).join('')}
    </div>
  `;
}

// Wires every legend item inside `container` to `onSelect(value)`.
export function bindLegend(container, onSelect) {
  container.querySelectorAll('[data-legend-value]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.legendValue));
  });
}
