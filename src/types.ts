/**
 * Shared types for the YASGUI Chart Plugin
 */

/** Prefix → namespace map, e.g. `{ rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' }` */
export interface PrefixMap {
  [prefix: string]: string;
}

/** One RDF term in a SPARQL JSON result binding */
export interface SparqlTerm {
  type: 'uri' | 'literal' | 'typed-literal' | 'bnode' | string;
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}

export type SparqlBinding = Record<string, SparqlTerm | undefined>;

/** SPARQL 1.1 JSON results for a SELECT query */
export interface SparqlSelectResults {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

/** Triple binding as exposed by YASR for CONSTRUCT/DESCRIBE responses */
export interface YasrBinding {
  subject?: { value: string; type: string };
  predicate?: { value: string; type: string };
  object?: { value: string; type: string; datatype?: string; 'xml:lang'?: string };
}

/** Options for a background query run through `yasr.executeQuery` */
export interface PluginQueryOptions {
  acceptHeader?: string;
  signal?: AbortSignal;
}

/**
 * Features a YASR host offers to plugins (MatGUI yasr host API, version 1).
 * Absent on older YASR versions: plugins feature-detect it, never a version string.
 */
export interface YasrHostApi {
  version: number;
  /** `yasr.describe()` opens the shared describe panel */
  describe?: boolean;
  /** `yasr.getPluginToolbar()` returns the shared toolbar slot */
  toolbar?: boolean;
}

/** Options for the host's shared describe panel */
export interface YasrDescribeOptions {
  direction?: 'outgoing' | 'incoming';
  /** Label of the calling view, shown as "Opened from Chart" */
  source?: string;
  /** Start a fresh back/forward history (default true) */
  newHistory?: boolean;
}

/** The parts of a YASR instance the chart plugin uses */
export interface Yasr {
  results: any;
  resultsEl: HTMLElement;
  plugins?: Record<string, unknown>;
  config?: { plugins?: Record<string, { dynamicConfig?: unknown } | undefined> };
  getPrefixes?: () => Record<string, string>;
  storePluginConfig?: (pluginName: string, conf: unknown) => void;
  executeQuery?: (query: string, options?: PluginQueryOptions) => Promise<any>;
  /** Host API (newer YASR only) */
  hostApi?: YasrHostApi;
  describe?: (iri: string, options?: YasrDescribeOptions) => Promise<void>;
  closeDescribe?: () => void;
  getPluginToolbar?: () => HTMLDivElement;
}

/** Chart types offered in the chart type picker */
export type ChartType =
  | 'bar'
  | 'stacked-bar'
  | 'horizontal-bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'histogram';

/**
 * The user's chart choices. Saved per tab through YASR's plugin config, so
 * every field is optional: anything missing (or naming a column the current
 * results don't have) falls back to the automatic choice.
 */
export interface ChartSettings {
  chartType?: ChartType;
  /** Column used for the x axis / categories / slices */
  category?: string;
  /** Numeric columns plotted as values */
  values?: string[];
  /** The result's variables when these choices were made; other results get the automatic chart */
  columns?: string[];
  /** Column whose distinct values split the data into series (long format); `""` for none */
  series?: string;
}

/** Fully resolved chart choices, after applying the automatic defaults */
export interface ResolvedChartSettings {
  chartType: ChartType;
  category: string | null;
  values: string[];
  series: string | null;
}

/** Options that can be passed when registering the plugin */
export interface ChartPluginOptions {
  /** Maximum number of result rows the chart will plot (default 5000) */
  maxRows?: number;
}
