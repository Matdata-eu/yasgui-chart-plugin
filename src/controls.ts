/**
 * Chart toolbar
 *
 * Pickers for the chart type, category, value and series columns, a button
 * that goes back to the automatic choice, and PNG/SVG export buttons.
 *
 * Two layouts share the same controls:
 * - `renderHostToolbar` puts them in the YASR host's plugin toolbar slot
 *   (`yasr.getPluginToolbar()`), with the shared `.yasr_toolbar*` classes; the
 *   automatic-chart reset and the exports sit in the "View settings" menu at
 *   the far right.
 * - `renderToolbar` draws the plugin's own toolbar above the chart, for YASR
 *   versions without a toolbar slot.
 */

import type { ColumnInfo } from './columns';
import { icon } from './icons';
import type { IconName } from './icons';
import { CHART_TYPES, categoryCandidates } from './settings';
import type { ChartSettings, ChartType, ResolvedChartSettings } from './types';

export interface ToolbarCallbacks {
  onChange: (settings: ChartSettings) => void;
  onReset: () => void;
  onExport: (format: 'png' | 'svg') => void;
  /** Show IRIs as prefixed names (true) or in full (false) */
  onShortenIris: (shortenIris: boolean) => void;
}

export interface ToolbarState {
  columns: ColumnInfo[];
  resolved: ResolvedChartSettings;
  /** True when the user has saved choices (so "Auto" can reset them) */
  customised: boolean;
  /** IRIs are shown as prefixed names */
  shortenIris: boolean;
}

const KIND_LABEL: Record<string, string> = {
  numeric: 'number',
  date: 'date',
  iri: 'IRI',
  text: 'text',
};

/** Which toolbar the controls are built for */
type Layout = 'own' | 'host';

let menuCounter = 0;

function field(
  layout: Layout,
  labelText: string,
  control: HTMLElement,
  tag: 'label' | 'div' = 'label'
): HTMLElement {
  const wrapper = document.createElement(tag);
  wrapper.className =
    layout === 'host' ? 'yasr_toolbarSelect chart-toolbar-field' : 'chart-toolbar-field';
  const label = document.createElement('span');
  label.className = 'chart-toolbar-label';
  label.textContent = labelText;
  wrapper.appendChild(label);
  wrapper.appendChild(control);
  return wrapper;
}

function select(
  layout: Layout,
  className: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void
): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = layout === 'host' ? className : `chart-toolbar-select ${className}`;
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

