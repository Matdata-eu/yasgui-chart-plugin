import '@matdata/yasgui/build/yasgui.min.css';
import Yasgui from '@matdata/yasgui';
import ChartPlugin from '@matdata/yasgui-chart-plugin';
import '../styles/index.css';
import './style.css';
import { datasets } from './data.js';

// Register the plugin to Yasr (MatGUI's own build already includes it)
Yasgui.Yasr.registerPlugin('Chart', ChartPlugin);

const COUNTRIES_QUERY = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Most populous EU member states
SELECT ?country ?countryLabel ?population WHERE {
  ?country wdt:P463 wd:Q458 ;
           wdt:P1082 ?population ;
           rdfs:label ?countryLabel .
  FILTER(LANG(?countryLabel) = "en")
}
ORDER BY DESC(?population)
LIMIT 15`;

const yasgui = new Yasgui(document.getElementById('yasgui'), {
  requestConfig: { endpoint: 'https://query.wikidata.org/sparql' },
  copyEndpointOnNewTab: true,
  yasqe: { value: COUNTRIES_QUERY },
  yasr: {
    pluginOrder: ['Table', 'response', 'Chart'],
    defaultPlugin: 'Chart',
  },
});

/** Show sample results in the current tab without querying an endpoint */
function loadSample(name) {
  const yasr = yasgui.getTab().getYasr();
  yasr.setResponse({
    data: JSON.stringify(datasets[name].results),
    contentType: 'application/sparql-results+json',
    status: 200,
    executionTime: 1,
  });
  yasr.selectPlugin('Chart');
}

const samples = document.getElementById('samples');
for (const [name, dataset] of Object.entries(datasets)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = dataset.label;
  button.addEventListener('click', () => loadSample(name));
  samples.appendChild(button);
}

window.yasgui = yasgui;
