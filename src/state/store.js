// Minimal in-memory pub/sub store. Deliberately never touches localStorage
// or sessionStorage: Salesforce exports may contain sensitive customer
// data, so everything lives in memory only and is gone on refresh/close.

import { DEFAULT_OPTIONS as DEFAULT_TRAINING_TABLE_OPTIONS } from '../lib/trainingTable.js';

const state = {
  // Set once upload + mapping are confirmed; null beforehand.
  fileInfo: null, // { name, headers, rowCount }
  fieldMap: null, // { [canonicalKey]: originalHeaderString | null }

  churnedCustomers: [],
  dataQualityReport: null,
  // Every non-blank mapped case row, kept for the Stage 4 training table
  // (which needs open cases too, not just the rolled-up churned customers).
  mappedRows: [],
  trainingTableOptions: { ...DEFAULT_TRAINING_TABLE_OPTIONS },

  activeSegmentField: 'serviceMarket',
  filters: {
    segmentValue: null,
    churnReason: null,
    churnSubreason: null,
  },

  // Drives which top-level screen is shown: 'upload' | 'mapping' | 'dashboard'
  screen: 'upload',
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function setScreen(screen) {
  state.screen = screen;
  emit();
}

export function setUploadResult(fileInfo, rawRows, suggestedFieldMap) {
  state.fileInfo = fileInfo;
  state.rawRows = rawRows;
  state.fieldMap = suggestedFieldMap;
  state.screen = 'mapping';
  emit();
}

export function setFieldMap(fieldMap) {
  state.fieldMap = fieldMap;
  emit();
}

export function setPipelineResult(customers, report, mappedRows) {
  state.churnedCustomers = customers;
  state.dataQualityReport = report;
  state.mappedRows = mappedRows || [];
  state.screen = 'dashboard';
  emit();
}

// Options for the Stage 4 training-table export. Kept in the store so the
// panel's controls survive a re-render, but never persisted anywhere.
export function setTrainingTableOptions(patch) {
  state.trainingTableOptions = { ...state.trainingTableOptions, ...patch };
  emit();
}

export function setActiveSegmentField(fieldKey) {
  state.activeSegmentField = fieldKey;
  state.filters.segmentValue = null; // changing the segment axis clears its filter
  emit();
}

export function toggleFilter(key, value) {
  state.filters[key] = state.filters[key] === value ? null : value;
  if (key === 'churnReason' && state.filters.churnReason === null) {
    state.filters.churnSubreason = null; // clearing reason clears its drill-down too
  }
  emit();
}

// Sets segment + reason together as one atomic action (for the combined
// segment-by-reason widget, where a single click pins both dimensions at
// once). Clicking the already-active combination clears both, mirroring
// toggleFilter's click-again-to-clear behavior.
export function setSegmentReasonFilter(segmentValue, reason) {
  const alreadyActive = state.filters.segmentValue === segmentValue && state.filters.churnReason === reason;
  state.filters.segmentValue = alreadyActive ? null : segmentValue;
  state.filters.churnReason = alreadyActive ? null : reason;
  state.filters.churnSubreason = null;
  emit();
}

export function resetAll() {
  state.fileInfo = null;
  state.rawRows = null;
  state.fieldMap = null;
  state.churnedCustomers = [];
  state.dataQualityReport = null;
  state.mappedRows = [];
  state.trainingTableOptions = { ...DEFAULT_TRAINING_TABLE_OPTIONS };
  state.activeSegmentField = 'serviceMarket';
  state.filters = { segmentValue: null, churnReason: null, churnSubreason: null };
  state.screen = 'upload';
  emit();
}
