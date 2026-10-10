/**
 * Chart data model
 *
 * Turns SELECT bindings and resolved settings into chart-library-neutral data:
 *
 * - `category`: an ordered list of categories (bar, pie, and line/area over
 *   text or IRIs) with one value per category for each series. Rows that
 *   repeat a category (and series) are summed.
 * - `xy`: points on a numeric or time x axis (scatter, and line/area over
 *   numbers or dates), sorted by x for lines.
 * - `histogram`: the distribution of one numeric column in equal-width bins.
 *
 * Every category, series and point remembers the IRI it came from (if any),
 * so a click on it can describe that IRI.
 */

import type { ColumnInfo } from './columns';
import { toNumber, toTimestamp } from './columns';
import { toPrefixedName } from './describe/resource-query';
import type { PrefixMap, ResolvedChartSettings, SparqlBinding, SparqlTerm } from './types';

export interface CategoryItem {
  key: string;
  label: string;
  iri?: string;
}

export interface CategorySeries {
  name: string;
  iri?: string;
  values: (number | null)[];
}

export interface CategoryData {
  kind: 'category';
  categories: CategoryItem[];
  series: CategorySeries[];
}

export interface XYPoint {
  x: number;
  y: number;
  /** Label of the row's category-like value, shown in the tooltip */
  label?: string;
  iri?: string;
}

export interface XYSeries {
  name: string;
  iri?: string;
  points: XYPoint[];
}

