// Minimal in-memory pub/sub store. Deliberately never touches localStorage
// or sessionStorage: Salesforce exports may contain sensitive customer
// data, so everything lives in memory only and is gone on refresh/close.

const state = {
  // Set once upload + mapping are confirmed; null beforehand.
  fileInfo: null, // { name, headers, rowCount }
  fieldMap: null, // { [canonicalKey]: originalHeaderString | null }

  churnedCustomers: [],
  dataQualityReport: null,

  activeSegmentField: 'serviceSegment',
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

export function setPipelineResult(customers, report) {
  state.churnedCustomers = customers;
  state.dataQualityReport = report;
  state.screen = 'dashboard';
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
  state.activeSegmentField = 'serviceSegment';
  state.filters = { segmentValue: null, churnReason: null, churnSubreason: null };
  state.screen = 'upload';
  emit();
}
