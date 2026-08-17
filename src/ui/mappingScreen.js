import { FIXED_FIELDS, MAPPABLE_FIELDS } from '../lib/fieldCatalog.js';
import { suggestFixedMapping, suggestMapping } from '../lib/mapping.js';
import { ROLE_DEFINITIONS, missingRequiredRoles } from '../lib/roles.js';
import { COLUMN_TYPE } from '../lib/profileColumns.js';
import { runPipeline } from '../lib/pipeline.js';
import { getState, setFieldMap, setRole, setPipelineResult, showDashboard, resetAll } from '../state/store.js';
import { escapeHtml } from './utils.js';

const TIER_LABEL = {
  exact: 'exact match',
  near: 'close match — please confirm',
  keyword: 'weak match — please confirm',
  none: 'not found',
};

const TYPE_LABEL = {
  [COLUMN_TYPE.DATE]: 'dates',
  [COLUMN_TYPE.NUMBER]: 'numbers',
  [COLUMN_TYPE.SCORE]: 'rating scale',
  [COLUMN_TYPE.CATEGORY]: 'categories',
  [COLUMN_TYPE.ID]: 'identifiers',
  [COLUMN_TYPE.TEXT]: 'free text',
  [COLUMN_TYPE.EMPTY]: 'empty',
};

export function renderMappingScreen(container) {
  const state = getState();
  const headers = state.fileInfo.headers;
  const profilesByHeader = Object.fromEntries(state.columnProfiles.map((p) => [p.header, p]));

  const missingRoles = missingRequiredRoles(state.roles);
  const blocked = missingRoles.length > 0;

  const roleRows = ROLE_DEFINITIONS.map((definition) =>
    renderRoleRow(definition, state.columnProfiles, state.roles[definition.key])
  ).join('');

  const churnRows = state.isChurnFormat
    ? [...FIXED_FIELDS, ...MAPPABLE_FIELDS]
        .map((field) => {
          const isFixed = FIXED_FIELDS.includes(field);
          const suggestion = isFixed
            ? suggestFixedMapping(field, headers)
            : suggestMapping(field, headers);
          return renderFieldRow(field, headers, state.fieldMap[field.key], suggestion.tier, isFixed);
        })
        .join('')
    : '';

  const churnFixedMissing = state.isChurnFormat && FIXED_FIELDS.some((f) => !state.fieldMap[f.key]);

  container.innerHTML = `
    <section class="panel mapping-panel">
      <h1>Confirm what this file contains</h1>
      <p class="subtitle">
        We profiled every column in <strong>${escapeHtml(state.fileInfo.name)}</strong>
        (${state.fileInfo.rowCount.toLocaleString()} rows) and worked out what each one is.
        Review the roles below — they drive the analysis.
      </p>

      <h2>Column roles</h2>
      <p class="hint">
        Only the first two are required. Each optional role that is filled unlocks
        more analysis: a value column enables value concentration, two dates enable
        time-to-close, a rating enables score comparisons.
      </p>
      <div class="mapping-grid" id="role-fields">${roleRows}</div>
      ${blocked ? `<p class="status-error" id="role-error">Still needed before the analysis can run: ${escapeHtml(missingRoles.join(', '))}.</p>` : ''}

      <details class="column-profile-details">
        <summary>What we detected in each column</summary>
        <div class="profile-grid">
          ${state.columnProfiles
            .map(
              (p) => `
            <div class="profile-row">
              <span class="profile-header">${escapeHtml(p.header)}</span>
              <span class="profile-type">${escapeHtml(TYPE_LABEL[p.type] || p.type)}</span>
              <span class="profile-meta">${p.distinctCount.toLocaleString()} distinct${p.nullRate > 0.01 ? ` · ${Math.round(p.nullRate * 100)}% blank` : ''}</span>
              <span class="profile-sample">${escapeHtml(p.topValues.slice(0, 3).map((v) => v.value).join(', '))}</span>
            </div>`
            )
            .join('')}
        </div>
      </details>

      ${
        state.isChurnFormat
          ? `
        <h2>Churn dashboard fields</h2>
        <p class="hint">
          This file matches the Salesforce churn export, so the churn-specific
          dashboard runs as well — these are its fields.
        </p>
        <div class="mapping-grid" id="churn-fields">${churnRows}</div>
        ${churnFixedMissing ? '<p class="status-error" id="fixed-error">One or more required churn fields could not be found.</p>' : ''}
      `
          : ''
      }

      <div class="mapping-actions">
        <button type="button" id="back-btn" class="btn-secondary">Start over</button>
        <button type="button" id="continue-btn" class="btn-primary" ${blocked || churnFixedMissing ? 'disabled' : ''}>
          Analyse this file
        </button>
      </div>
    </section>
  `;

  container.querySelectorAll('select[data-role-key]').forEach((select) => {
    select.addEventListener('change', () => {
      setRole(select.dataset.roleKey, select.value === '' ? null : select.value);
      renderMappingScreen(container);
    });
  });

  container.querySelectorAll('select[data-field-key]').forEach((select) => {
    select.addEventListener('change', () => {
      const updatedMap = { ...getState().fieldMap, [select.dataset.fieldKey]: select.value === '' ? null : select.value };
      setFieldMap(updatedMap);
      renderMappingScreen(container);
    });
  });

  container.querySelector('#back-btn').addEventListener('click', () => resetAll());

  container.querySelector('#continue-btn').addEventListener('click', () => {
    const current = getState();
    if (current.isChurnFormat) {
      const { customers, report } = runPipeline(current.rawRows, current.fieldMap);
      setPipelineResult(customers, report);
    } else {
      showDashboard();
    }
  });

  return profilesByHeader;
}

// Role dropdowns only offer columns whose detected type can actually hold
// the role - offering a free-text column as the event date invites a
// mapping that silently produces nothing.
function renderRoleRow(definition, profiles, selected) {
  const eligible = profiles.filter((p) => definition.types.includes(p.type));
  const options = eligible.length > 0 ? eligible : profiles;
  const filled = selected !== null && selected !== undefined;
  const badge = filled
    ? `<span class="tier-badge tier-ok">mapped</span>`
    : definition.required
      ? `<span class="tier-badge tier-bad">required</span>`
      : `<span class="tier-badge tier-neutral">optional</span>`;

  return `
    <div class="mapping-row ${!filled && definition.required ? 'mapping-row-error' : ''}">
      <label for="role-${definition.key}">
        ${escapeHtml(definition.label)}
        <span class="role-hint">${escapeHtml(definition.hint)}</span>
      </label>
      <select id="role-${definition.key}" data-role-key="${definition.key}">
        <option value="">— none —</option>
        ${options
          .map(
            (p) =>
              `<option value="${escapeHtml(p.header)}" ${p.header === selected ? 'selected' : ''}>${escapeHtml(p.header)}</option>`
          )
          .join('')}
      </select>
      ${badge}
    </div>
  `;
}

function renderFieldRow(field, headers, selected, tier, isFixed) {
  const filled = selected !== null && selected !== undefined;
  return `
    <div class="mapping-row ${isFixed && !filled ? 'mapping-row-error' : ''}">
      <label for="field-${field.key}">${escapeHtml(field.label)}</label>
      <select id="field-${field.key}" data-field-key="${field.key}">
        <option value="">— not mapped —</option>
        ${headers.map((h) => `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
      </select>
      <span class="tier-badge ${filled ? 'tier-ok' : isFixed ? 'tier-bad' : 'tier-neutral'}">
        ${filled ? TIER_LABEL[tier] || 'matched' : isFixed ? 'not found — required' : 'unmapped'}
      </span>
    </div>
  `;
}
