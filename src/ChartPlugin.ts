/**
 * YASR plugin that visualises SPARQL SELECT results as charts
 */

import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';

import { analyzeColumns, getSelectResults, hasNumericColumn } from './columns';
import type { ColumnInfo } from './columns';
import { buildChartData } from './dataModel';
import type { ChartData } from './dataModel';
import { buildChartOption, iriForClick } from './chartOptions';
import { renderToolbar } from './controls';
import { resolveSettings, sanitizeSettings, settingsForColumns } from './settings';
import { getThemeColors, watchThemeChanges } from './theme';
import { DescribeModal } from './describe/describe-modal';
import { parseDescribeResponse } from './describe/describe-parser';
import { buildResourceQuery, sanitizePrefixes } from './describe/resource-query';
import type { ResourceDirection } from './describe/resource-query';
import type {
  ChartPluginOptions,
  ChartSettings,
  PrefixMap,
  ResolvedChartSettings,
  SparqlSelectResults,
  Yasr,
} from './types';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
  SVGRenderer,
]);

const DEFAULT_MAX_ROWS = 5000;
const MIN_CHART_HEIGHT = 320;

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
  '<path fill="currentColor" d="M3 3h2v16h16v2H3V3zm4 10h3v5H7v-5zm5-6h3v11h-3V7zm5 3h3v8h-3v-8z"/></svg>';

class ChartPlugin {
  /** Below the table (10), so SELECT results still open in the table */
  priority = 5;
  label = 'Chart';
  helpReference = 'https://matgui-doc.matdata.eu/docs/user-guide#chart-plugin';

  private yasr: Yasr;
  private options: ChartPluginOptions;
  private chart: echarts.ECharts | null = null;
  private chartEl: HTMLElement | null = null;
  private option: Record<string, any> | null = null;
  private data: ChartData | null = null;
  private columns: ColumnInfo[] = [];
  private results: SparqlSelectResults | null = null;
  private saved: ChartSettings = {};
  private resolved: ResolvedChartSettings | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private windowResizeHandler: (() => void) | null = null;
  private fullscreenObserver: MutationObserver | null = null;
  private describeModal: DescribeModal | null = null;
  private describeAbortController: AbortController | null = null;

  constructor(yasr: Yasr, options: ChartPluginOptions = {}) {
    this.yasr = yasr;
    const configured = (yasr as any)?.config?.plugins?.Chart?.options;
    this.options = { ...(configured || {}), ...options };
  }

  static get label(): string {
    return 'Chart';
  }

  static get priority(): number {
    return 5;
  }

  getIcon(): Element | undefined {
    const icon = document.createElement('div');
    icon.innerHTML = ICON_SVG;
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', 'Chart view');
    return icon;
  }

  /** Offered for SELECT results with at least one numeric column */
  canHandleResults(): boolean {
    const data = getSelectResults(this.yasr?.results);
    if (!data || data.results.bindings.length === 0) return false;
    return hasNumericColumn(analyzeColumns(data));
  }

  /** Name this plugin was registered under in YASR (normally "Chart") */
  private getPluginName(): string {
    const plugins = this.yasr.plugins || {};
    for (const name of Object.keys(plugins)) {
      if (plugins[name] === this) return name;
    }
    return 'Chart';
  }

  draw(persistentConfig?: unknown): void {
    this.cleanup();
    // New results: a describe opened from the previous ones no longer applies
    this.describeModal?.close();
    this.saved = sanitizeSettings(persistentConfig);
    this.yasr.resultsEl.innerHTML = '';

    const data = getSelectResults(this.yasr.results);
    if (!data || data.results.bindings.length === 0) {
      this.renderMessage('No results to chart');
      return;
    }
    this.results = data;
    this.saved = settingsForColumns(this.saved, data.head.vars);
    this.columns = analyzeColumns(data);
    if (!hasNumericColumn(this.columns)) {
      this.renderMessage('The chart needs at least one numeric column');
      return;
    }
    this.render();
  }

  private renderMessage(text: string): void {
    const el = document.createElement('div');
    el.className = 'yasgui-chart-plugin-empty';
    el.textContent = text;
    this.yasr.resultsEl.appendChild(el);
  }

  private getYasqe(): any | null {
    const yasr = this.yasr as any;
    return (
      yasr.yasqe || yasr.yasgui?.tab?.yasqe || yasr.tab?.yasqe || yasr.tab?.getYasqe?.() || null
    );
  }

