import { escapeHtml, formatNumber } from './utils.js';

const CONFLICT_LABELS = {
  revenue: 'Revenue',
  decision: 'Case Churn Decision',
  serviceMarket: 'Service Market',
  serviceTeam: 'Service Team',
  serviceType: 'Service Type',
};

export function renderDataQualityPanel(container, state) {
  const r = state.dataQualityReport;
  if (!r) { container.innerHTML = ''; return; }

  const conflictEntries = Object.entries(r.conflicts).filter(([, list]) => list.length > 0);

  container.innerHTML = `
    <details class="panel data-quality-panel">
      <summary>
        Data quality summary
        <span class="hint">(${formatNumber(r.totalRowsParsed)} rows parsed → ${formatNumber(r.totalChurnCases)} churn cases → ${formatNumber(r.totalChurnedCustomers)} churned customers)</span>
      </summary>
      <div class="data-quality-body">
        <ul class="dq-summary-list">
          <li><strong>${formatNumber(r.totalRowsParsed)}</strong> total rows parsed from the uploaded file</li>
          <li><strong>${formatNumber(r.blankRowsDropped)}</strong> entirely blank rows dropped</li>
          <li><strong>${formatNumber(r.totalChurnCases)}</strong> churn cases found (Case Status = Closed) — <em>case-level count</em></li>
          <li><strong>${formatNumber(r.totalChurnedCustomers)}</strong> distinct churned customers after grouping by Account Official Name — <em>customer-level count</em></li>
          <li><strong>${formatNumber(r.excludedMissingJoinKeyCount)}</strong> churn case rows excluded — missing Account Official Name (could not attribute to a customer)</li>
          <li><strong>${formatNumber(r.rowsMissingRevenue)}</strong> churn case rows missing a usable Revenue value (excluded from revenue sums, not treated as 0)</li>
          <li><strong>${formatNumber(r.accountsWithDuplicateChurnCases.length)}</strong> accounts had more than one churn case — using the most recent by Churn Date, other cases retained for reference only</li>
        </ul>

        ${r.accountsWithMultipleCrmUrls.length === 0 ? '' : `
          <p class="dq-conflicts-heading">Possible duplicate account names:</p>
          <ul class="dq-summary-list">
            <li>
              <strong>${formatNumber(r.accountsWithMultipleCrmUrls.length)}</strong> account name(s) map to more than one Salesforce account URL.
              Customers are grouped by account name, so these may be separate accounts being counted as one.
              <details class="dq-nested">
                <summary>Show affected account names</summary>
                <span class="dq-account-list">${r.accountsWithMultipleCrmUrls.map(escapeHtml).join(', ')}</span>
              </details>
            </li>
          </ul>
        `}

        ${conflictEntries.length === 0 ? '' : `
          <p class="dq-conflicts-heading">Accounts with inconsistent values across their case rows (first non-blank value used):</p>
          <ul class="dq-summary-list">
            ${conflictEntries.map(([key, list]) => `
              <li>
                <strong>${formatNumber(list.length)}</strong> account(s) with inconsistent <strong>${escapeHtml(CONFLICT_LABELS[key] || key)}</strong> values
                <details class="dq-nested">
                  <summary>Show affected account names</summary>
                  <span class="dq-account-list">${list.map(escapeHtml).join(', ')}</span>
                </details>
              </li>
            `).join('')}
          </ul>
        `}
      </div>
    </details>
  `;
}
