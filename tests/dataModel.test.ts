import { analyzeColumns } from '../src/columns';
import { binCount, buildChartData, buildHistogram } from '../src/dataModel';
import { resolveSettings } from '../src/settings';
import type { ChartSettings } from '../src/types';
import {
  dec,
  iri,
  lengthPerCategory,
  lit,
  numbersOnly,
  perMonth,
  pointsPerCountryAndType,
  select,
} from './fixtures';

const EX = 'http://example.org/';

function build(data: any, saved: ChartSettings = {}, prefixes = {}) {
  const columns = analyzeColumns(data);
  const settings = resolveSettings(columns, saved, data.results.bindings.length);
  return buildChartData(data.results.bindings, columns, settings, prefixes);
}

describe('buildChartData', () => {
  it('uses label columns for IRI categories and keeps the IRI', () => {
    const data = build(lengthPerCategory);
    expect(data.kind).toBe('category');
    if (data.kind !== 'category') return;
    expect(data.categories.map((c) => c.label)).toEqual(['Main line', 'Branch line', 'Siding']);
    expect(data.categories[0].iri).toBe(EX + 'cat/A');
    expect(data.series).toEqual([{ name: 'length', iri: undefined, values: [1200.5, 340, 55.25] }]);
  });

  it('shows prefixed names for IRIs without a label', () => {
    const results = select(
      ['s', 'n'],
      [
        [iri(EX + 'a'), dec(1)],
        [iri('urn:x'), dec(2)],
      ]
    );
    const data = build(results, {}, { ex: EX });
    if (data.kind !== 'category') throw new Error('expected category data');
    expect(data.categories.map((c) => c.label)).toEqual(['ex:a', 'urn:x']);
  });

  it('pivots long-format results into series and fills gaps with null', () => {
    const data = build(pointsPerCountryAndType);
    if (data.kind !== 'category') throw new Error('expected category data');
    expect(data.categories.map((c) => c.label)).toEqual(['BE', 'NL', 'FR']);
    expect(data.series.map((s) => [s.name, s.values])).toEqual([
      ['station', [10, 7, 20]],
      ['junction', [4, 2, null]],
    ]);
  });

  it('sums rows that repeat a category', () => {
    const data = build(pointsPerCountryAndType, { series: '' });
    if (data.kind !== 'category') throw new Error('expected category data');
    expect(data.series[0].values).toEqual([14, 9, 20]);
  });

  it('plots dates on a time axis, in order', () => {
    const data = build(perMonth);
    if (data.kind !== 'xy') throw new Error('expected xy data');
    expect(data.xAxis).toBe('time');
    expect(data.series[0].points.map((p) => p.y)).toEqual([3, 8, 5]);
  });

  it('sorts date categories for bar charts', () => {
    const data = build(perMonth, { chartType: 'bar' });
    if (data.kind !== 'category') throw new Error('expected category data');
    expect(data.categories.map((c) => c.label)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('builds scatter points', () => {
    const data = build(numbersOnly);
    if (data.kind !== 'xy') throw new Error('expected xy data');
    expect(data.series[0].points.map((p) => [p.x, p.y])).toEqual([
      [1, 2.5],
      [2, 3.5],
      [3, 1],
    ]);
  });

  it('remembers the IRI of scatter points', () => {
    const results = select(['s', 'x', 'y'], [[iri(EX + 'a'), dec(1), dec(2)]]);
    const data = build(results, { chartType: 'scatter', category: 'x', values: ['y'] });
    if (data.kind !== 'xy') throw new Error('expected xy data');
    expect(data.series[0].points[0].iri).toBe(EX + 'a');
  });

  it('builds a histogram', () => {
    const data = build(lengthPerCategory, { chartType: 'histogram' });
    expect(data.kind).toBe('histogram');
    if (data.kind !== 'histogram') return;
    expect(data.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
  });

  it('leaves a gap for unbound values', () => {
    const results = select(
      ['c', 'n'],
      [
        [lit('a'), dec(1)],
        [lit('b'), undefined],
        [lit('c'), dec(3)],
      ]
    );
    const data = build(results, { values: ['n'] });
    if (data.kind !== 'category') throw new Error('expected category data');
    expect(data.series[0].values).toEqual([1, null, 3]);
  });
});

describe('buildHistogram', () => {
  it('spreads values over equal-width bins', () => {
    const h = buildHistogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 10], 'n');
    expect(h.bins.length).toBe(binCount(10));
    expect(h.bins[0].from).toBe(0);
    expect(h.bins[h.bins.length - 1].to).toBe(10);
    expect(h.bins.reduce((n, b) => n + b.count, 0)).toBe(10);
  });

  it('puts identical values in one bin', () => {
    expect(buildHistogram([3, 3, 3], 'n').bins).toEqual([{ from: 3, to: 3, count: 3 }]);
  });

  it('handles no values', () => {
    expect(buildHistogram([], 'n').bins).toEqual([]);
  });
});