  /** Prefixes of the Yasr config, overridden by those declared in the query */
  private getPrefixes(): PrefixMap {
    let prefixes: PrefixMap = {};
    try {
      if (typeof this.yasr.getPrefixes === 'function') {
        prefixes = sanitizePrefixes(this.yasr.getPrefixes());
      }
      const yasqe = this.getYasqe();
      if (yasqe && typeof yasqe.getPrefixesFromQuery === 'function') {
        prefixes = { ...prefixes, ...sanitizePrefixes(yasqe.getPrefixesFromQuery()) };
      }
    } catch (error) {
      console.warn('yasgui-chart-plugin: could not read prefixes', error);
    }
    return prefixes;
  }

  /** Build the toolbar and chart for the current results and settings */
  private render(): void {
    if (!this.results) return;
    this.disposeChart();
    this.yasr.resultsEl.innerHTML = '';

    const maxRows = this.options.maxRows ?? DEFAULT_MAX_ROWS;
    const allRows = this.results.results.bindings;
    const rows = allRows.length > maxRows ? allRows.slice(0, maxRows) : allRows;

    this.resolved = resolveSettings(this.columns, this.saved, rows.length);
    this.data = buildChartData(rows, this.columns, this.resolved, this.getPrefixes());

    const wrapper = document.createElement('div');
    wrapper.className = 'yasgui-chart-plugin';

    wrapper.appendChild(
      renderToolbar(
        {
          columns: this.columns,
          resolved: this.resolved,
          customised: Object.keys(this.saved).length > 0,
        },
        {
          onChange: (settings) => this.updateSettings(settings),
          onReset: () => this.updateSettings({}),
          onExport: (format) => this.exportImage(format),
        }
      )
    );

    const notes: string[] = [];
    if (allRows.length > maxRows) {
      notes.push(
        `Showing the first ${maxRows.toLocaleString('en-US')} of ${allRows.length.toLocaleString('en-US')} rows.`
      );
    }
    if (
      (this.resolved.chartType === 'pie' || this.resolved.chartType === 'donut') &&
      this.data.kind === 'category' &&
      this.data.series.length > 1
    ) {
      notes.push(`A pie chart shows one value; showing ${this.data.series[0].name}.`);
    }
    if (notes.length > 0) {
      const note = document.createElement('div');
      note.className = 'chart-note';
      note.textContent = notes.join(' ');
      wrapper.appendChild(note);
    }

    const chartEl = document.createElement('div');
    chartEl.className = 'chart-canvas';
    wrapper.appendChild(chartEl);
    this.chartEl = chartEl;
    this.yasr.resultsEl.appendChild(wrapper);

    const isEmpty =
      (this.data.kind === 'histogram' && this.data.bins.length === 0) ||
      (this.data.kind !== 'histogram' && this.data.series.length === 0);
    if (isEmpty) {
      chartEl.classList.add('chart-canvas-empty');
      chartEl.textContent = 'Nothing to plot with these columns';
      return;
    }

    this.updateHeight();
    this.chart = echarts.init(chartEl, null, { renderer: 'canvas' });
    this.applyOption();
    this.chart.on('click', (params: any) => this.handleChartClick(params));

    // The chart's width follows the results area; its height is set above
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(chartEl);
    this.windowResizeHandler = () => {
      this.updateHeight();
      this.chart?.resize();
    };
    window.addEventListener('resize', this.windowResizeHandler);
    // Entering or leaving YASR's fullscreen mode changes the room available
    const yasrRoot = this.yasr.resultsEl.closest('.yasr');
    if (yasrRoot) {
      this.fullscreenObserver = new MutationObserver(() => this.windowResizeHandler?.());
      this.fullscreenObserver.observe(yasrRoot, { attributes: true, attributeFilter: ['class'] });
    }

    this.themeObserver = watchThemeChanges(() => this.applyOption());

    this.outsideClickHandler = (e: MouseEvent) => {
      const picker = wrapper.querySelector('.chart-values-picker');
      if (picker && picker.hasAttribute('open') && !picker.contains(e.target as Node)) {
        picker.removeAttribute('open');
      }
    };
    document.addEventListener('mousedown', this.outsideClickHandler);
  }

  /**
   * Size the chart to the rest of the viewport. The results area grows with
   * its content, so its own height can't be used without a feedback loop.
   */
  private updateHeight(): void {
    if (!this.chartEl) return;
    const viewport = window.innerHeight || 800;
    const top = this.chartEl.getBoundingClientRect().top;
    const available = Math.floor(viewport - Math.max(0, top) - 24);
    const height =
      available >= MIN_CHART_HEIGHT
        ? available
        : Math.max(MIN_CHART_HEIGHT, Math.round(viewport * 0.6));
    this.chartEl.style.height = `${height}px`;
  }

  private applyOption(): void {
    if (!this.chart || !this.data || !this.resolved) return;
    this.option = buildChartOption(this.data, this.resolved, getThemeColors());
    this.chart.setOption(this.option, true);
  }

