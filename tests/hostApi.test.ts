/**
 * The plugin with and without the YASR host API (shared describe panel and
 * plugin toolbar slot), using mock YASR instances.
 */

const chartInstance = {
  setOption: jest.fn(),
  on: jest.fn(),
  resize: jest.fn(),
  dispose: jest.fn(),
  getDataURL: jest.fn(() => 'data:image/png;base64,AAAA'),
  getOption: jest.fn(() => ({})),
  renderToSVGString: jest.fn(() => '<svg></svg>'),
};

jest.mock('echarts/core', () => ({ use: jest.fn(), init: jest.fn(() => chartInstance) }));
jest.mock('echarts/charts', () => ({}));
jest.mock('echarts/components', () => ({}));
jest.mock('echarts/renderers', () => ({}));

import ChartPlugin from '../src/ChartPlugin';
import { getHostToolbar, hasHostDescribe } from '../src/host';
import { getThemeColors } from '../src/theme';
import { lengthPerCategory } from './fixtures';

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
(global as any).ResizeObserver = FakeResizeObserver;

/** Today's published YASR: no host API */
function makeOldYasr(results: any = lengthPerCategory) {
  const yasr: any = {
    results: { json: results },
    resultsEl: document.createElement('div'),
    plugins: {},
    storePluginConfig: jest.fn(),
    getPrefixes: () => ({ ex: 'http://example.org/' }),
    executeQuery: jest.fn().mockResolvedValue({
      head: { vars: ['subject', 'predicate', 'object'] },
      results: { bindings: [] },
    }),
  };
  document.body.appendChild(yasr.resultsEl);
  return yasr;
}

/** A YASR with host API version 1 */
function makeHostYasr(results: any = lengthPerCategory) {
  const yasr = makeOldYasr(results);
  const slot = document.createElement('div');
  slot.className = 'yasr_pluginToolbar';
  document.body.appendChild(slot);
  yasr.hostApi = { version: 1, describe: true, toolbar: true };
  yasr.describe = jest.fn().mockResolvedValue(undefined);
  yasr.closeDescribe = jest.fn();
  yasr.getPluginToolbar = jest.fn(() => slot);
  return { yasr, slot };
}

function ctrlClickBar(shiftKey = false) {
  const call = chartInstance.on.mock.calls.filter((c: any[]) => c[0] === 'click').pop()!;
  call[1]({ seriesIndex: 0, dataIndex: 1, event: { event: { ctrlKey: true, shiftKey } } });
}

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
});

describe('feature detection', () => {
  it('needs both the hostApi flag and the method', () => {
    expect(hasHostDescribe(makeOldYasr())).toBe(false);
    expect(getHostToolbar(makeOldYasr())).toBeNull();

    const flagOnly: any = makeOldYasr();
    flagOnly.hostApi = { version: 1, describe: true, toolbar: true };
    expect(hasHostDescribe(flagOnly)).toBe(false);
    expect(getHostToolbar(flagOnly)).toBeNull();

    const methodsOnly: any = makeOldYasr();
    methodsOnly.describe = jest.fn();
    methodsOnly.getPluginToolbar = jest.fn(() => document.createElement('div'));
    expect(hasHostDescribe(methodsOnly)).toBe(false);
    expect(getHostToolbar(methodsOnly)).toBeNull();
    expect(methodsOnly.getPluginToolbar).not.toHaveBeenCalled();

    const { yasr, slot } = makeHostYasr();
    expect(hasHostDescribe(yasr)).toBe(true);
    expect(getHostToolbar(yasr)).toBe(slot);
  });
});

describe('without the host API (today’s YASR)', () => {
  it('draws its own toolbar above the chart', () => {
    const yasr = makeOldYasr();
    new ChartPlugin(yasr).draw();
    const toolbar = yasr.resultsEl.querySelector('.chart-toolbar')!;
    expect(toolbar).not.toBeNull();
    expect(toolbar.querySelector('.chart-type-select')).not.toBeNull();
    expect(toolbar.querySelector('.chart-export-png')).not.toBeNull();
    expect(document.querySelector('.yasr_toolbarSelect')).toBeNull();
  });

  it('opens its own describe modal', async () => {
    const yasr = makeOldYasr();
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    ctrlClickBar();
    expect(yasr.executeQuery).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    const modal = document.querySelector('.chart-describe-modal')!;
    expect(modal).not.toBeNull();
    // Lucide icons, no glyphs
    expect(modal.querySelectorAll('.chart-describe-modal-nav-button svg').length).toBe(3);
    expect(modal.querySelector('.chart-modal-close svg')).not.toBeNull();
    expect(modal.textContent).not.toMatch(/[⏮◀▶×]/);
    plugin.destroy();
  });
});

