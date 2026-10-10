/**
 * ECharts option builder
 *
 * Pure function from chart data, settings and theme colours to an ECharts
 * option object, kept free of DOM and chart instances so it can be tested.
 */

import type { ChartData, CategoryData, HistogramData, XYData } from './dataModel';
import type { ChartThemeColors } from './theme';
import type { ResolvedChartSettings } from './types';

/** Show a zoom slider when a category axis has more entries than this */
export const ZOOM_THRESHOLD = 40;

/** Turn off animation above this many data points */
const ANIMATION_LIMIT = 2000;

export const DESCRIBE_HINT = 'Ctrl+click to show its triples';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function iriLine(iri: string | undefined, label: string): string {
  if (!iri) return '';
  const extra = iri !== label ? `<div class="chart-tooltip-iri">${escapeHtml(iri)}</div>` : '';
  return `${extra}<div class="chart-tooltip-hint">${DESCRIBE_HINT}</div>`;
}

function baseOption(colors: ChartThemeColors, pointCount: number): Record<string, any> {
  return {
    color: colors.palette,
    backgroundColor: 'transparent',
    animation: pointCount <= ANIMATION_LIMIT,
    textStyle: { color: colors.text, fontFamily: 'inherit' },
    tooltip: {
      confine: true,
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      extraCssText: 'max-width: 420px; white-space: normal;',
    },
  };
}

function axisStyle(colors: ChartThemeColors) {
  return {
    axisLine: { lineStyle: { color: colors.border } },
    axisTick: { lineStyle: { color: colors.border } },
    axisLabel: { color: colors.textMuted },
    splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    nameTextStyle: { color: colors.textMuted },
  };
}

function legend(colors: ChartThemeColors, show: boolean) {
  return {
    show,
    type: 'scroll',
    top: 0,
    textStyle: { color: colors.text },
    pageTextStyle: { color: colors.textMuted },
    pageIconColor: colors.text,
    pageIconInactiveColor: colors.border,
  };
}

