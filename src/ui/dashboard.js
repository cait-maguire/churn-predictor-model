import { getState, resetAll } from '../state/store.js';
import { renderDataQualityPanel } from './dataQualityPanel.js';
import { renderFindingsPanel } from './findingsPanel.js';
import { render as renderOverview } from './widgets/overviewWidget.js';
import { render as renderRevenueDistribution } from './widgets/revenueDistributionWidget.js';
import { render as renderSegmentBreakdown } from './widgets/segmentBreakdownWidget.js';
import { render as renderReasonBreakdown } from './widgets/reasonBreakdownWidget.js';
import { render as renderSegmentReason } from './widgets/segmentReasonWidget.js';
import { render as renderDimensionBreakdown } from './widgets/dimensionBreakdownWidget.js';

export function renderDashboard(container) {
  const isChurn = getState().isChurnFormat;

  container.innerHTML = `
    <section class="dashboard">
      <div class="dashboard-header">
        <h1>${isChurn ? 'Churn Dashboard' : 'Case Analysis'}</h1>
        <button type="button" id="new-upload-btn" class="btn-secondary">Upload a different file</button>
      </div>
      <p class="session-notice">Nothing here is saved. Closing or refreshing this page clears all data.</p>
      <div id="findings-mount"></div>
      <div id="data-quality-mount"></div>
      <div class="widget-grid">
        ${
          isChurn
            ? `
          <div id="overview-mount"></div>
          <div id="revenue-distribution-mount"></div>
          <div id="segment-breakdown-mount"></div>
          <div id="reason-breakdown-mount"></div>
          <div id="segment-reason-mount"></div>`
            : `<div id="dimension-breakdown-mount"></div>`
        }
      </div>
    </section>
  `;

  container.querySelector('#new-upload-btn').addEventListener('click', () => resetAll());

  const mounts = {
    findings: container.querySelector('#findings-mount'),
    dq: container.querySelector('#data-quality-mount'),
    overview: container.querySelector('#overview-mount'),
    revenue: container.querySelector('#revenue-distribution-mount'),
    segment: container.querySelector('#segment-breakdown-mount'),
    reason: container.querySelector('#reason-breakdown-mount'),
    segmentReason: container.querySelector('#segment-reason-mount'),
    dimension: container.querySelector('#dimension-breakdown-mount'),
  };

  rerenderWidgets(mounts);
  return mounts;
}

export function rerenderWidgets(mounts) {
  const state = getState();

  renderFindingsPanel(mounts.findings, state);

  if (state.isChurnFormat) {
    renderDataQualityPanel(mounts.dq, state);
    renderOverview(mounts.overview, state);
    renderRevenueDistribution(mounts.revenue, state);
    renderSegmentBreakdown(mounts.segment, state);
    renderReasonBreakdown(mounts.reason, state);
    renderSegmentReason(mounts.segmentReason, state);
  } else {
    renderDimensionBreakdown(mounts.dimension, state);
  }
}
