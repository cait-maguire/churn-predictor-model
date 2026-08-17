// Stage 0.75: column profiles -> semantic roles.
//
// Phase 1 asked "which column is Case Churn Reason?". That question only
// has an answer for one export. This asks "which column identifies the
// customer, which one dates the event, which one carries value" - questions
// a complaints export, an NPS export or a churn export can all answer.
//
// Roles are suggested from the inferred type plus header wording, and the
// user confirms them on the mapping screen exactly as before. Type fit is
// a hard gate (a text column is never a date); header wording only ranks
// the candidates that already fit.

import { COLUMN_TYPE, analysableDimensions } from './profileColumns.js';
import { normalizeHeader } from './normalizeHeader.js';

export const ROLE = {
  ENTITY: 'entity',
  EVENT_DATE: 'eventDate',
  START_DATE: 'startDate',
  AMOUNT: 'amount',
  SCORE: 'score',
  OUTCOME: 'outcome',
  REASON: 'reason',
  SUBREASON: 'subreason',
};

// `types` gates which columns can hold the role at all. `keywords` ranks
// the survivors - a keyword hit is worth more than word order, so
// "Account Official Name" and "Customer ID" both land on ENTITY.
export const ROLE_DEFINITIONS = [
  {
    key: ROLE.ENTITY,
    label: 'Customer / account identifier',
    hint: 'Who the case belongs to. Findings are counted per distinct value.',
    required: true,
    types: [COLUMN_TYPE.ID, COLUMN_TYPE.CATEGORY, COLUMN_TYPE.TEXT],
    keywords: ['account', 'customer', 'client', 'company', 'organisation', 'organization', 'name', 'id'],
  },
  {
    key: ROLE.EVENT_DATE,
    label: 'Event date',
    hint: 'When the case concluded — churn date, resolution date, response date.',
    required: true,
    types: [COLUMN_TYPE.DATE],
    keywords: ['churn', 'termination', 'closed', 'close', 'resolved', 'resolution', 'end', 'response', 'submitted', 'completed'],
  },
  {
    key: ROLE.START_DATE,
    label: 'Start date',
    hint: 'When the case opened. Enables time-to-resolution analysis.',
    types: [COLUMN_TYPE.DATE],
    keywords: ['open', 'created', 'start', 'raised', 'logged', 'received'],
  },
  {
    key: ROLE.AMOUNT,
    label: 'Value / amount',
    hint: 'Revenue, contract value or any figure worth summing per customer.',
    types: [COLUMN_TYPE.NUMBER],
    keywords: ['revenue', 'value', 'turnover', 'amount', 'arr', 'mrr', 'spend', 'fee', 'cost', 'price'],
  },
  {
    key: ROLE.SCORE,
    label: 'Score / rating',
    hint: 'A 0–10 or 1–5 rating such as NPS or CSAT. Averaged, never summed.',
    types: [COLUMN_TYPE.SCORE],
    keywords: ['nps', 'score', 'rating', 'csat', 'satisfaction', 'recommend'],
  },
  {
    key: ROLE.OUTCOME,
    label: 'Outcome',
    hint: 'How the case ended — decision, resolution, status. Enables success-rate analysis.',
    types: [COLUMN_TYPE.CATEGORY],
    keywords: ['decision', 'outcome', 'result', 'status', 'resolution', 'disposition', 'stage'],
  },
  {
    key: ROLE.REASON,
    label: 'Primary reason',
    hint: 'The main "why" category.',
    types: [COLUMN_TYPE.CATEGORY],
    keywords: ['reason', 'cause', 'category', 'driver', 'type', 'theme'],
  },
  {
    key: ROLE.SUBREASON,
    label: 'Detailed reason',
    hint: 'A more granular "why", nested under the primary reason.',
    types: [COLUMN_TYPE.CATEGORY],
    keywords: ['subreason', 'sub reason', 'subcategory', 'sub category', 'detail', 'secondary'],
  },
];