function categoryOption(
  data: CategoryData,
  settings: ResolvedChartSettings,
  colors: ChartThemeColors
): Record<string, any> {
  const pointCount = data.categories.length * Math.max(1, data.series.length);
  const option = baseOption(colors, pointCount);
  const labels = data.categories.map((c) => c.label);

  if (settings.chartType === 'pie' || settings.chartType === 'donut') {
    const first = data.series[0];
    const values = first ? first.values : [];
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = (p: any) => {
      const category = data.categories[p.data.categoryIndex];
      return (
        `<strong>${escapeHtml(category.label)}</strong><br/>` +
        `${escapeHtml(first?.name || '')}: ${formatNumber(p.value)} (${p.percent}%)` +
        iriLine(category.iri, category.label)
      );
    };
    option.legend = legend(colors, data.categories.length <= 30);
    option.series = [
      {
        type: 'pie',
        name: first?.name || '',
        radius: settings.chartType === 'donut' ? ['40%', '70%'] : '70%',
        center: ['50%', '55%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: colors.background, borderWidth: 1 },
        label: { color: colors.text, formatter: '{b}: {d}%' },
        data: data.categories
          // Slices keep their category index: empty and negative values are dropped
          .map((c, i) => ({ name: c.label, value: values[i], categoryIndex: i }))
          .filter((d) => d.value !== null && d.value !== undefined && d.value > 0),
      },
    ];
    return option;
  }

  const horizontal = settings.chartType === 'horizontal-bar';
  const isLine = settings.chartType === 'line' || settings.chartType === 'area';
  const stacked = settings.chartType === 'stacked-bar';

  const categoryAxis: Record<string, any> = {
    type: 'category',
    data: labels,
    ...axisStyle(colors),
    axisLabel: {
      color: colors.textMuted,
      hideOverlap: true,
      rotate: !horizontal && labels.length > 8 ? 35 : 0,
      overflow: 'truncate',
      width: horizontal ? 160 : 120,
    },
    boundaryGap: !isLine,
  };
  if (horizontal) categoryAxis.inverse = true;
  const valueAxis: Record<string, any> = { type: 'value', ...axisStyle(colors) };
  if (data.series.length === 1) {
    valueAxis.name = data.series[0].name;
    if (horizontal) Object.assign(valueAxis, { nameLocation: 'middle', nameGap: 28 });
  }

  option.grid = {
    left: 16,
    right: 24,
    top: data.series.length > 1 ? 40 : 30,
    bottom: horizontal && valueAxis.name ? 36 : 16,
    containLabel: true,
  };
  option.xAxis = horizontal ? valueAxis : categoryAxis;
  option.yAxis = horizontal ? categoryAxis : valueAxis;
  option.legend = legend(colors, data.series.length > 1);
  option.tooltip.trigger = 'axis';
  option.tooltip.axisPointer = { type: isLine ? 'line' : 'shadow' };
  option.tooltip.formatter = (params: any) => {
    const list = Array.isArray(params) ? params : [params];
    if (list.length === 0) return '';
    const category = data.categories[list[0].dataIndex];
    const rows = list
      .filter((p: any) => p.value !== null && p.value !== undefined)
      .map(
        (p: any) =>
          `${p.marker}${escapeHtml(p.seriesName)}: <strong>${formatNumber(p.value)}</strong>`
      )
      .join('<br/>');
    return `<strong>${escapeHtml(category.label)}</strong><br/>${rows}${iriLine(category.iri, category.label)}`;
  };

  if (labels.length > ZOOM_THRESHOLD) {
    const axisIndex = horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 };
    const visible = Math.min(100, Math.max(5, (ZOOM_THRESHOLD / labels.length) * 100));
    option.dataZoom = [
      { type: 'inside', ...axisIndex, start: 0, end: visible },
      {
        type: 'slider',
        ...axisIndex,
        start: 0,
        end: visible,
        textStyle: { color: colors.textMuted },
        borderColor: colors.border,
        ...(horizontal ? { right: 4, width: 18 } : { bottom: 4, height: 18 }),
      },
    ];
    option.grid[horizontal ? 'right' : 'bottom'] = 36;
  }

  option.series = data.series.map((s) => ({
    type: isLine ? 'line' : 'bar',
    name: s.name,
    data: s.values,
    stack: stacked ? 'total' : undefined,
    areaStyle: settings.chartType === 'area' ? { opacity: 0.25 } : undefined,
    connectNulls: isLine,
    showSymbol: isLine && labels.length <= 100,
    emphasis: { focus: 'series' },
    large: !isLine && labels.length > 1000,
  }));
  return option;
}

function xyOption(
  data: XYData,
  settings: ResolvedChartSettings,
  colors: ChartThemeColors
): Record<string, any> {
  const pointCount = data.series.reduce((n, s) => n + s.points.length, 0);
  const option = baseOption(colors, pointCount);
  const scatter = settings.chartType === 'scatter';
  const formatX = (x: number) =>
    data.xAxis === 'time'
      ? new Date(x).toISOString().replace('T00:00:00.000Z', '').replace('.000Z', 'Z')
      : formatNumber(x);

  // Room for the x axis name, which containLabel doesn't account for
  option.grid = {
    left: 16,
    right: 24,
    top: data.series.length > 1 ? 40 : 30,
    bottom: 36,
    containLabel: true,
  };
  option.xAxis = {
    type: data.xAxis,
    name: data.xName,
    nameLocation: 'middle',
    nameGap: 28,
    scale: data.xAxis === 'value',
    ...axisStyle(colors),
  };
  option.yAxis = { type: 'value', scale: scatter, ...axisStyle(colors) };
  if (data.series.length === 1) option.yAxis.name = data.series[0].name;
  option.legend = legend(colors, data.series.length > 1);
  option.tooltip.trigger = 'item';
  option.tooltip.formatter = (p: any) => {
    const point = data.series[p.seriesIndex]?.points[p.dataIndex];
    if (!point) return '';
    const title = point.label ? `<strong>${escapeHtml(point.label)}</strong><br/>` : '';
    return (
      title +
      `${escapeHtml(data.xName)}: ${escapeHtml(formatX(point.x))}<br/>` +
      `${p.marker}${escapeHtml(p.seriesName)}: <strong>${formatNumber(point.y)}</strong>` +
      iriLine(point.iri, point.label || '')
    );
  };
  option.series = data.series.map((s) => ({
    type: scatter ? 'scatter' : 'line',
    name: s.name,
    data: s.points.map((p) => [p.x, p.y]),
    symbolSize: scatter ? 8 : 4,
    showSymbol: !scatter && s.points.length <= 100,
    areaStyle: settings.chartType === 'area' ? { opacity: 0.25 } : undefined,
    emphasis: { focus: 'series' },
    large: scatter && s.points.length > 2000,
  }));
  return option;
}

