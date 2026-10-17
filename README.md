# YASGUI Chart Plugin

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://img.shields.io/npm/v/@matdata/yasgui-chart-plugin.svg)](https://www.npmjs.com/package/@matdata/yasgui-chart-plugin)

A YASGUI (YASR) plugin that visualises SPARQL **SELECT** results as charts: bar (grouped, stacked, horizontal), line, area, pie, donut, scatter and histogram. It is built on [Apache ECharts](https://echarts.apache.org/) and is part of [MatGUI](https://github.com/Matdata-eu/MatGUI).

**Online demo:** https://matdata-eu.github.io/yasgui-chart-plugin/

## ✨ Features

- **📊 Chart types**: bar, stacked bar, horizontal bar, line, area, pie, donut, scatter and histogram
- **🪄 Automatic choice**: a label/IRI column plus numbers gives a bar chart, a date column plus numbers a line chart, numbers against numbers a scatter plot, and a single numeric column a histogram
- **🎛️ Controls**: pick the chart type and the category, value and series columns. The choice is saved per tab; a different query (other variables) starts from the automatic chart again
- **🧮 Long results**: a second category-like column (e.g. `?country ?type ?count`) is split into series automatically; rows that repeat a category are summed
- **🏷️ Readable labels**: IRIs are shown with their label column (`?x` with `?xLabel`) or as prefixed names
- **🔎 Ctrl+click describe**: Ctrl+click a bar, slice or point to see the triples of its IRI (Ctrl+Shift+click for the triples where it is the object). Newer MatGUI versions show them in the shared describe panel; older YASR versions get the plugin's own modal, the same as the table and geo plugins
- **🌓 Light and dark theme**: follows the YASGUI theme and switches live. The first series uses the theme's brand colour (`--yasgui-brand`) and the hovered item the highlight colour (`--yasgui-highlight`), with MatData blue and amber as fallbacks
- **🖼️ Export**: download the chart as PNG or SVG
- **🔍 Zoom**: a zoom slider appears for long category axes
- Only offered when the results contain at least one numeric column

## 📦 Installation

### NPM

```bash
npm install @matdata/yasgui-chart-plugin
```

```javascript
import Yasgui from '@matdata/yasgui';
import ChartPlugin from '@matdata/yasgui-chart-plugin';
import '@matdata/yasgui-chart-plugin/dist/yasgui-chart-plugin.min.css';

Yasgui.Yasr.registerPlugin('Chart', ChartPlugin);

const yasgui = new Yasgui(document.getElementById('yasgui'), {
  yasr: { pluginOrder: ['Table', 'response', 'Chart'] },
});
```

MatGUI ([@matdata/yasgui](https://www.npmjs.com/package/@matdata/yasgui)) already includes the chart plugin.

### CDN (UMD)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@matdata/yasgui/build/yasgui.min.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@matdata/yasgui-chart-plugin/dist/yasgui-chart-plugin.min.css" />
<script src="https://cdn.jsdelivr.net/npm/@matdata/yasgui/build/yasgui.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@matdata/yasgui-chart-plugin/dist/yasgui-chart-plugin.min.js"></script>
<script>
  // The plugin registers itself as 'Chart' when window.Yasgui exists
  const yasgui = new Yasgui(document.getElementById('yasgui'));
</script>
```

## 🚀 Usage

Run a SELECT query with at least one numeric column and open the **Chart** tab. For example:

```sparql
PREFIX era: <http://data.europa.eu/949/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?country (COUNT(?op) AS ?operationalPoints) WHERE {
  ?op a era:OperationalPoint ;
      era:inCountry ?country .
}
GROUP BY ?country
ORDER BY DESC(?operationalPoints)
```

### Toolbar

| Control | What it does |
| --- | --- |
| **Type** (**Chart** in the plugin's own toolbar) | Chart type |
| **X axis** / **Slices** | Column used for the categories (bars, slices) or the x axis |
| **Values** / **Size** | Numeric column(s) to plot; pie, donut and histogram use one |
| **Series** | Column whose values split the data into series (grouped or stacked bars, several lines) |
| **Automatic chart** (**Auto**) | Go back to the automatic chart for these results |
| **Download PNG** / **Download SVG** (**PNG** / **SVG**) | Download the chart |

In newer MatGUI versions the pickers sit in the shared plugin toolbar under the results header, and the automatic chart and downloads are in the **View settings** menu at the far right. With older YASR versions the plugin draws its own toolbar above the chart, with **Auto**, **PNG** and **SVG** buttons.

The YASR download button also saves the chart as PNG.

### How columns are read

| Column kind | Recognised when every bound value is |
| --- | --- |
| number | an `xsd` numeric literal, or a plain literal that reads as a number |
| date | an `xsd:date`, `xsd:dateTime`, `xsd:gYear` or `xsd:gYearMonth` literal |
| IRI | an IRI |
| text | anything else |

A text column is used as the label of an IRI column when it is named after it (`?line` with `?lineLabel`, `?line_label` or `?lineName`), or when it is the only text column and maps 1:1 onto the only IRI column.

### Options

```javascript
Yasgui.Yasr.registerPlugin('Chart', ChartPlugin);
Yasgui.Yasr.defaults.plugins.Chart = { enabled: true, options: { maxRows: 10000 } };
```

| Option | Default | Description |
| --- | --- | --- |
| `maxRows` | `5000` | Maximum number of result rows plotted; a note says when results are cut |

### Compatibility

The plugin works with both today's published `@matdata/yasgui` and newer MatGUI versions that offer the YASR host API. It checks for the features themselves, never for a version number:

| YASR offers | The plugin |
| --- | --- |
| `yasr.hostApi.describe` and `yasr.describe()` | Opens Ctrl+clicked IRIs in the shared describe panel (`yasr.describe(iri, { direction, source: 'Chart' })`) |
| `yasr.hostApi.toolbar` and `yasr.getPluginToolbar()` | Puts its controls in the shared toolbar slot, with the `.yasr_toolbar*` classes |
| neither (today's YASR) | Keeps its own describe modal and draws its own toolbar, as before |

The plugin's own describe modal and toolbar are deprecated and will be removed in the next major version, once the host API is in every supported YASR. Saved chart settings, options and CSS classes are unchanged.

## 🛠️ Development

```bash
npm install
npm run dev        # demo with live reload at http://localhost:5173
npm test           # unit tests (jest)
npm run typecheck  # TypeScript
npm run build      # dist/ bundles (ESM, CJS, IIFE), CSS and type declarations
npm run build:demo # static demo in demo/dist
```

The demo is deployed to GitHub Pages on every push to `main`. Publishing a GitHub release publishes the package to npm (version taken from the tag) and attaches the minified bundles to the release.

## 📄 License

Apache 2.0