function keywordScore(header, keywords) {
  const normalized = normalizeHeader(header);
  const words = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
  let best = 0;
  for (const keyword of keywords) {
    if (keyword.includes(' ')) {
      if (normalized.includes(keyword)) best = Math.max(best, 1);
      continue;
    }
    // A whole-word hit beats a substring hit: "type" matching "Case Churn
    // Type" should outrank "type" inside "Typography".
    if (words.has(keyword)) best = Math.max(best, 1);
    else if (normalized.includes(keyword)) best = Math.max(best, 0.6);
  }
  return best;
}

function scoreCandidate(profile, definition) {
  if (!definition.types.includes(profile.type)) return null;

  const keyword = keywordScore(profile.header, definition.keywords);
  // Type fit alone is a weak signal for roles that many columns could
  // fill, so those need a keyword hit; a SCORE column is distinctive
  // enough to claim its role on type alone.
  const typeIsDistinctive = profile.type === COLUMN_TYPE.SCORE;
  if (keyword === 0 && !typeIsDistinctive && definition.key !== ROLE.EVENT_DATE && definition.key !== ROLE.ENTITY) {
    return null;
  }

  // Prefer well-populated columns - a role filled by a 90%-blank column
  // produces analysis about almost nothing.
  const completeness = 1 - profile.nullRate;
  let score = keyword * 2 + completeness + (typeIsDistinctive ? 1 : 0);

  if (definition.key === ROLE.ENTITY) {
    // Cardinality is the real signal for an identifier, and header wording
    // alone gets it wrong: "Account Manager" and "Client" both hit an
    // entity keyword, but four managers across 120 rows cannot be who the
    // rows are about, while 120 distinct clients obviously can.
    score += profile.distinctRatio * 1.5;
    // A CRM URL is the most reliable key in a Salesforce export but reads
    // terribly in a written finding, so a human-readable column of similar
    // cardinality wins.
    if (profile.urlRate >= 0.5) score -= 2;
  }

  return score;
}

// Greedy assignment: strongest column/role pair first, and a column can
// only hold one role, so a single "Date" column becomes the event date
// rather than silently filling both date roles.
export function suggestRoles(profiles) {
  const candidates = [];
  for (const definition of ROLE_DEFINITIONS) {
    for (const profile of profiles) {
      const score = scoreCandidate(profile, definition);
      if (score !== null) candidates.push({ role: definition.key, header: profile.header, score, profile });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.header.localeCompare(b.header));

  const roles = {};
  const takenHeaders = new Set();
  for (const candidate of candidates) {
    if (roles[candidate.role] || takenHeaders.has(candidate.header)) continue;
    roles[candidate.role] = candidate.header;
    takenHeaders.add(candidate.header);
  }

  // With two date columns and no wording to separate them, the earlier one
  // is the start date. Exports routinely name them "Date" and "Date 2".
  const eventProfile = profiles.find((p) => p.header === roles[ROLE.EVENT_DATE]);
  const startProfile = profiles.find((p) => p.header === roles[ROLE.START_DATE]);
  if (eventProfile?.dateRange && startProfile?.dateRange && startProfile.dateRange.min > eventProfile.dateRange.min) {
    roles[ROLE.EVENT_DATE] = startProfile.header;
    roles[ROLE.START_DATE] = eventProfile.header;
  }

  for (const definition of ROLE_DEFINITIONS) {
    if (!roles[definition.key]) roles[definition.key] = null;
  }
  return roles;
}

// Every categorical column not already claimed by a named role stays
// available as a breakdown axis. This is what lets the findings engine
// sweep a complaints export it has never seen: the columns it does not
// recognise are still dimensions.
export function dimensionsFor(profiles, roles) {
  const claimed = new Set(Object.values(roles).filter(Boolean));
  // Reason, subreason and outcome are dimensions too - they just also have
  // dedicated analyses - so they are swept as well.
  for (const key of [ROLE.REASON, ROLE.SUBREASON, ROLE.OUTCOME]) {
    if (roles[key]) claimed.delete(roles[key]);
  }
  return analysableDimensions(profiles)
    .filter((p) => !claimed.has(p.header))
    .map((p) => p.header);
}

export function missingRequiredRoles(roles) {
  return ROLE_DEFINITIONS.filter((d) => d.required && !roles[d.key]).map((d) => d.label);
}
