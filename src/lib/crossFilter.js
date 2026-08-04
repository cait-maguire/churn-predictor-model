// Each widget filters on every *other* widget's active filter but not its
// own dimension, so clicking a bar narrows everything else while the
// clicked widget itself keeps showing all its own values (so the user can
// click a different bar in the same widget, or click again to clear).
// excludeDims: array drawn from 'segment' | 'reason' | 'subreason'.
export function computeFilteredExcluding(state, excludeDims = []) {
  const { churnedCustomers, activeSegmentField, filters } = state;

  return churnedCustomers.filter((customer) => {
    if (!excludeDims.includes('segment') && filters.segmentValue !== null) {
      if ((customer.segments[activeSegmentField]?.value ?? null) !== filters.segmentValue) return false;
    }
    if (!excludeDims.includes('reason') && filters.churnReason !== null) {
      if (customer.canonicalCase.churnReason !== filters.churnReason) return false;
    }
    if (!excludeDims.includes('subreason') && filters.churnSubreason !== null) {
      if (customer.canonicalCase.churnSubreason !== filters.churnSubreason) return false;
    }
    return true;
  });
}
