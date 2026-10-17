import { analyzeColumns } from '../src/columns';
import {
  buildChartOption,
  escapeHtml,
  formatNumber,
  iriForClick,
  ZOOM_THRESHOLD,
} from '../src/chartOptions';
import { buildChartData } from '../src/dataModel';
import { resolveSettings } from '../src/settings';
import type { ChartThemeColors } from '../src/theme';
import type { ChartSettings } from '../src/types';
import {
  dec,
  iri,
  lengthPerCategory,
  lit,
  perMonth,
  pointsPerCountryAndType,
  select,
} from './fixtures';

const colors: ChartThemeColors = {
  dark: false,
  text: '#000',
  textMuted: '#666',
  border: '#ccc',
  background: '#fff',
  tooltipBackground: '#fff',
  palette: ['#111', '#222'],
};

function setup(data: any, saved: ChartSettings = {}) {
  const columns = analyzeColumns(data);
  const settings = resolveSettings(columns, saved, data.results.bindings.length);
  const chartData = buildChartData(data.results.bindings, columns, settings, {});
  return { chartData, settings, option: buildChartOption(chartData, settings, colors) };
}

describe('buildChartOption', () => {
  it('builds a bar chart', () => {
    const { option } = setup(lengthPerCategory);
    expect(option.xAxis.type).toBe('category');
    expect(option.xAxis.data).toEqual(['Main line', 'Branch line', 'Siding']);
    expect(option.series).toHaveLength(1);
    expect(option.series[0]).toMatchObject({ type: 'bar', data: [1200.5, 340, 55.25] });
    expect(option.legend.show).toBe(false);
  });

  it('colours the hovered item with the highlight colour when there is one', () => {
    const { chartData, settings, option } = setup(lengthPerCategory);
    expect(option.series[0].emphasis).toEqual({ focus: 'series' });
    const highlighted = buildChartOption(chartData, settings, { ...colors, highlight: '#f2b300' });
    expect(highlighted.color).toEqual(['#111', '#222']);
    expect(highlighted.series[0].emphasis).toEqual({
      focus: 'series',
      itemStyle: { color: '#f2b300' },
    });
  });

  it('stacks bars and shows a legend for several series', () => {
    const { option } = setup(pointsPerCountryAndType, { chartType: 'stacked-bar' });
    expect(option.series.map((s: any) => s.stack)).toEqual(['total', 'total']);
    expect(option.legend.show).toBe(true);
  });

  it('swaps the axes for horizontal bars', () => {
    const { option } = setup(lengthPerCategory, { chartType: 'horizontal-bar' });
    expect(option.yAxis.type).toBe('category');
    expect(option.xAxis.type).toBe('value');
  });

  it('builds pie and donut charts without empty slices', () => {
    const results = select(
      ['c', 'n'],
      [
        [lit('a'), dec(2)],
        [lit('b'), dec(0)],
        [lit('c'), dec(3)],
      ]
    );
    const pie = setup(results, { chartType: 'pie' }).option;
    expect(pie.series[0].type).toBe('pie');
    expect(pie.series[0].data.map((d: any) => [d.name, d.categoryIndex])).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
    const donut = setup(results, { chartType: 'donut' }).option;
    expect(donut.series[0].radius).toEqual(['40%', '70%']);
  });

  it('uses a time axis for lines over dates', () => {
    const { option } = setup(perMonth);
    expect(option.xAxis.type).toBe('time');
    expect(option.series[0].type).toBe('line');
  });

  it('fills the area for area charts', () => {
    const { option } = setup(perMonth, { chartType: 'area' });
    expect(option.series[0].areaStyle).toBeDefined();
  });

  it('adds a zoom slider for many categories', () => {
    const rows = Array.from({ length: ZOOM_THRESHOLD + 10 }, (_, i) => [lit(`c${i}`), dec(i)]);
    const { option } = setup(select(['c', 'n'], rows));
    expect(option.dataZoom).toHaveLength(2);
  });

  it('builds a histogram', () => {
    const { option } = setup(lengthPerCategory, { chartType: 'histogram' });
    expect(option.yAxis.name).toBe('Count');
    expect(option.series[0].type).toBe('bar');
  });

  it('escapes HTML in tooltips', () => {
    const results = select(['c', 'n'], [[lit('<b>x</b>'), dec(1)]]);
    const { option } = setup(results);
    const html = option.tooltip.formatter([
      { dataIndex: 0, value: 1, seriesName: 'n', marker: '' },
    ]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('mentions Ctrl+click for IRIs in tooltips', () => {
    const { option } = setup(lengthPerCategory);
    const html = option.tooltip.formatter([
      { dataIndex: 0, value: 1, seriesName: 'length', marker: '' },
    ]);
    expect(html).toContain('http://example.org/cat/A');
    expect(html).toContain('Ctrl+click');
  });
});

describe('iriForClick', () => {
  it('finds the category IRI of a bar', () => {
    const { chartData } = setup(lengthPerCategory);
    expect(iriForClick(chartData, { seriesIndex: 0, dataIndex: 1 })).toBe(
      'http://example.org/cat/B'
    );
  });

  it('maps pie slices back to their category', () => {
    const { chartData } = setup(lengthPerCategory, { chartType: 'pie' });
    expect(
      iriForClick(chartData, { seriesIndex: 0, dataIndex: 0, data: { categoryIndex: 2 } })
    ).toBe('http://example.org/cat/C');
  });

  it('falls back to the series IRI', () => {
    const results = select(
      ['c', 's', 'n'],
      [
        [lit('a'), iri('http://example.org/s1'), dec(1)],
        [lit('a'), iri('http://example.org/s2'), dec(2)],
      ]
    );
    const { chartData } = setup(results, { series: 's' });
    expect(iriForClick(chartData, { seriesIndex: 1, dataIndex: 0 })).toBe('http://example.org/s2');
  });

  it('returns nothing for histograms', () => {
    const { chartData } = setup(lengthPerCategory, { chartType: 'histogram' });
    expect(iriForClick(chartData, { seriesIndex: 0, dataIndex: 0 })).toBeUndefined();
  });
});

describe('formatting', () => {
  it('formats numbers', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1.234567)).toBe('1.2346');
    expect(formatNumber(null)).toBe('–');
  });

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('histogram labels', () => {
  it('rounds bin edges to a sensible precision', () => {
    const rows = [48, 60, 75, 90, 110, 128].map((n) => [dec(n)]);
    const { option } = setup(select(['n'], rows), { chartType: 'histogram' });
    expect(option.xAxis.data[0]).toBe('48 – 68');
    const small = setup(
      select(
        ['n'],
        [0, 0.1, 0.25, 0.5, 0.9, 1].map((n) => [dec(n)])
      ),
      {
        chartType: 'histogram',
      }
    ).option;
    expect(small.xAxis.data[0]).toBe('0 – 0.25');
  });
});