export interface XYData {
  kind: 'xy';
  xAxis: 'value' | 'time';
  xName: string;
  series: XYSeries[];
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export interface HistogramData {
  kind: 'histogram';
  column: string;
  bins: HistogramBin[];
}

export type ChartData = CategoryData | XYData | HistogramData;

/** How a term is shown: its label column, a prefixed name, or its value */
export function termLabel(
  term: SparqlTerm | undefined,
  row: SparqlBinding,
  column: ColumnInfo | undefined,
  prefixes: PrefixMap
): string {
  if (!term) return '(none)';
  if (term.type === 'uri') {
    const labelTerm = column?.labelColumn ? row[column.labelColumn] : undefined;
    if (labelTerm && labelTerm.value) return labelTerm.value;
    return toPrefixedName(term.value, prefixes) || term.value;
  }
  if (term.type === 'bnode') return `_:${term.value}`;
  return term.value;
}

function termKey(term: SparqlTerm | undefined): string {
  if (!term) return '\u0000none';
  return `${term.type}\u0000${term.value}`;
}

function numberOrTime(term: SparqlTerm | undefined, column: ColumnInfo): number | null {
  return column.kind === 'date' ? toTimestamp(term) : toNumber(term);
}

/** Number of histogram bins for `n` values (Sturges' rule, capped) */
export function binCount(n: number): number {
  if (n <= 1) return 1;
  return Math.min(50, Math.max(1, Math.ceil(Math.log2(n) + 1)));
}

export function buildHistogram(values: number[], column: string): HistogramData {
  if (values.length === 0) return { kind: 'histogram', column, bins: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return { kind: 'histogram', column, bins: [{ from: min, to: max, count: values.length }] };
  }
  const count = binCount(values.length);
  const width = (max - min) / count;
  const bins: HistogramBin[] = Array.from({ length: count }, (_, i) => ({
    from: min + i * width,
    to: i === count - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const index = Math.min(count - 1, Math.floor((v - min) / width));
    bins[index].count++;
  }
  return { kind: 'histogram', column, bins };
}

/** Whether a chart type plots points on a numeric/time axis for this category column */
function usesXYAxis(settings: ResolvedChartSettings, category: ColumnInfo | undefined): boolean {
  if (!category) return false;
  if (settings.chartType === 'scatter') return true;
  if (settings.chartType === 'line' || settings.chartType === 'area') {
    return category.kind === 'numeric' || category.kind === 'date';
  }
  return false;
}

/**
 * Build the chart data.
 * @param bindings result rows
 * @param columns  analysed columns
 * @param settings resolved settings
 * @param prefixes prefixes used to shorten IRIs
 */
export function buildChartData(
  bindings: SparqlBinding[],
  columns: ColumnInfo[],
  settings: ResolvedChartSettings,
  prefixes: PrefixMap
): ChartData {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const category = settings.category ? byName.get(settings.category) : undefined;
  const seriesCol = settings.series ? byName.get(settings.series) : undefined;
  const valueCols = settings.values;

  if (settings.chartType === 'histogram' || !category) {
    const column = valueCols[0] || '';
    const values: number[] = [];
    for (const row of bindings) {
      const n = toNumber(row[column]);
      if (n !== null) values.push(n);
    }
    return buildHistogram(values, column);
  }

  // Series are keyed by the series column's value (if any) and value column
  const seriesName = (seriesLabel: string | null, valueCol: string): string => {
    if (seriesLabel === null) return valueCol;
    return valueCols.length > 1 ? `${seriesLabel} – ${valueCol}` : seriesLabel;
  };

  if (usesXYAxis(settings, category)) {
    const series = new Map<string, XYSeries>();
    // The resource each point stands for: the first IRI column besides the series
    const labelCol = columns.find(
      (c) => c.kind === 'iri' && c.name !== category.name && c.name !== seriesCol?.name
    );
    for (const row of bindings) {
      const x = numberOrTime(row[category.name], category);
      if (x === null) continue;
      const seriesTerm = seriesCol ? row[seriesCol.name] : undefined;
      const seriesLabel = seriesCol ? termLabel(seriesTerm, row, seriesCol, prefixes) : null;
      for (const valueCol of valueCols) {
        const y = toNumber(row[valueCol]);
        if (y === null) continue;
        const key = `${termKey(seriesTerm)}\u0001${valueCol}`;
        let s = series.get(key);
        if (!s) {
          s = {
            name: seriesName(seriesLabel, valueCol),
            iri: seriesTerm?.type === 'uri' ? seriesTerm.value : undefined,
            points: [],
          };
          series.set(key, s);
        }
        const labelTerm = labelCol ? row[labelCol.name] : undefined;
        s.points.push({
          x,
          y,
          label: labelTerm ? termLabel(labelTerm, row, labelCol, prefixes) : undefined,
          iri: labelTerm?.type === 'uri' ? labelTerm.value : undefined,
        });
      }
    }
    const result = [...series.values()];
    if (settings.chartType !== 'scatter') {
      for (const s of result) s.points.sort((a, b) => a.x - b.x);
    }
    return {
      kind: 'xy',
      xAxis: category.kind === 'date' ? 'time' : 'value',
      xName: category.name,
      series: result,
    };
  }

  // Category axis
  const categories: CategoryItem[] = [];
  const categoryIndex = new Map<string, number>();
  const categorySort: (number | null)[] = [];
  const series = new Map<string, CategorySeries>();
  const sums: Map<string, Map<number, number>> = new Map();

  for (const row of bindings) {
    const term = row[category.name];
    const key = termKey(term);
    let index = categoryIndex.get(key);
    if (index === undefined) {
      index = categories.length;
      categoryIndex.set(key, index);
      categories.push({
        key,
        label: termLabel(term, row, category, prefixes),
        iri: term?.type === 'uri' ? term.value : undefined,
      });
      categorySort.push(category.kind === 'date' ? toTimestamp(term) : null);
    }
    const seriesTerm = seriesCol ? row[seriesCol.name] : undefined;
    const seriesLabel = seriesCol ? termLabel(seriesTerm, row, seriesCol, prefixes) : null;
    for (const valueCol of valueCols) {
      const y = toNumber(row[valueCol]);
      if (y === null) continue;
      const sKey = `${termKey(seriesTerm)}\u0001${valueCol}`;
      if (!series.has(sKey)) {
        series.set(sKey, {
          name: seriesName(seriesLabel, valueCol),
          iri: seriesTerm?.type === 'uri' ? seriesTerm.value : undefined,
          values: [],
        });
        sums.set(sKey, new Map());
      }
      const s = sums.get(sKey)!;
      s.set(index, (s.get(index) || 0) + y);
    }
  }

  // Dates read best in chronological order
  let order = categories.map((_, i) => i);
  if (category.kind === 'date') {
    order = order.sort((a, b) => (categorySort[a] ?? 0) - (categorySort[b] ?? 0));
  }

  const resultSeries: CategorySeries[] = [];
  for (const [sKey, s] of series) {
    const values = sums.get(sKey)!;
    s.values = order.map((i) => (values.has(i) ? values.get(i)! : null));
    resultSeries.push(s);
  }

  return {
    kind: 'category',
    categories: order.map((i) => categories[i]),
    series: resultSeries,
  };
}
