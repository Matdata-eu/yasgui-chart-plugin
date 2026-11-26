import ChartPlugin from '@matdata/yasgui-chart-plugin';
import '../styles/index.css';
import { createYasr, setupThemeToggle, showResults, triplesFromSelect } from './demo-host.js';
import { datasets } from './data.js';

/** Hints on what to try with each dataset */
const HINTS = {
  length:
    'A bar per category. <kbd>Ctrl</kbd>+click a bar to open its IRI in the describe panel; switch the chart type in the toolbar.',
  countries: 'Two text columns and a number: the chart stacks or groups the types per country.',
  monthly: 'Dates on the x axis: try a line or area chart.',
  scatter: 'Two numbers per row: a scatter plot.',
  histogram: 'One number column: a histogram of its values.',
};

const prefixes = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ex: 'http://example.org/',
  demo: 'http://example.org/demo#',
};

// MatGUI registers its own copy as "Chart"; this page shows the one from this repository
window.Yasgui.Yasr.registerPlugin('Chart', ChartPlugin);

setupThemeToggle(document.getElementById('theme-toggle'));

const keys = Object.keys(datasets);
const params = new URLSearchParams(window.location.search);
let current = datasets[params.get('dataset')] ? params.get('dataset') : keys[0];

const yasr = createYasr(document.getElementById('yasr'), {
  plugin: 'Chart',
  getPrefixes: () => prefixes,
  getTriples: () => triplesFromSelect(datasets[current].results),
});

const select = document.getElementById('dataset');
const hint = document.getElementById('dataset-hint');
for (const key of keys) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = `${datasets[key].label} (${datasets[key].results.results.bindings.length} rows)`;
  select.appendChild(option);
}

function load(key) {
  current = key;
  select.value = key;
  hint.innerHTML = HINTS[key] || '';
  yasr.closeDescribe?.();
  showResults(yasr, datasets[key].results);
  const url = new URL(window.location.href);
  url.searchParams.set('dataset', key);
  window.history.replaceState(null, '', url);
}

select.addEventListener('change', () => load(select.value));
load(current);

window.yasr = yasr;
