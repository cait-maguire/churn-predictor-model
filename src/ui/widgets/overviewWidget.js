import { computeFilteredExcluding } from '../../lib/crossFilter.js';
import { formatNumber } from '../utils.js';

export function render(container, state) {
  const filtered = computeFilteredExcluding(state, []);
  const total = state.churnedCustomers.length;
  const isFiltered = filtered.length !== total;

  const withRevenue = filtered.filter((c) => c.revenue !== null);
  const totalRevenueLost = withRevenue.reduce((sum, c) => sum + c.revenue, 0);
  const missingRevenueCount = filtered.length - withRevenue.length;

  container.innerHTML = `
    <div class="widget overview-widget">
      <h3>Churned customers overview</h3>
      <div class="stat-row">
        <div class="stat-tile stat-tile-count">
          <div class="stat-value">${formatNumber(filtered.length)}</div>
          <div class="stat-label">churned customers${isFiltered ? ` <span class="hint">of ${formatNumber(total)} total</span>` : ''}</div>
        </div>
        <div class="stat-tile stat-tile-revenue">
          <div class="stat-value">${formatNumber(Math.round(totalRevenueLost))}</div>
          <div class="stat-label">total revenue lost</div>
        </div>
      </div>
      ${missingRevenueCount > 0 ? `<p class="hint">${formatNumber(missingRevenueCount)} of these customers have no usable Revenue value and are excluded from the revenue total above.</p>` : ''}
    </div>
  `;
}
