import { parseFile } from '../lib/parseFile.js';
import { FIXED_FIELDS, MAPPABLE_FIELDS } from '../lib/fieldCatalog.js';
import { suggestAllMappings, suggestFixedMapping } from '../lib/mapping.js';
import { profileColumns } from '../lib/profileColumns.js';
import { suggestRoles } from '../lib/roles.js';
import { setUploadResult } from '../state/store.js';
import { resetCategoricalColors } from './chartColors.js';
import { escapeHtml, formatNumber } from './utils.js';

export function renderUploadScreen(container) {
  // A fresh upload means an unrelated dataset - clear stable label->color
  // assignments so old labels don't hold onto colors a new file never uses.
  resetCategoricalColors();

  container.innerHTML = `
    <section class="panel upload-panel">
      <h1>Case Analysis Dashboard</h1>
      <p class="subtitle">
        Upload a case export (CSV or XLSX) — churn, complaints, NPS or anything
        case-per-row — and the tool will profile the columns and tell you what
        the data says.
        Everything is processed in your browser — no data leaves this machine,
        and nothing is saved: closing or refreshing this page clears everything.
      </p>
      <div class="drop-zone" id="drop-zone" tabindex="0">
        <p><strong>Drop your file here</strong> or click to browse</p>
        <p class="hint">Accepts .csv and .xlsx</p>
        <input type="file" id="file-input" accept=".csv,.xlsx" hidden />
      </div>
      <div id="upload-status" class="upload-status" aria-live="polite"></div>
    </section>
  `;

  const dropZone = container.querySelector('#drop-zone');
  const fileInput = container.querySelector('#file-input');
  const statusEl = container.querySelector('#upload-status');

  const openPicker = () => fileInput.click();
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file, statusEl);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file, statusEl);
  });
}

async function handleFile(file, statusEl) {
  statusEl.innerHTML = `<p class="status-info">Parsing ${escapeHtml(file.name)}…</p>`;
  try {
    const { headers, rows } = await parseFile(file);

    if (headers.length === 0 || rows.length === 0) {
      statusEl.innerHTML = `<p class="status-error">No rows/columns detected in this file. Please check the file and try again.</p>`;
      return;
    }

    // Source-agnostic path: work out what each column is, then what role it
    // plays. This runs for every file, whatever its origin.
    const columnProfiles = profileColumns(rows, headers);
    const roles = suggestRoles(columnProfiles);

    // Churn path: only when the file matches the Phase 1 Salesforce export
    // closely enough for the churn-specific pipeline (which applies the
    // Case Status = Closed rule and the churn widgets) to be meaningful.
    const fieldMap = {};
    for (const field of FIXED_FIELDS) {
      fieldMap[field.key] = suggestFixedMapping(field, headers).header;
    }
    const suggestedMappable = suggestAllMappings(MAPPABLE_FIELDS, headers);
    for (const [key, match] of Object.entries(suggestedMappable)) {
      fieldMap[key] = match.tier === 'none' ? null : match.header;
    }
    const isChurnFormat = FIXED_FIELDS.every((field) => fieldMap[field.key]);

    statusEl.innerHTML = `
      <div class="status-preview">
        <p class="status-ok">Loaded ${escapeHtml(file.name)}</p>
        <ul>
          <li><strong>${formatNumber(rows.length)}</strong> rows detected</li>
          <li><strong>${formatNumber(headers.length)}</strong> columns detected</li>
        </ul>
        <details>
          <summary>Detected columns</summary>
          <ul class="columns-list">
            ${headers.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
          </ul>
        </details>
        <p class="hint">Proceeding to column mapping…</p>
      </div>
    `;

    setUploadResult({ name: file.name, headers, rowCount: rows.length }, rows, fieldMap, {
      columnProfiles,
      roles,
      isChurnFormat,
    });
  } catch (err) {
    statusEl.innerHTML = `<p class="status-error">Could not parse this file: ${escapeHtml(err?.message || String(err))}</p>`;
  }
}
