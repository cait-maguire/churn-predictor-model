// Canonical field definitions. "Fixed" fields are auto-detected by exact/near
// name match only (join key + revenue, per the confirmed business rules) and
// block progress with a visible error if not found. "Mappable" fields get
// auto-suggested but the user confirms/overrides via the mapping screen.

export const FIXED_FIELDS = [
  {
    key: 'companyNo',
    label: 'Company No. (join/grouping key)',
    exactVariants: ['account name: reference affiliate: company no.'],
  },
  {
    key: 'revenue',
    label: 'Revenue',
    exactVariants: ['revenue'],
  },
];

export const MAPPABLE_FIELDS = [
  { key: 'caseRecordType', label: 'Case Record Type', exactVariants: ['case record type'] },
  { key: 'status', label: 'Status', exactVariants: ['status'] },
  { key: 'terminationDate', label: 'Termination Date', exactVariants: ['termination date'] },
  { key: 'churnReason', label: 'Churn Reason', exactVariants: ['churn reason'] },
  { key: 'churnSubreason', label: 'Churn Subreason', exactVariants: ['churn subreason'] },
  { key: 'decision', label: 'Decision', exactVariants: ['decision'] },
  { key: 'winBackAction', label: 'Win Back Action', exactVariants: ['win back action'] },
  { key: 'caseNb', label: 'Case Nb', exactVariants: ['case nb'] },
  { key: 'accountName', label: 'Account Name', exactVariants: ['account name'] },
  {
    key: 'serviceSegment',
    label: 'Service Segment',
    exactVariants: ['service segment'],
    segment: true,
  },
  {
    key: 'serviceType',
    label: 'Service Type',
    exactVariants: ['service type'],
    segment: true,
  },
  {
    key: 'sdWorxCustomerType',
    label: 'SD Worx Customer Type',
    exactVariants: ['account name: sd worx customer type'],
    segment: true,
  },
  {
    key: 'affiliate',
    label: 'Affiliate',
    exactVariants: ['affiliate'],
    segment: true,
  },
  {
    key: 'groupId',
    label: 'Group - Id',
    exactVariants: ['account name: reference affiliate: group - id', 'account name: reference affiliate: group-id'],
    segment: true,
  },
];

export const ALL_FIELDS = [...FIXED_FIELDS, ...MAPPABLE_FIELDS];

export const SEGMENT_FIELDS = MAPPABLE_FIELDS.filter((f) => f.segment).map((f) => ({
  key: f.key,
  label: f.label,
}));
// companyNo is also usable as a segment field per the spec ("Group ID and
// Company No. if useful as segments"), appended after the mappable segment
// fields since it's a fixed field, not a mappable one.
SEGMENT_FIELDS.push({ key: 'companyNo', label: 'Company No.' });
