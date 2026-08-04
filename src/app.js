import { getState, subscribe } from './state/store.js';
import { renderUploadScreen } from './ui/uploadScreen.js';
import { renderMappingScreen } from './ui/mappingScreen.js';
import { renderDashboard, rerenderWidgets } from './ui/dashboard.js';

function main() {
  const root = document.getElementById('app-root');
  let dashboardMounts = null;

  function render() {
    const state = getState();

    if (state.screen === 'upload') {
      dashboardMounts = null;
      renderUploadScreen(root);
    } else if (state.screen === 'mapping') {
      dashboardMounts = null;
      renderMappingScreen(root);
    } else if (state.screen === 'dashboard') {
      if (!dashboardMounts) {
        dashboardMounts = renderDashboard(root);
      } else {
        rerenderWidgets(dashboardMounts);
      }
    }
  }

  subscribe(render);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
