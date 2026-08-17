// The findings section: what the data says, in sentences, above the charts.
//
// Deliberately opinionated about honesty. It states how many questions were
// asked to reach the answers shown, marks thin evidence rather than hiding
// it, and when nothing clears the bar it says so plainly instead of
// padding the page with weak observations.

import { buildFindings } from '../lib/findings.js';
import { dimensionsFor, ROLE } from '../lib/roles.js';
import { escapeHtml, formatNumber, formatDate } from './utils.js';

const KIND_LABEL = {
  concentration: 'Concentration',
  valueVsCount: 'Value vs volume',
  crossLift: 'Pattern',
  duration: 'Time to close',
  score: 'Score',
  trend: 'Trend',
};

export function computeFindings(state) {
  const dimensions = dimensionsFor(state.columnProfiles, state.roles);
  return { ...buildFindings(state.rawRows, state.roles, dimensions), dimensions };
}

function overviewSentence(overview, roles) {
  const parts = [];
  parts.push(
    `<strong>${formatNumber(overview.caseCount)}</strong> cases covering <strong>${formatNumber(overview.entityCount)}</strong> customers`
  );
  if (overview.dateFrom !== null && overview.dateTo !== null) {
    parts.push(`between ${formatDate(overview.dateFrom)} and ${formatDate(overview.dateTo)}`);
  }
  let text = parts.join(' ') + '.';

  if (overview.totalAmount !== null && roles[ROLE.AMOUNT]) {
    const basis = overview.amountPerEntity
      ? 'counted once per customer, since that column repeats across a customer&rsquo;s cases'
      : 'summed across cases';
    text += ` Total ${escapeHtml(roles[ROLE.AMOUNT])}: <strong>${formatNumber(Math.round(overview.totalAmount))}</strong> — ${basis}.`;
  }
  if (overview.meanScore !== null) {
    text += ` Average score <strong>${overview.meanScore.toFixed(1)}</strong>`;
    text += overview.nps !== null ? `, NPS <strong>${overview.nps}</strong>.` : '.';
  }
  return text;
}

export function renderFindingsPanel(container, state) {
  if (!state.rawRows || state.rawRows.length === 0 || !state.roles?.[ROLE.ENTITY]) {
    container.innerHTML = '';
    return;
  }

  const { overview, findings, candidateCount, dimensions } = computeFindings(state);

  const body =
    findings.length === 0
      ? `
        <p class="findings-empty">
          ${
            candidateCount === 0
              ? `No comparison in this file had enough cases behind it to be worth testing.`
              : `Nothing here clears the evidence bar: ${formatNumber(candidateCount)}
                 ${candidateCount === 1 ? 'comparison was' : 'comparisons were'} tested, and none combined a
                 large enough difference with a big enough sample to be worth stating.`
          }
          ${
            overview.caseCount < 100
              ? `With ${formatNumber(overview.caseCount)} cases that is expected — differences at this scale
                 cannot be told apart from chance, and stating them anyway would be the mistake.`
              : `That is a real answer, not a failure: this data does not support a confident story.`
          }
        </p>`
      : `
        <ol class="findings-list">
          ${findings
            .map(
              (finding) => `
            <li class="finding finding-${escapeHtml(finding.confidence)}">
              <span class="finding-kind">${escapeHtml(KIND_LABEL[finding.kind] || finding.kind)}</span>
              <span class="finding-text">${escapeHtml(finding.text)}</span>
              <span class="finding-meta">
                n=${formatNumber(finding.n)}${finding.dimension ? ` · ${escapeHtml(finding.dimension)}` : ''}
                ${finding.confidence === 'indicative' ? '<em class="finding-thin">thin evidence</em>' : ''}
              </span>
            </li>`
            )
            .join('')}
        </ol>
        <p class="findings-footnote">
          ${formatNumber(findings.length)} of ${formatNumber(candidateCount)} comparisons across
          ${formatNumber(dimensions.length)} ${dimensions.length === 1 ? 'column' : 'columns'} cleared
          the thresholds for effect size, sample size and statistical significance. Findings marked
          <em>thin evidence</em> rest on fewer than 25 cases — treat them as leads, not conclusions.
        </p>`;

  container.innerHTML = `
    <section class="panel findings-panel">
      <h2 class="findings-title">What this data says</h2>
      <p class="findings-overview">${overviewSentence(overview, state.roles)}</p>
      ${body}
    </section>
  `;
}
