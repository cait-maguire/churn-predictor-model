// Stage 4 panel: builds the account-month training table from the uploaded
// file and offers it as a CSV download.
//
// The download is a Blob + object URL created in the page - no network, no
// server, nothing written to disk except the file the user explicitly
// saves. Same privacy posture as the rest of the tool.

import { escapeHtml, formatNumber } from './utils.js';
import { getState, setTrainingTableOptions } from '../state/store.js';
import { buildTrainingTable, toCsv } from '../lib/trainingTable.js';

function formatPercent(fraction) {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(1)}%`;
}

function downloadCsv(filename, csv) {
  // No UTF-8 BOM: this file is headed for pandas/polars, where a BOM ends up
  // inside the first column name unless the reader is told to expect it.
  // Excel's accented-character handling matters less for a training table
  // than a clean `account_id` header does.
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the click has certainly been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function renderTrainingTablePanel(container, state) {
  const rows = state.mappedRows || [];
  if (rows.length === 0) {
    container.innerHTML = '';
    return;
  }

  const options = state.trainingTableOptions;
  const result = buildTrainingTable(rows, options);
  const s = result.summary;

  const proxyRate = s.positives > 0 ? s.positivesWithLabelCaseAlreadyOpen / s.positives : 0;
  const splitRows = Object.entries(s.splitCounts).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <details class="panel training-table-panel">
      <summary>
        Training table export (account-month)
        <span class="hint">(${formatNumber(s.totalRows)} rows × ${formatNumber(result.columns.length)} columns, ${formatNumber(s.positives)} positive)</span>
      </summary>
      <div class="data-quality-body">
        <p class="chart-caption">
          One row per account per month end. Features use only records dated on or before
          the month end; the label looks forward ${escapeHtml(String(options.horizonDays))} days.
          Built in this browser — nothing is uploaded.
        </p>

        <div class="tt-controls">
          <label>Market filter
            <input type="text" id="tt-market" value="${escapeHtml(options.marketFilter ?? '')}"
                   placeholder="(blank = all markets)">
          </label>
          <label>Horizon (days)
            <input type="number" id="tt-horizon" min="1" max="730" value="${escapeHtml(String(options.horizonDays))}">
          </label>
          <label>Train ends
            <input type="text" id="tt-train-end" value="${escapeHtml(options.trainEnd)}" placeholder="YYYY-MM-DD">
          </label>
          <label>Validate ends
            <input type="text" id="tt-validate-end" value="${escapeHtml(options.validateEnd)}" placeholder="YYYY-MM-DD">
          </label>
          <label class="tt-check">
            <input type="checkbox" id="tt-censor" ${options.censorAfterChurn ? 'checked' : ''}>
            Drop months after an account has churned
          </label>
          <label class="tt-check">
            <input type="checkbox" id="tt-complete" ${options.dropIncompleteLabelWindow ? 'checked' : ''}>
            Drop rows whose label window runs past the data
          </label>
        </div>

        <ul class="dq-summary-list">
          <li><strong>${formatNumber(s.totalRows)}</strong> account-month rows across <strong>${formatNumber(s.accountsIncluded)}</strong> accounts</li>
          <li><strong>${formatNumber(s.positives)}</strong> positive rows (${formatPercent(s.positiveRate)} base rate)</li>
          <li>File covers <strong>${escapeHtml(s.dataMinDate || '—')}</strong> to <strong>${escapeHtml(s.dataMaxDate || '—')}</strong></li>
          <li><strong>${formatNumber(s.rowsDroppedPostChurn)}</strong> rows dropped as post-churn, <strong>${formatNumber(s.rowsDroppedIncompleteLabelWindow)}</strong> dropped as right-censored</li>
          <li>Splits: ${splitRows.map(([k, v]) => `<strong>${escapeHtml(k)}</strong> ${formatNumber(v)}`).join(' · ') || '—'}</li>
          ${s.accountsExcludedByMarketFilter > 0 ? `<li><strong>${formatNumber(s.accountsExcludedByMarketFilter)}</strong> accounts excluded by the market filter</li>` : ''}
        </ul>

        ${s.positives === 0 ? '' : `
          <p class="dq-conflicts-heading">Read this before training on it</p>
          <ul class="dq-summary-list">
            <li>
              <strong>${formatPercent(proxyRate)}</strong> of positive rows have the churn case that
              creates the label <em>already open</em> at the cutoff (column
              <code>labeling_case_open_at_cutoff</code>). For those rows the activity and
              reason features are counting that same case, so a model will mostly learn
              &ldquo;a churn case is open&rdquo; — which you can read off a filter, without a model.
              ${proxyRate > 0.5 ? 'At this rate the table is best treated as a save-desk dataset, not early warning.' : ''}
            </li>
            <li>
              Every account in this file churned, so there are no true negatives — only
              months before a churn. A model trained here estimates <em>when</em>, not
              <em>whether</em>, and cannot be scored against your live customer base.
            </li>
          </ul>
        `}

        ${s.unmatchedSpecColumns.length === 0 ? '' : `
          <p class="dq-conflicts-heading">Spec columns with no matching value in this file (omitted rather than shipped as zeros):</p>
          <p class="dq-account-list">${s.unmatchedSpecColumns.map(escapeHtml).join(', ')}</p>
        `}

        ${s.nameKeyedAccounts === 0 ? '' : `
          <ul class="dq-summary-list">
            <li>
              <strong>${formatNumber(s.nameKeyedAccounts)}</strong> account(s) had no Account CRM URL and
              were keyed by name instead — two different Salesforce accounts sharing a name would
              merge into one row series.
            </li>
          </ul>
        `}

        <div class="mapping-actions">
          <button type="button" id="tt-download" class="btn-primary" ${s.totalRows === 0 ? 'disabled' : ''}>
            Download CSV (${formatNumber(s.totalRows)} rows)
          </button>
        </div>
      </div>
    </details>
  `;

  const commit = (patch) => setTrainingTableOptions(patch);
  const q = (sel) => container.querySelector(sel);

  q('#tt-market').addEventListener('change', (e) => commit({ marketFilter: e.target.value.trim() || null }));
  q('#tt-horizon').addEventListener('change', (e) => {
    const value = Number(e.target.value);
    if (Number.isFinite(value) && value > 0) commit({ horizonDays: Math.round(value) });
  });
  q('#tt-train-end').addEventListener('change', (e) => commit({ trainEnd: e.target.value.trim() }));
  q('#tt-validate-end').addEventListener('change', (e) => commit({ validateEnd: e.target.value.trim() }));
  q('#tt-censor').addEventListener('change', (e) => commit({ censorAfterChurn: e.target.checked }));
  q('#tt-complete').addEventListener('change', (e) => commit({ dropIncompleteLabelWindow: e.target.checked }));

  q('#tt-download').addEventListener('click', () => {
    // Rebuilt from current state rather than reusing `result`, so the file
    // always matches the controls as they are at click time.
    const current = getState();
    const fresh = buildTrainingTable(current.mappedRows, current.trainingTableOptions);
    downloadCsv('ml_churn_account_month_v1.csv', toCsv(fresh.columns, fresh.rows));
  });
}

// Keeps <details> from snapping shut on every store update.
export function preserveOpenState(container, render) {
  const wasOpen = container.querySelector('details')?.open ?? false;
  render();
  const details = container.querySelector('details');
  if (details) details.open = wasOpen;
}
