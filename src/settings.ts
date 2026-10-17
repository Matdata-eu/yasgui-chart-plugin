/**
 * Chart settings
 *
 * Turns the user's saved choices (if any) and the analysed columns into a
 * complete set of chart settings. Whatever the user didn't choose, or chose
 * for columns the current results no longer have, gets the automatic choice:
 *
 * - category: the first column that isn't a number or a label column
 * - values:   every numeric column except the category
 * - series:   only for "long" results (one value column, a category that
 *             repeats, and a second category-like column with few values)
 * - type:     a line chart over dates, a scatter plot for numbers against
 *             numbers, a histogram for a single numeric column, else bars
 */

import type { ColumnInfo } from './columns';
import type { ChartSettings, ChartType, ResolvedChartSettings } from './types';

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'stacked-bar', label: 'Stacked bar' },
  { value: 'horizontal-bar', label: 'Horizontal bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'histogram', label: 'Histogram' },
];

const CHART_TYPE_VALUES = new Set<string>(CHART_TYPES.map((t) => t.value));

/** Most distinct values a column may have to be picked as series automatically */
export const MAX_AUTO_SERIES = 12;

export function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && CHART_TYPE_VALUES.has(value);
}

/** Read saved settings defensively: storage may hold anything */
export function sanitizeSettings(raw: unknown): ChartSettings {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const settings: ChartSettings = {};
  if (isChartType(r.chartType)) settings.chartType = r.chartType;
  if (typeof r.category === 'string') settings.category = r.category;
  if (Array.isArray(r.values))
    settings.values = r.values.filter((v): v is string => typeof v === 'string');
  if (typeof r.series === 'string') settings.series = r.series;
  if (Array.isArray(r.columns))
    settings.columns = r.columns.filter((v): v is string => typeof v === 'string');
  if (typeof r.shortenIris === 'boolean') settings.shortenIris = r.shortenIris;
  return settings;
}

/** Whether the user picked chart choices for these results (display options aside) */
export function isCustomised(saved: ChartSettings): boolean {
  return Object.keys(saved).some((key) => key !== 'columns' && key !== 'shortenIris');
}

/** Display options that hold for any results */
export function displayOptions(saved: ChartSettings): ChartSettings {
  return saved.shortenIris === undefined ? {} : { shortenIris: saved.shortenIris };
}

/**
 * The saved choices that apply to results with these variables: choices made
 * for a different query (other variables) are ignored.
 */
export function settingsForColumns(saved: ChartSettings, vars: string[]): ChartSettings {
  if (!saved.columns) return saved;
  const same = saved.columns.length === vars.length && saved.columns.every((v, i) => v === vars[i]);
  return same ? saved : displayOptions(saved);
}

/** Columns that can serve as the category (x axis): anything but label columns */
export function categoryCandidates(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter((c) => !c.isLabel && c.bound > 0);
}

function autoCategory(columns: ColumnInfo[]): ColumnInfo | null {
  return categoryCandidates(columns).find((c) => c.kind !== 'numeric') || null;
}

function autoSeries(
  columns: ColumnInfo[],
  category: ColumnInfo | null,
  values: string[],
  rowCount: number
): ColumnInfo | null {
  if (!category || values.length !== 1) return null;
  // Only long-format results repeat their categories
  if (category.distinct >= rowCount) return null;
  return (
    categoryCandidates(columns).find(
      (c) =>
        c.name !== category.name &&
        c.kind !== 'numeric' &&
        c.distinct > 1 &&
        c.distinct <= MAX_AUTO_SERIES &&
        c.name !== category.labelColumn
    ) || null
  );
}

/**
 * Resolve the settings to draw with.
 * @param columns  analysed result columns
 * @param saved    the user's saved choices (may be empty)
 * @param rowCount number of result rows
 */
export function resolveSettings(
  columns: ColumnInfo[],
  saved: ChartSettings,
  rowCount: number
): ResolvedChartSettings {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const numeric = columns.filter((c) => c.kind === 'numeric');

  // Category
  let category: ColumnInfo | null = null;
  const savedCategory = saved.category !== undefined ? byName.get(saved.category) : undefined;
  if (savedCategory && !savedCategory.isLabel) {
    category = savedCategory;
  } else {
    category = autoCategory(columns);
    // Numbers only: plot the first against the others
    if (!category && numeric.length >= 2) category = numeric[0];
  }

  // Values
  let values = (saved.values || []).filter(
    (v) => byName.get(v)?.kind === 'numeric' && v !== category?.name
  );
  if (values.length === 0) {
    values = numeric.filter((c) => c.name !== category?.name).map((c) => c.name);
  }

  // Series
  let series: ColumnInfo | null = null;
  if (saved.series !== undefined) {
    // An empty string is an explicit "no series"
    const s = byName.get(saved.series);
    if (s && s.name !== category?.name && !values.includes(s.name)) series = s;
  } else {
    series = autoSeries(columns, category, values, rowCount);
  }

  // Chart type
  let chartType: ChartType;
  if (saved.chartType) {
    chartType = saved.chartType;
  } else if (!category) {
    chartType = 'histogram';
  } else if (category.kind === 'date') {
    chartType = 'line';
  } else if (category.kind === 'numeric') {
    chartType = 'scatter';
  } else {
    chartType = 'bar';
  }

  return {
    chartType,
    category: category ? category.name : null,
    values,
    series: series ? series.name : null,
  };
}