describe('with the host API', () => {
  it('opens IRIs in the shared describe panel', () => {
    const { yasr } = makeHostYasr();
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    ctrlClickBar();
    expect(yasr.describe).toHaveBeenCalledWith('http://example.org/cat/B', {
      direction: 'outgoing',
      source: 'Chart',
    });
    ctrlClickBar(true);
    expect(yasr.describe).toHaveBeenLastCalledWith('http://example.org/cat/B', {
      direction: 'incoming',
      source: 'Chart',
    });
    expect(yasr.executeQuery).not.toHaveBeenCalled();
    expect(document.querySelector('.chart-describe-modal')).toBeNull();
  });

  it('logs a failing describe instead of throwing', async () => {
    const { yasr } = makeHostYasr();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    yasr.describe.mockRejectedValueOnce(new Error('boom'));
    new ChartPlugin(yasr).draw();
    expect(() => ctrlClickBar()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('renders the controls in the toolbar slot with the shared classes', () => {
    const { yasr, slot } = makeHostYasr();
    new ChartPlugin(yasr).draw();

    expect(yasr.resultsEl.querySelector('.chart-toolbar')).toBeNull();
    expect(yasr.resultsEl.querySelector('.chart-canvas')).not.toBeNull();

    const children = Array.from(slot.children);
    expect(children.map((c) => c.className)).toEqual([
      'yasr_toolbarGroup chart-toolbar-pickers',
      'yasr_toolbarSpacer',
      'chart-view-settings',
    ]);

    const fields = Array.from(slot.querySelectorAll('.yasr_toolbarSelect'));
    expect(fields.map((f) => f.querySelector('span')!.textContent)).toEqual([
      'Type',
      'X axis',
      'Values',
      'Series',
    ]);
    const typeField = fields[0];
    expect(typeField.tagName).toBe('LABEL');
    expect(typeField.children[0].tagName).toBe('SPAN');
    expect(typeField.children[1].tagName).toBe('SELECT');
    expect((typeField.querySelector('select') as HTMLSelectElement).value).toBe('bar');
    // The values picker is not wrapped in a <label>, which would toggle its first checkbox
    expect(fields[2].tagName).toBe('DIV');

    // View settings sits at the far right with the sliders icon
    const viewSettings = slot.lastElementChild!.querySelector('.yasr_toolbarButton')!;
    expect(viewSettings.textContent).toBe('View settings');
    expect(viewSettings.querySelector('svg.chart-icon-sliders-horizontal')).not.toBeNull();
  });

  it('re-renders in place when a setting changes', () => {
    const { yasr, slot } = makeHostYasr();
    const foreign = document.createElement('span');
    const plugin = new ChartPlugin(yasr);
    yasr.plugins.Chart = plugin;
    plugin.draw();
    slot.appendChild(foreign);

    const typeSelect = slot.querySelector('.chart-type-select') as HTMLSelectElement;
    typeSelect.value = 'line';
    typeSelect.dispatchEvent(new Event('change'));

    expect(yasr.storePluginConfig).toHaveBeenCalledWith(
      'Chart',
      expect.objectContaining({ chartType: 'line' })
    );
    expect(slot.querySelectorAll('.chart-toolbar-pickers').length).toBe(1);
    expect((slot.querySelector('.chart-type-select') as HTMLSelectElement).value).toBe('line');
    // Elements it didn't add are left alone
    expect(slot.contains(foreign)).toBe(true);

    plugin.destroy();
    expect(slot.querySelector('.chart-toolbar-pickers')).toBeNull();
    expect(slot.contains(foreign)).toBe(true);
  });

  it('has the reset and exports in the view settings menu', () => {
    const { yasr, slot } = makeHostYasr();
    const plugin = new ChartPlugin(yasr);
    yasr.plugins.Chart = plugin;
    plugin.draw();

    const toggle = slot.querySelector('.chart-view-settings-button') as HTMLButtonElement;
    const menu = () => slot.querySelector('.chart-view-settings-menu') as HTMLElement;
    expect(menu().hidden).toBe(true);
    expect((slot.querySelector('.chart-reset-button') as HTMLButtonElement).disabled).toBe(true);

    toggle.click();
    expect(menu().hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    // A click elsewhere closes it
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu().hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    (slot.querySelector('.chart-export-png') as HTMLButtonElement).click();
    expect(chartInstance.getDataURL).toHaveBeenCalled();

    plugin.draw({ chartType: 'pie', columns: ['category', 'categoryLabel', 'length'] });
    const reset = slot.querySelector('.chart-reset-button') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    reset.click();
    expect(yasr.storePluginConfig).toHaveBeenLastCalledWith('Chart', {});
  });

  it('leaves the slot empty when there is nothing to chart', () => {
    const { yasr, slot } = makeHostYasr({ head: { vars: [] }, results: { bindings: [] } });
    new ChartPlugin(yasr).draw();
    expect(slot.children.length).toBe(0);
  });
});

describe('series colours', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--yasgui-brand');
    document.documentElement.style.removeProperty('--yasgui-highlight');
    document.documentElement.removeAttribute('data-theme');
  });

  it('falls back to MatData brand blue and amber', () => {
    const light = getThemeColors();
    expect(light.palette[0]).toBe('#0563bb');
    expect(light.highlight).toBe('#f2b300');
    expect(light.palette.length).toBe(10);
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = getThemeColors();
    expect(dark.palette[0]).toBe('#5aa8f2');
    expect(dark.highlight).toBe('#f5c242');
  });

  it('reads --yasgui-brand and --yasgui-highlight', () => {
    document.documentElement.style.setProperty('--yasgui-brand', '#123456');
    document.documentElement.style.setProperty('--yasgui-highlight', '#abcdef');
    const colors = getThemeColors();
    expect(colors.palette[0]).toBe('#123456');
    expect(colors.palette[1]).toBe('#e07b39');
    expect(colors.highlight).toBe('#abcdef');
  });
});
