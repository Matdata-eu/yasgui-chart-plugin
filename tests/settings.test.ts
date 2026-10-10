import { analyzeColumns } from '../src/columns';
import { resolveSettings, sanitizeSettings, settingsForColumns } from '../src/settings';
import {
  lengthPerCategory,
  numbersOnly,
  perMonth,
  pointsPerCountryAndType,
  select,
  int,
} from './fixtures';

const resolve = (data: any, saved = {}) =>
  resolveSettings(analyzeColumns(data), saved, data.results.bindings.length);

describe('resolveSettings (automatic choice)', () => {
  it('uses a bar chart for an IRI column and numbers', () => {
    expect(resolve(lengthPerCategory)).toEqual({
      chartType: 'bar',
      category: 'category',
      values: ['length'],
      series: null,
    });
  });

  it('uses a line chart over dates', () => {
    expect(resolve(perMonth)).toMatchObject({
      chartType: 'line',
      category: 'month',
      values: ['count'],
    });
  });

  it('splits long-format results into series', () => {
    expect(resolve(pointsPerCountryAndType)).toEqual({
      chartType: 'bar',
      category: 'country',
      values: ['count'],
      series: 'type',
    });
  });

  it('plots numbers against numbers as a scatter plot', () => {
    expect(resolve(numbersOnly)).toMatchObject({
      chartType: 'scatter',
      category: 'x',
      values: ['y'],
    });
  });

  it('uses a histogram for a single numeric column', () => {
    const data = select(['n'], [[int(1)], [int(2)]]);
    expect(resolve(data)).toMatchObject({ chartType: 'histogram', category: null, values: ['n'] });
  });
});

describe('resolveSettings (saved choices)', () => {
  it('keeps valid saved choices', () => {
    expect(
      resolve(pointsPerCountryAndType, {
        chartType: 'stacked-bar',
        category: 'type',
        series: 'country',
      })
    ).toEqual({
      chartType: 'stacked-bar',
      category: 'type',
      values: ['count'],
      series: 'country',
    });
  });

  it('honours an explicit "no series"', () => {
    expect(resolve(pointsPerCountryAndType, { series: '' }).series).toBeNull();
  });

  it('falls back when saved columns no longer exist', () => {
    expect(resolve(lengthPerCategory, { category: 'gone', values: ['gone'] })).toMatchObject({
      category: 'category',
      values: ['length'],
    });
  });

  it('does not use a label column as category', () => {
    expect(resolve(lengthPerCategory, { category: 'categoryLabel' }).category).toBe('category');
  });
});

describe('sanitizeSettings', () => {
  it('drops invalid fields', () => {
    expect(
      sanitizeSettings({ chartType: 'radar', category: 3, values: ['a', 1], series: 'b' })
    ).toEqual({
      values: ['a'],
      series: 'b',
    });
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings('nope')).toEqual({});
  });
});

describe('settingsForColumns', () => {
  it('keeps choices made for the same variables', () => {
    const saved = { chartType: 'pie' as const, columns: ['a', 'b'] };
    expect(settingsForColumns(saved, ['a', 'b'])).toBe(saved);
  });

  it('ignores choices made for other variables', () => {
    expect(settingsForColumns({ chartType: 'pie', columns: ['a', 'b'] }, ['a', 'c'])).toEqual({});
  });

  it('keeps choices saved without variables', () => {
    expect(settingsForColumns({ chartType: 'pie' }, ['x'])).toEqual({ chartType: 'pie' });
  });
});
