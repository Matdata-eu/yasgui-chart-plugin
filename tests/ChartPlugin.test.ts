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
import { lengthPerCategory, textOnly } from './fixtures';

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
(global as any).ResizeObserver = FakeResizeObserver;

function makeYasr(results: any) {
  const yasr: any = {
    results: { json: results },
    resultsEl: document.createElement('div'),
    plugins: {},
    storePluginConfig: jest.fn(),
    getPrefixes: () => ({ ex: 'http://example.org/' }),
    executeQuery: jest.fn(),
  };
  document.body.appendChild(yasr.resultsEl);
  return yasr;
}

describe('ChartPlugin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is offered only for results with a numeric column', () => {
    expect(new ChartPlugin(makeYasr(lengthPerCategory)).canHandleResults()).toBe(true);
    expect(new ChartPlugin(makeYasr(textOnly)).canHandleResults()).toBe(false);
    expect(new ChartPlugin(makeYasr({ boolean: true })).canHandleResults()).toBe(false);
  });

  it('draws the toolbar and the chart', () => {
    const yasr = makeYasr(lengthPerCategory);
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    const typeSelect = yasr.resultsEl.querySelector('.chart-type-select') as HTMLSelectElement;
    expect(typeSelect.value).toBe('bar');
    expect(chartInstance.setOption).toHaveBeenCalled();
    const option = chartInstance.setOption.mock.calls[0][0];
    expect(option.xAxis.data).toEqual(['Main line', 'Branch line', 'Siding']);
  });

  it('saves the chosen chart type per tab, with the result variables', () => {
    const yasr = makeYasr(lengthPerCategory);
    const plugin = new ChartPlugin(yasr);
    yasr.plugins.Chart = plugin;
    plugin.draw();
    const typeSelect = yasr.resultsEl.querySelector('.chart-type-select') as HTMLSelectElement;
    typeSelect.value = 'pie';
    typeSelect.dispatchEvent(new Event('change'));
    expect(yasr.storePluginConfig).toHaveBeenCalledWith(
      'Chart',
      expect.objectContaining({
        chartType: 'pie',
        columns: ['category', 'categoryLabel', 'length'],
      })
    );
    expect(yasr.resultsEl.querySelector('.chart-reset-button')).not.toBeNull();
  });

  it('restores saved settings', () => {
    const yasr = makeYasr(lengthPerCategory);
    const plugin = new ChartPlugin(yasr);
    plugin.draw({ chartType: 'horizontal-bar', columns: ['category', 'categoryLabel', 'length'] });
    expect((yasr.resultsEl.querySelector('.chart-type-select') as HTMLSelectElement).value).toBe(
      'horizontal-bar'
    );
  });

  it('describes the IRI of a Ctrl+clicked bar', async () => {
    const yasr = makeYasr(lengthPerCategory);
    yasr.executeQuery.mockResolvedValue({
      head: { vars: ['subject', 'predicate', 'object'] },
      results: { bindings: [] },
    });
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    const clickHandler = chartInstance.on.mock.calls.find((c: any[]) => c[0] === 'click')[1];
    clickHandler({
      seriesIndex: 0,
      dataIndex: 1,
      event: { event: { ctrlKey: true, shiftKey: false } },
    });
    expect(yasr.executeQuery).toHaveBeenCalledTimes(1);
    expect(yasr.executeQuery.mock.calls[0][0]).toContain('<http://example.org/cat/B> ?p ?o');
    await Promise.resolve();
    expect(document.querySelector('.chart-describe-modal')).not.toBeNull();
    plugin.destroy();
  });

  it('ignores plain clicks', () => {
    const yasr = makeYasr(lengthPerCategory);
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    const clickHandler = chartInstance.on.mock.calls.find((c: any[]) => c[0] === 'click')[1];
    clickHandler({ seriesIndex: 0, dataIndex: 1, event: { event: { ctrlKey: false } } });
    expect(yasr.executeQuery).not.toHaveBeenCalled();
  });

  it('downloads a PNG through the YASR download button', () => {
    const yasr = makeYasr(lengthPerCategory);
    const plugin = new ChartPlugin(yasr);
    plugin.draw();
    const info = plugin.download('my-query');
    expect(info?.filename).toBe('my-query.png');
    expect(info?.getData()).toMatch(/^data:image\/png/);
  });

  it('shows a message for results without numbers', () => {
    const yasr = makeYasr(textOnly);
    new ChartPlugin(yasr).draw();
    expect(yasr.resultsEl.textContent).toContain('numeric column');
  });
});
