// Minimal in-memory pub/sub store. Deliberately never touches localStorage
// or sessionStorage: Salesforce exports may contain sensitive customer
// data, so everything lives in memory only and is gone on refresh/close.

const state = {
  // Set once upload + mapping are confirmed; null beforehand.
  fileInfo: null, // { name, headers, rowCount }
  fieldMap: null, // { [canonicalKey]: originalHeaderString | null }

  churnedCustomers: [],
  dataQualityReport: null,

  // Source-agnostic layer: what the file actually contains, independent of
  // whether it happens to be the Phase 1 churn export.
  columnProfiles: [],
  roles: {},
  // True when the file matches the Phase 1 Salesforce churn export closely
  // enough to run the churn-specific pipeline and widgets as well.
  isChurnFormat: false,

  activeSegmentField: 'serviceMarket',
  // Which dimension the generic breakdown widget is showing.
  activeDimension: null,
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

export function setUploadResult(fileInfo, rawRows, suggestedFieldMap, { columnProfiles, roles, isChurnFormat }) {
  state.fileInfo = fileInfo;
  state.rawRows = rawRows;
  state.fieldMap = suggestedFieldMap;
  state.columnProfiles = columnProfiles;
  state.roles = roles;
  state.isChurnFormat = isChurnFormat;
  state.screen = 'mapping';
  emit();
}

export function setRole(roleKey, header) {
  state.roles = { ...state.roles, [roleKey]: header };
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

// Non-churn files skip the churn-specific pipeline entirely and go straight
// to the findings view.
export function showDashboard() {
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
  state.columnProfiles = [];
  state.roles = {};
  state.isChurnFormat = false;
  state.activeDimension = null;
  state.activeSegmentField = 'serviceMarket';
  state.filters = { segmentValue: null, churnReason: null, churnSubreason: null };
  state.screen = 'upload';
  emit();
}

export function setActiveDimension(dimension) {
  state.activeDimension = dimension;
  emit();
}