function histogramOption(data: HistogramData, colors: ChartThemeColors): Record<string, any> {
  const option = baseOption(colors, data.bins.length);
  // Enough decimals to tell neighbouring bin edges apart, and no more
  const width = data.bins.length > 0 ? data.bins[0].to - data.bins[0].from : 0;
  const digits = width > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(width)) + 1)) : 2;
  const edge = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
  const labels = data.bins.map((b) =>
    b.from === b.to ? edge(b.from) : `${edge(b.from)} – ${edge(b.to)}`
  );
  option.grid = { left: 16, right: 24, top: 30, bottom: 44, containLabel: true };
  option.xAxis = {
    type: 'category',
    data: labels,
    name: data.column,
    nameLocation: 'middle',
    nameGap: 40,
    ...axisStyle(colors),
    axisLabel: { color: colors.textMuted, hideOverlap: true, rotate: labels.length > 6 ? 30 : 0 },
  };
  option.yAxis = { type: 'value', name: 'Count', minInterval: 1, ...axisStyle(colors) };
  option.legend = legend(colors, false);
  option.tooltip.trigger = 'axis';
  option.tooltip.axisPointer = { type: 'shadow' };
  option.tooltip.formatter = (params: any) => {
    const p = Array.isArray(params) ? params[0] : params;
    return `${escapeHtml(data.column)}: ${escapeHtml(labels[p.dataIndex])}<br/>Count: <strong>${formatNumber(p.value)}</strong>`;
  };
  option.series = [
    { type: 'bar', name: 'Count', data: data.bins.map((b) => b.count), barCategoryGap: '4%' },
  ];
  return option;
}

/** Build the ECharts option for the chart data */
export function buildChartOption(
  data: ChartData,
  settings: ResolvedChartSettings,
  colors: ChartThemeColors
): Record<string, any> {
  if (data.kind === 'histogram') return histogramOption(data, colors);
  if (data.kind === 'xy') return xyOption(data, settings, colors);
  return categoryOption(data, settings, colors);
}

/**
 * The IRI behind a clicked chart element, if any: the category (or point)
 * first, then the series.
 */
export function iriForClick(
  data: ChartData,
  params: { seriesIndex?: number; dataIndex?: number; data?: any }
): string | undefined {
  if (data.kind === 'category') {
    const index =
      params.data &&
      typeof params.data === 'object' &&
      typeof params.data.categoryIndex === 'number'
        ? params.data.categoryIndex
        : params.dataIndex;
    const category = index !== undefined ? data.categories[index] : undefined;
    if (category?.iri) return category.iri;
    return params.seriesIndex !== undefined ? data.series[params.seriesIndex]?.iri : undefined;
  }
  if (data.kind === 'xy') {
    const series = params.seriesIndex !== undefined ? data.series[params.seriesIndex] : undefined;
    const point =
      series && params.dataIndex !== undefined ? series.points[params.dataIndex] : undefined;
    return point?.iri || series?.iri;
  }
  return undefined;
}
