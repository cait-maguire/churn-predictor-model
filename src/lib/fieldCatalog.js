// Canonical field definitions for the churn export. "Fixed" fields are
// auto-detected by exact/near name match only (the account key + revenue)
// and block progress with a visible error if not found. "Mappable" fields
// get auto-suggested but the user confirms/overrides them on the mapping
// screen.

export const FIXED_FIELDS = [
  {
    key: 'accountKey',
    label: 'Account Official Name (customer key)',
    exactVariants: ['account official name'],
  },
  {
    key: 'revenue',
    label: 'Revenue',
    exactVariants: ['revenue'],
  },
];

export const MAPPABLE_FIELDS = [
  { key: 'status', label: 'Case Status', exactVariants: ['case status'] },
  { key: 'terminationDate', label: 'Churn Date', exactVariants: ['churn date'] },
  { key: 'openDate', label: 'Open Date', exactVariants: ['open date'] },
  { key: 'churnType', label: 'Case Churn Type', exactVariants: ['case churn type'] },
  { key: 'churnReason', label: 'Case Churn Reason', exactVariants: ['case churn reason'] },
  { key: 'churnSubreason', label: 'Case Churn Subreason', exactVariants: ['case churn subreason'] },
  { key: 'winBackAction', label: 'Case Win Back Action', exactVariants: ['case win back action'] },
  { key: 'caseCrmUrl', label: 'Case CRM URL', exactVariants: ['case crm url'] },
  // Not a segment, but tracked so the rollup can flag when one account name
  // maps to more than one Salesforce account - the main risk of keying
  // customers by name rather than by an ID.
  { key: 'accountCrmUrl', label: 'Account CRM URL', exactVariants: ['account crm url'] },
  { key: 'affiliateCrmUrl', label: 'Affiliate CRM URL', exactVariants: ['affiliate crm url'] },

  { key: 'decision', label: 'Case Churn Decision', exactVariants: ['case churn decision'], segment: true },
  { key: 'serviceMarket', label: 'Service Market', exactVariants: ['service market'], segment: true },
  { key: 'serviceTeam', label: 'Service Team', exactVariants: ['service team'], segment: true },
  { key: 'serviceType', label: 'Service Type', exactVariants: ['service type'], segment: true },
];

export const ALL_FIELDS = [...FIXED_FIELDS, ...MAPPABLE_FIELDS];

export const SEGMENT_FIELDS = MAPPABLE_FIELDS.filter((f) => f.segment).map((f) => ({
  key: f.key,
  label: f.label,
}));

// Segment keys in the order they appear on ChurnedCustomer.segments.
export const SEGMENT_KEYS = SEGMENT_FIELDS.map((f) => f.key);
