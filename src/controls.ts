/**
 * Chart toolbar
 *
 * Pickers for the chart type, category, value and series columns, a button
 * that goes back to the automatic choice, and PNG/SVG export buttons.
 */

import type { ColumnInfo } from './columns';
import { CHART_TYPES, categoryCandidates } from './settings';
import type { ChartSettings, ChartType, ResolvedChartSettings } from './types';

export interface ToolbarCallbacks {
  onChange: (settings: ChartSettings) => void;
  onReset: () => void;
  onExport: (format: 'png' | 'svg') => void;
}

export interface ToolbarState {
  columns: ColumnInfo[];
  resolved: ResolvedChartSettings;
  /** True when the user has saved choices (so "Auto" can reset them) */
  customised: boolean;
}

const KIND_LABEL: Record<string, string> = {
  numeric: 'number',
  date: 'date',
  iri: 'IRI',
  text: 'text',
};

function field(labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'chart-toolbar-field';
  const label = document.createElement('span');
  label.className = 'chart-toolbar-label';
  label.textContent = labelText;
  wrapper.appendChild(label);
  wrapper.appendChild(control);
  return wrapper;
}

function select(
  className: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void
): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = `chart-toolbar-select ${className}`;
  for (const o of options) {
    const option = document.createElement('option');
    option.value = o.value;
    option.textContent = o.label;
    option.selected = o.value === value;
    el.appendChild(option);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function button(
  className: string,
  text: string,
  title: string,
  onClick: () => void
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `chart-toolbar-button ${className}`;
  el.textContent = text;
  el.title = title;
  el.addEventListener('click', onClick);
  return el;
}

function columnLabel(c: ColumnInfo): string {
  return `${c.name} (${KIND_LABEL[c.kind]})`;
}

/** Render the toolbar for the current columns and settings */
export function renderToolbar(state: ToolbarState, callbacks: ToolbarCallbacks): HTMLElement {
  const { columns, resolved } = state;
  const toolbar = document.createElement('div');
  toolbar.className = 'chart-toolbar';

  const current = (): ChartSettings => ({
    chartType: resolved.chartType,
    category: resolved.category ?? undefined,
    values: [...resolved.values],
    series: resolved.series ?? '',
  });

  const isHistogram = resolved.chartType === 'histogram';
  const isPie = resolved.chartType === 'pie' || resolved.chartType === 'donut';

  // Chart type
  toolbar.appendChild(
    field(
      'Chart',
      select('chart-type-select', CHART_TYPES, resolved.chartType, (value) =>
        callbacks.onChange({ ...current(), chartType: value as ChartType })
      )
    )
  );

  // Category
  const candidates = categoryCandidates(columns);
  const categorySelect = select(
    'chart-category-select',
    candidates.map((c) => ({ value: c.name, label: columnLabel(c) })),
    resolved.category ?? '',
    (value) => {
      const next = current();
      next.category = value;
      next.values = next.values?.filter((v) => v !== value);
      if (next.series === value) next.series = '';
      callbacks.onChange(next);
    }
  );
  categorySelect.disabled = isHistogram || candidates.length === 0;
  toolbar.appendChild(
    field(
      isPie ? 'Slices' : resolved.chartType === 'horizontal-bar' ? 'Y axis' : 'X axis',
      categorySelect
    )
  );

  // Values
  const numeric = columns.filter((c) => c.kind === 'numeric' && c.name !== resolved.category);
  const valuesPicker = document.createElement('details');
  valuesPicker.className = 'chart-values-picker';
  const summary = document.createElement('summary');
  summary.className = 'chart-toolbar-select';
  summary.textContent = resolved.values.length > 0 ? resolved.values.join(', ') : 'None';
  valuesPicker.appendChild(summary);
  const list = document.createElement('div');
  list.className = 'chart-values-list';
  const single = isHistogram || isPie;
  for (const c of numeric) {
    const item = document.createElement('label');
    item.className = 'chart-values-item';
    const input = document.createElement('input');
    input.type = single ? 'radio' : 'checkbox';
    input.name = 'chart-values';
    input.value = c.name;
    input.checked = single ? resolved.values[0] === c.name : resolved.values.includes(c.name);
    input.addEventListener('change', () => {
      let values: string[];
      if (single) {
        values = [c.name];
      } else {
        values = numeric
          .map((n) => n.name)
          .filter((name) => (name === c.name ? input.checked : resolved.values.includes(name)));
        // Keep at least one value
        if (values.length === 0) {
          input.checked = true;
          return;
        }
      }
      callbacks.onChange({ ...current(), values });
    });
    item.appendChild(input);
    item.appendChild(document.createTextNode(` ${c.name}`));
    list.appendChild(item);
  }
  valuesPicker.appendChild(list);
  toolbar.appendChild(field(isHistogram ? 'Value' : isPie ? 'Size' : 'Values', valuesPicker));

  // Series
  const seriesOptions = [{ value: '', label: 'None' }].concat(
    candidates
      .filter((c) => c.name !== resolved.category && !resolved.values.includes(c.name))
      .map((c) => ({ value: c.name, label: columnLabel(c) }))
  );
  const seriesSelect = select(
    'chart-series-select',
    seriesOptions,
    resolved.series ?? '',
    (value) => callbacks.onChange({ ...current(), series: value })
  );
  seriesSelect.disabled = isHistogram || isPie || seriesOptions.length <= 1;
  toolbar.appendChild(field('Series', seriesSelect));

  if (state.customised) {
    toolbar.appendChild(
      button(
        'chart-reset-button',
        'Auto',
        'Go back to the automatic chart for these results',
        callbacks.onReset
      )
    );
  }

  const spacer = document.createElement('div');
  spacer.className = 'chart-toolbar-spacer';
  toolbar.appendChild(spacer);

  toolbar.appendChild(
    button('chart-export-png', 'PNG', 'Download the chart as a PNG image', () =>
      callbacks.onExport('png')
    )
  );
  toolbar.appendChild(
    button('chart-export-svg', 'SVG', 'Download the chart as an SVG image', () =>
      callbacks.onExport('svg')
    )
  );

  return toolbar;
}
