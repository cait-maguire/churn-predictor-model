import { getState, resetAll } from '../state/store.js';
import { renderDataQualityPanel } from './dataQualityPanel.js';
import { renderTrainingTablePanel, preserveOpenState } from './trainingTablePanel.js';
import { render as renderOverview } from './widgets/overviewWidget.js';
import { render as renderRevenueDistribution } from './widgets/revenueDistributionWidget.js';
import { render as renderSegmentBreakdown } from './widgets/segmentBreakdownWidget.js';
import { render as renderReasonBreakdown } from './widgets/reasonBreakdownWidget.js';
import { render as renderSegmentReason } from './widgets/segmentReasonWidget.js';

export function renderDashboard(container) {
  container.innerHTML = `
    <section class="dashboard">
      <div class="dashboard-header">
        <h1>Churn Dashboard</h1>
        <button type="button" id="new-upload-btn" class="btn-secondary">Upload a different file</button>
      </div>
      <p class="session-notice">Nothing here is saved. Closing or refreshing this page clears all data.</p>
      <div id="data-quality-mount"></div>
      <div id="training-table-mount"></div>
      <div class="widget-grid">
        <div id="overview-mount"></div>
        <div id="revenue-distribution-mount"></div>
        <div id="segment-breakdown-mount"></div>
        <div id="reason-breakdown-mount"></div>
        <div id="segment-reason-mount"></div>
      </div>
    </section>
  `;

  container.querySelector('#new-upload-btn').addEventListener('click', () => resetAll());

  const mounts = {
    dq: container.querySelector('#data-quality-mount'),
    trainingTable: container.querySelector('#training-table-mount'),
    overview: container.querySelector('#overview-mount'),
    revenue: container.querySelector('#revenue-distribution-mount'),
    segment: container.querySelector('#segment-breakdown-mount'),
    reason: container.querySelector('#reason-breakdown-mount'),
    segmentReason: container.querySelector('#segment-reason-mount'),
  };

  rerenderWidgets(mounts);
  return mounts;
}

export function rerenderWidgets(mounts) {
  const state = getState();
  renderDataQualityPanel(mounts.dq, state);
  preserveOpenState(mounts.trainingTable, () => renderTrainingTablePanel(mounts.trainingTable, state));
  renderOverview(mounts.overview, state);
  renderRevenueDistribution(mounts.revenue, state);
  renderSegmentBreakdown(mounts.segment, state);
  renderReasonBreakdown(mounts.reason, state);
  renderSegmentReason(mounts.segmentReason, state);
}
