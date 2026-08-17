import { FIXED_FIELDS, MAPPABLE_FIELDS } from '../lib/fieldCatalog.js';
import { suggestFixedMapping, suggestMapping } from '../lib/mapping.js';
import { runPipeline } from '../lib/pipeline.js';
import { getState, setFieldMap, setPipelineResult, resetAll } from '../state/store.js';
import { escapeHtml } from './utils.js';

const TIER_LABEL = {
  exact: 'exact match',
  near: 'close match — please confirm',
  keyword: 'weak match — please confirm',
  none: 'not found',
};

export function renderMappingScreen(container) {
  const state = getState();
  const headers = state.fileInfo.headers;

  const fixedRows = FIXED_FIELDS.map((field) => {
    const suggestion = suggestFixedMapping(field, headers);
    const selected = state.fieldMap[field.key];
    const found = selected !== null && selected !== undefined;
    return renderFixedFieldRow(field, headers, selected, found, suggestion.tier);
  }).join('');

  const mappableRows = MAPPABLE_FIELDS.map((field) => {
    const suggestion = suggestMapping(field, headers);
    const selected = state.fieldMap[field.key];
    return renderMappableFieldRow(field, headers, selected, suggestion.tier);
  }).join('');

  const anyFixedMissing = FIXED_FIELDS.some((f) => !state.fieldMap[f.key]);

  container.innerHTML = `
    <section class="panel mapping-panel">
      <h1>Confirm column mapping</h1>
      <p class="subtitle">
        We auto-detected likely matches from <strong>${escapeHtml(state.fileInfo.name)}</strong>
        (${state.fileInfo.rowCount.toLocaleString()} rows). Review and adjust before continuing.
      </p>

      <h2>Fixed fields</h2>
      <p class="hint">These two are required and auto-detected by exact column name — override only if we got it wrong.</p>
      <div class="mapping-grid" id="fixed-fields">${fixedRows}</div>
      ${anyFixedMissing ? '<p class="status-error" id="fixed-error">One or more required fields could not be found. Please select them manually below before continuing.</p>' : ''}

      <h2>Other fields</h2>
      <p class="hint">Confirm or adjust each mapping. Fields left unmapped will show as "—" in the dashboard.</p>
      <div class="mapping-grid" id="mappable-fields">${mappableRows}</div>

      <div class="mapping-actions">
        <button type="button" id="back-btn" class="btn-secondary">Start over</button>
        <button type="button" id="continue-btn" class="btn-primary" ${anyFixedMissing ? 'disabled' : ''}>
          Continue to dashboard
        </button>
      </div>
    </section>
  `;

  container.querySelectorAll('select[data-field-key]').forEach((select) => {
    select.addEventListener('change', () => {
      const key = select.dataset.fieldKey;
      const value = select.value === '' ? null : select.value;
      const updatedMap = { ...getState().fieldMap, [key]: value };
      setFieldMap(updatedMap);
      renderMappingScreen(container);
    });
  });

  container.querySelector('#back-btn').addEventListener('click', () => {
    resetAll();
  });

  const continueBtn = container.querySelector('#continue-btn');
  continueBtn.addEventListener('click', () => {
    const current = getState();
    const { customers, report, mappedRows } = runPipeline(current.rawRows, current.fieldMap);
    setPipelineResult(customers, report, mappedRows);
  });
}

function renderFixedFieldRow(field, headers, selected, found, tier) {
  return `
    <div class="mapping-row ${found ? '' : 'mapping-row-error'}">
      <label for="field-${field.key}">${escapeHtml(field.label)}</label>
      <select id="field-${field.key}" data-field-key="${field.key}">
        <option value="">— not mapped —</option>
        ${headers.map((h) => `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
      </select>
      <span class="tier-badge ${found ? 'tier-ok' : 'tier-bad'}">${found ? TIER_LABEL[tier] || 'matched' : 'not found — required'}</span>
    </div>
  `;
}

function renderMappableFieldRow(field, headers, selected, tier) {
  const hasSelection = selected !== null && selected !== undefined;
  return `
    <div class="mapping-row">
      <label for="field-${field.key}">${escapeHtml(field.label)}</label>
      <select id="field-${field.key}" data-field-key="${field.key}">
        <option value="">— not mapped —</option>
        ${headers.map((h) => `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
      </select>
      <span class="tier-badge ${hasSelection ? 'tier-ok' : 'tier-neutral'}">${hasSelection ? (TIER_LABEL[tier] || 'matched') : 'unmapped'}</span>
    </div>
  `;
}