  private updateSettings(settings: ChartSettings): void {
    this.saved = sanitizeSettings(settings);
    if (Object.keys(this.saved).length > 0 && this.results)
      this.saved.columns = [...this.results.head.vars];
    if (typeof this.yasr.storePluginConfig === 'function') {
      try {
        this.yasr.storePluginConfig(this.getPluginName(), this.saved);
      } catch (error) {
        console.warn('yasgui-chart-plugin: could not save chart settings', error);
      }
    }
    this.render();
  }

  private handleChartClick(params: any): void {
    const event: MouseEvent | undefined = params?.event?.event;
    if (!event || !(event.ctrlKey || event.metaKey) || !this.data) return;
    const iri = iriForClick(this.data, params);
    if (!iri) return;
    this.runResourceQuery(iri, event.shiftKey ? 'object' : 'subject');
  }

  /**
   * Run a background query for the triples where `iri` is the subject (or
   * object) and show them in the describe modal, as the table and geo plugins do.
   */
  private async runResourceQuery(
    uri: string,
    direction: ResourceDirection,
    newHistory = true
  ): Promise<void> {
    if (!this.describeModal) {
      this.describeModal = new DescribeModal({
        onDescribe: (u, d) => this.runResourceQuery(u, d, false),
      });
    }
    if (typeof this.yasr.executeQuery !== 'function') {
      console.warn('yasgui-chart-plugin: background query execution is not available');
      return;
    }
    if (newHistory) this.describeModal.startHistory(uri, direction);

    this.describeAbortController?.abort();
    const controller = new AbortController();
    this.describeAbortController = controller;

    const prefixes = this.getPrefixes();
    const view = { direction, prefixes };
    this.describeModal.showLoading(uri, view);

    try {
      const response = await this.yasr.executeQuery(buildResourceQuery(uri, direction, prefixes), {
        acceptHeader: 'text/turtle',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const result = await parseDescribeResponse(response);
      if (controller.signal.aborted) return;
      this.describeModal?.showResults(uri, result, view);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('yasgui-chart-plugin: resource query failed', uri, direction, error);
      let raw = '';
      try {
        raw = typeof error?.response?.text === 'function' ? await error.response.text() : '';
      } catch {
        raw = '';
      }
      this.describeModal?.showError(uri, error, raw, view);
    } finally {
      if (this.describeAbortController === controller) this.describeAbortController = null;
    }
  }

  private fileName(extension: string, base?: string): string {
    const name = (base || 'chart').trim() || 'chart';
    return `${name}.${extension}`;
  }

  /** PNG data URL of the chart, with the theme background */
  getPngDataUrl(): string | null {
    if (!this.chart) return null;
    return this.chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: getThemeColors().background,
    });
  }

  /** SVG markup of the chart, rendered off-screen with the SVG renderer */
  getSvgString(): string | null {
    if (!this.chart || !this.option || !this.chartEl) return null;
    const width = this.chartEl.clientWidth || 800;
    const height = this.chartEl.clientHeight || 480;
    const svgChart = echarts.init(null as any, null, { renderer: 'svg', ssr: true, width, height });
    try {
      svgChart.setOption({
        ...this.option,
        animation: false,
        backgroundColor: getThemeColors().background,
        dataZoom: this.chart.getOption().dataZoom,
      });
      return svgChart.renderToSVGString();
    } finally {
      svgChart.dispose();
    }
  }

  private exportImage(format: 'png' | 'svg', base?: string): void {
    const link = document.createElement('a');
    let url: string | null = null;
    if (format === 'png') {
      url = this.getPngDataUrl();
    } else {
      const svg = this.getSvgString();
      if (svg) url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    if (!url) return;
    link.href = url;
    link.download = this.fileName(
      format,
      base || (this.yasr as any).config?.getDownloadFileName?.()
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url!), 1000);
  }

  /** YASR's download button saves the chart as a PNG image */
  download(filename?: string) {
    if (!this.chart) return undefined;
    return {
      getData: () => this.getPngDataUrl() || '',
      contentType: 'image/png',
      filename: this.fileName('png', filename),
      title: 'Download chart as PNG',
    };
  }

  private disposeChart(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.fullscreenObserver?.disconnect();
    this.fullscreenObserver = null;
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    if (this.outsideClickHandler) {
      document.removeEventListener('mousedown', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
    this.chartEl = null;
    this.option = null;
  }

  private cleanup(): void {
    this.disposeChart();
    this.describeAbortController?.abort();
    this.describeAbortController = null;
  }

  destroy(): void {
    this.cleanup();
    this.describeModal?.close();
    this.describeModal = null;
  }
}

export default ChartPlugin;