/** The column pickers, in toolbar order */
function renderPickers(
  layout: Layout,
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): HTMLElement[] {
  const { columns, resolved } = state;
  const fields: HTMLElement[] = [];

  const current = (): ChartSettings => ({
    chartType: resolved.chartType,
    category: resolved.category ?? undefined,
    values: [...resolved.values],
    series: resolved.series ?? '',
  });

  const isHistogram = resolved.chartType === 'histogram';
  const isPie = resolved.chartType === 'pie' || resolved.chartType === 'donut';

  // Chart type
  fields.push(
    field(
      layout,
      layout === 'host' ? 'Type' : 'Chart',
      select(layout, 'chart-type-select', CHART_TYPES, resolved.chartType, (value) =>
        callbacks.onChange({ ...current(), chartType: value as ChartType })
      )
    )
  );

  // Category
  const candidates = categoryCandidates(columns);
  const categorySelect = select(
    layout,
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
  fields.push(
    field(
      layout,
      isPie ? 'Slices' : resolved.chartType === 'horizontal-bar' ? 'Y axis' : 'X axis',
      categorySelect
    )
  );

  // Values
  const numeric = columns.filter((c) => c.kind === 'numeric' && c.name !== resolved.category);
  const valuesPicker = document.createElement('details');
  valuesPicker.className = 'chart-values-picker';
  const summary = document.createElement('summary');
  summary.className =
    layout === 'host' ? 'chart-values-summary' : 'chart-toolbar-select chart-values-summary';
  const summaryText = document.createElement('span');
  summaryText.className = 'chart-values-summary-text';
  summaryText.textContent = resolved.values.length > 0 ? resolved.values.join(', ') : 'None';
  summary.appendChild(summaryText);
  summary.appendChild(icon('chevron-down', 14));
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
  // In the host toolbar a <div> wraps the picker: a <label> would toggle its first checkbox
  fields.push(
    field(
      layout,
      isHistogram ? 'Value' : isPie ? 'Size' : 'Values',
      valuesPicker,
      layout === 'host' ? 'div' : 'label'
    )
  );

  // Series
  const seriesOptions = [{ value: '', label: 'None' }].concat(
    candidates
      .filter((c) => c.name !== resolved.category && !resolved.values.includes(c.name))
      .map((c) => ({ value: c.name, label: columnLabel(c) }))
  );
  const seriesSelect = select(
    layout,
    'chart-series-select',
    seriesOptions,
    resolved.series ?? '',
    (value) => callbacks.onChange({ ...current(), series: value })
  );
  seriesSelect.disabled = isHistogram || isPie || seriesOptions.length <= 1;
  fields.push(field(layout, 'Series', seriesSelect));

  return fields;
}

/**
 * Render the plugin's own toolbar for the current columns and settings.
 *
 * @deprecated Fallback for YASR versions without `getPluginToolbar()`; it will
 * be removed in the next major version. Use `renderHostToolbar` when the host
 * offers a toolbar slot.
 */
export function renderToolbar(state: ToolbarState, callbacks: ToolbarCallbacks): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'chart-toolbar';

  for (const el of renderPickers('own', state, callbacks)) toolbar.appendChild(el);

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

  const shorten = button('chart-shorten-iris', 'Prefixes', 'Show IRIs as prefixed names', () =>
    callbacks.onShortenIris(!state.shortenIris)
  );
  shorten.setAttribute('aria-pressed', String(state.shortenIris));
  toolbar.appendChild(shorten);

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

function menuItem(
  className: string,
  iconName: IconName,
  text: string,
  title: string,
  onClick: () => void
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `chart-view-settings-item ${className}`;
  el.title = title;
  el.appendChild(icon(iconName));
  const label = document.createElement('span');
  label.textContent = text;
  el.appendChild(label);
  el.addEventListener('click', onClick);
  return el;
}

/** "View settings" button and its menu: automatic chart and exports */
function renderViewSettings(state: ToolbarState, callbacks: ToolbarCallbacks): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-view-settings';

  const menuId = `chart-view-settings-menu-${++menuCounter}`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'yasr_toolbarButton chart-view-settings-button';
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', menuId);
  toggle.appendChild(icon('sliders-horizontal'));
  const text = document.createElement('span');
  text.textContent = 'View settings';
  toggle.appendChild(text);

  const menu = document.createElement('div');
  menu.className = 'chart-view-settings-menu';
  menu.id = menuId;
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'View settings');
  menu.hidden = true;

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('is-active', open);
  };
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const reset = menuItem(
    'chart-reset-button',
    'rotate-ccw',
    'Automatic chart',
    'Go back to the automatic chart for these results',
    run(callbacks.onReset)
  );
  reset.disabled = !state.customised;
  menu.appendChild(reset);
  const shorten = menuItem(
    'chart-shorten-iris',
    state.shortenIris ? 'square-check' : 'square',
    'Shorten IRIs with prefixes',
    'Show IRIs as prefixed names, such as ex:Germany',
    run(() => callbacks.onShortenIris(!state.shortenIris))
  );
  shorten.setAttribute('role', 'menuitemcheckbox');
  shorten.setAttribute('aria-checked', String(state.shortenIris));
  menu.appendChild(shorten);
  const separator = document.createElement('div');
  separator.className = 'chart-view-settings-separator';
  separator.setAttribute('role', 'separator');
  menu.appendChild(separator);
  menu.appendChild(
    menuItem(
      'chart-export-png',
      'download',
      'Download PNG',
      'Download the chart as a PNG image',
      run(() => callbacks.onExport('png'))
    )
  );
  menu.appendChild(
    menuItem(
      'chart-export-svg',
      'download',
      'Download SVG',
      'Download the chart as an SVG image',
      run(() => callbacks.onExport('svg'))
    )
  );

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      e.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });

  wrapper.appendChild(toggle);
  wrapper.appendChild(menu);
  return wrapper;
}

/**
 * Render the controls into the YASR host's plugin toolbar slot.
 * Returns the elements added, so the plugin can remove exactly those.
 */
export function renderHostToolbar(
  slot: HTMLElement,
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): HTMLElement[] {
  const group = document.createElement('div');
  group.className = 'yasr_toolbarGroup chart-toolbar-pickers';
  for (const el of renderPickers('host', state, callbacks)) group.appendChild(el);

  const spacer = document.createElement('div');
  spacer.className = 'yasr_toolbarSpacer';

  const nodes = [group, spacer, renderViewSettings(state, callbacks)];
  for (const node of nodes) slot.appendChild(node);
  return nodes;
}

/** Close the values picker and view settings menu inside `root` unless `target` is in them */
export function closeToolbarPopups(root: ParentNode, target: Node | null): void {
  root.querySelectorAll('.chart-values-picker[open]').forEach((picker) => {
    if (!target || !picker.contains(target)) picker.removeAttribute('open');
  });
  root.querySelectorAll<HTMLElement>('.chart-view-settings').forEach((wrapper) => {
    const menu = wrapper.querySelector<HTMLElement>('.chart-view-settings-menu');
    if (!menu || menu.hidden || (target && wrapper.contains(target))) return;
    menu.hidden = true;
    const toggle = wrapper.querySelector('.chart-view-settings-button');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.classList.remove('is-active');
  });
}
