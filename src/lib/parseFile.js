import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Stage 0: File -> { headers, rows }. rows are plain objects keyed by the
// original (untouched) header text. Never uses PapaParse's worker or
// download modes, since a single self-contained HTML file has no separate
// worker script file to point to, and download mode would require a
// network request.
export function parseFile(file) {
  const name = file.name || '';
  const isXlsx = /\.xlsx?$/i.test(name);
  return isXlsx ? parseXlsx(file) : parseCsv(file);
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      worker: false,
      download: false,
      complete: (results) => {
        const headers = results.meta.fields || [];
        resolve({ headers, rows: results.data });
      },
      error: (err) => reject(err),
    });
  });
}

async function parseXlsx(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}
