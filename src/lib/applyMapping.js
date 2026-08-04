// Stage 1: raw rows (Stage 0, keyed by original header text) + a confirmed
// field map (canonical key -> original header string) -> MappedRow[] with
// canonical keys. This is the shape Phase 2 (non-churn case analysis) reuses
// unchanged.

function get(row, header) {
  if (!header) return null;
  const v = row[header];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

// fieldMap: { [canonicalKey]: originalHeaderString | null }
export function applyMapping(rawRows, fieldMap) {
  return rawRows.map((row, index) => ({
    __rowIndex: index,
    companyNo: get(row, fieldMap.companyNo),
    revenueRaw: get(row, fieldMap.revenue),
    caseRecordType: get(row, fieldMap.caseRecordType),
    status: get(row, fieldMap.status),
    terminationDate: get(row, fieldMap.terminationDate),
    churnReason: get(row, fieldMap.churnReason),
    churnSubreason: get(row, fieldMap.churnSubreason),
    decision: get(row, fieldMap.decision),
    winBackAction: get(row, fieldMap.winBackAction),
    caseNb: get(row, fieldMap.caseNb),
    accountName: get(row, fieldMap.accountName),
    segments: {
      serviceSegment: get(row, fieldMap.serviceSegment),
      serviceType: get(row, fieldMap.serviceType),
      sdWorxCustomerType: get(row, fieldMap.sdWorxCustomerType),
      affiliate: get(row, fieldMap.affiliate),
      groupId: get(row, fieldMap.groupId),
    },
  }));
}

// A row is "entirely blank" if every field we mapped to is empty - these are
// dropped and counted separately from missing-join-key rows, per the plan.
export function isBlankRow(mappedRow) {
  const { __rowIndex, ...fields } = mappedRow;
  const flat = [
    fields.companyNo,
    fields.revenueRaw,
    fields.caseRecordType,
    fields.status,
    fields.terminationDate,
    fields.churnReason,
    fields.churnSubreason,
    fields.decision,
    fields.winBackAction,
    fields.caseNb,
    fields.accountName,
    ...Object.values(fields.segments),
  ];
  return flat.every((v) => v === null);
}
