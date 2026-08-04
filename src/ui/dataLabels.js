import { getChartColors } from './chartColors.js';

// Draws the value on each bar. Registered globally (see chartSetup.js), so
// every chart gets labels unless it opts out with
// options.plugins.inlineDataLabels = false.
//
// Text is drawn with a surface-colored halo (thick stroke behind the fill)
// rather than a color picked per slice: that keeps labels legible over any
// palette hue - light or dark, saturated or pale - without ever putting the
// series color on the text itself.

const MIN_STACK_SLICE_PX = 16; // don't label a slice too thin to hold text
const MAX_LABELLED_BARS = 30; // beyond this the labels become clutter, not information

function formatValue(v) {
  return typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : String(v);
}

// Mirrors the dimming applied to a bar's fill, so a label over a dimmed
// (filtered-out) bar recedes with it instead of staying at full strength.
function alphaOf(color) {
  if (typeof color !== 'string') return 1;
  const m = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/);
  return m ? parseFloat(m[1]) : 1;
}

export const inlineDataLabels = {
  id: 'inlineDataLabels',
  afterDatasetsDraw(chart) {
    if (chart.options?.plugins?.inlineDataLabels === false) return;

    const { ctx } = chart;
    const colors = getChartColors();
    const horizontal = chart.options?.indexAxis === 'y';
    const stacked = Boolean(chart.options?.scales?.x?.stacked || chart.options?.scales?.y?.stacked);

    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.lineJoin = 'round';

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden || meta.data.length > MAX_LABELLED_BARS) return;

      meta.data.forEach((element, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined || value === 0) return;

        const fill = Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor[index]
          : dataset.backgroundColor;
        const alpha = alphaOf(fill);

        let x;
        let y;
        if (stacked) {
          const span = Math.abs((horizontal ? element.base - element.x : element.base - element.y));
          if (span < MIN_STACK_SLICE_PX) return;
          x = horizontal ? (element.x + element.base) / 2 : element.x;
          y = horizontal ? element.y : (element.y + element.base) / 2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
        } else if (horizontal) {
          x = element.x + 6;
          y = element.y;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        } else {
          x = element.x;
          y = element.y - 6;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
        }

        const text = formatValue(value);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.surface;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = colors.textPrimary;
        ctx.fillText(text, x, y);
      });
    });

    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
