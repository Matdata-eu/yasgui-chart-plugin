/**
 * Column analysis
 *
 * Classifies each SELECT variable by the values it holds so the plugin can
 * decide whether it can chart the results and pick sensible defaults:
 *
 * - `numeric`: every bound value is a number (xsd numeric datatypes, or plain
 *   literals that read as a number)
 * - `date`:    every bound value is an xsd:date / xsd:dateTime / xsd:gYear(Month)
 * - `iri`:     every bound value is an IRI
 * - `text`:    anything else (strings, mixed values, blank nodes)
 *
 * A text column can also be recognised as the label of an IRI column, e.g.
 * `?line ?lineLabel`, so the chart can show readable names but still describe
 * the IRI on Ctrl+click.
 */

import type { SparqlBinding, SparqlSelectResults, SparqlTerm } from './types';

export type ColumnKind = 'numeric' | 'date' | 'iri' | 'text';

export interface ColumnInfo {
  name: string;
  kind: ColumnKind;
  /** Number of rows in which the variable is bound */
  bound: number;
  /** Number of distinct values */
  distinct: number;
  /** For an IRI column: the text column holding its labels, if any */
  labelColumn?: string;
  /** True when this text column is the label of an IRI column */
  isLabel?: boolean;
}

const XSD = 'http://www.w3.org/2001/XMLSchema#';

const NUMERIC_TYPES = new Set(
  [
    'integer',
    'decimal',
    'float',
    'double',
    'long',
    'int',
    'short',
    'byte',
    'nonNegativeInteger',
    'positiveInteger',
    'negativeInteger',
    'nonPositiveInteger',
    'unsignedLong',
    'unsignedInt',
    'unsignedShort',
    'unsignedByte',
  ].map((t) => XSD + t)
);

const DATE_TYPES = new Set(
  ['date', 'dateTime', 'dateTimeStamp', 'gYear', 'gYearMonth'].map((t) => XSD + t)
);

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Is this term a number? */
export function isNumericTerm(term: SparqlTerm | undefined): boolean {
  if (!term || (term.type !== 'literal' && term.type !== 'typed-literal')) return false;
  if (term.datatype) {
    if (NUMERIC_TYPES.has(term.datatype)) return true;
    // Other typed literals (dates, booleans, ...) are not numbers
    if (term.datatype !== XSD + 'string') return false;
  }
  if (term['xml:lang']) return false;
  return NUMBER_PATTERN.test(term.value.trim());
}

/** Is this term a date or date-time? */
export function isDateTerm(term: SparqlTerm | undefined): boolean {
  if (!term || (term.type !== 'literal' && term.type !== 'typed-literal')) return false;
  return !!term.datatype && DATE_TYPES.has(term.datatype);
}

/** Numeric value of a term, or `null` when it isn't a number */
export function toNumber(term: SparqlTerm | undefined): number | null {
  if (!isNumericTerm(term)) return null;
  const n = Number(term!.value.trim());
  return Number.isFinite(n) ? n : null;
}

/** Timestamp (ms since epoch, UTC) of a date term, or `null` */
export function toTimestamp(term: SparqlTerm | undefined): number | null {
  if (!isDateTerm(term)) return null;
  let value = term!.value.trim();
  const type = term!.datatype!.substring(XSD.length);
  if (type === 'gYear') value = `${value.substring(0, 4)}-01-01`;
  else if (type === 'gYearMonth') value = `${value.substring(0, 7)}-01`;
  // Date-only values (with or without a timezone) are taken as UTC midnight
  const dateOnly = /^(-?\d{4,}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (dateOnly) value = `${dateOnly[1]}T00:00:00Z`;
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) value = `${value}Z`;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Get the SELECT results from YASR's results object, or null */
export function getSelectResults(results: any): SparqlSelectResults | null {
  if (!results) return null;
  const data = results.json && results.json.head ? results.json : results;
  if (
    data &&
    data.head &&
    Array.isArray(data.head.vars) &&
    data.head.vars.length > 0 &&
    data.results &&
    Array.isArray(data.results.bindings)
  ) {
    return data as SparqlSelectResults;
  }
  if (typeof results.getVariables === 'function' && typeof results.getBindings === 'function') {
    const vars = results.getVariables();
    const bindings = results.getBindings();
    if (Array.isArray(vars) && vars.length > 0 && Array.isArray(bindings)) {
      return { head: { vars }, results: { bindings } };
    }
  }
  return null;
}

function classify(name: string, bindings: SparqlBinding[]): ColumnInfo {
  let bound = 0;
  let numeric = 0;
  let date = 0;
  let iri = 0;
  const values = new Set<string>();
  for (const row of bindings) {
    const term = row[name];
    if (!term) continue;
    bound++;
    values.add(term.value);
    if (term.type === 'uri') iri++;
    else if (isDateTerm(term)) date++;
    else if (isNumericTerm(term)) numeric++;
  }
  let kind: ColumnKind = 'text';
  if (bound > 0) {
    if (numeric === bound) kind = 'numeric';
    else if (date === bound) kind = 'date';
    else if (iri === bound) kind = 'iri';
  }
  return { name, kind, bound, distinct: values.size };
}

/**
 * True when every row that binds `iriCol` binds `textCol` too, and each IRI
 * always comes with the same text: `textCol` then reads as a label of `iriCol`.
 */
function isFunctionalLabel(
  iriCol: string,
  textCol: string,
  bindings: SparqlBinding[],
  oneToOne = false
): boolean {
  const seen = new Map<string, string>();
  for (const row of bindings) {
    const iri = row[iriCol];
    if (!iri) continue;
    const label = row[textCol];
    if (!label) return false;
    const previous = seen.get(iri.value);
    if (previous !== undefined && previous !== label.value) return false;
    seen.set(iri.value, label.value);
  }
  if (oneToOne && new Set(seen.values()).size !== seen.size) return false;
  return seen.size > 0;
}

const LABEL_SUFFIXES = ['Label', '_label', 'label', 'Name', '_name', 'name'];

/** Analyse all columns of a SELECT result */
export function analyzeColumns(data: SparqlSelectResults): ColumnInfo[] {
  const bindings = data.results.bindings;
  const columns = data.head.vars.map((name) => classify(name, bindings));
  const byName = new Map(columns.map((c) => [c.name, c]));
  const textColumns = columns.filter((c) => c.kind === 'text');
  const iriColumns = columns.filter((c) => c.kind === 'iri');

  for (const iriCol of iriColumns) {
    // 1. Name convention: ?x with ?xLabel, ?x_label, ?xName, ...
    let label = LABEL_SUFFIXES.map((suffix) => byName.get(iriCol.name + suffix)).find(
      (c) =>
        c && c.kind === 'text' && !c.isLabel && isFunctionalLabel(iriCol.name, c.name, bindings)
    );
    // 2. A single IRI column next to a single text column that maps 1:1 onto it
    if (!label && iriColumns.length === 1 && textColumns.length === 1) {
      const candidate = textColumns[0];
      if (!candidate.isLabel && isFunctionalLabel(iriCol.name, candidate.name, bindings, true))
        label = candidate;
    }
    if (label) {
      iriCol.labelColumn = label.name;
      label.isLabel = true;
    }
  }
  return columns;
}

/** True when the results have at least one numeric column */
export function hasNumericColumn(columns: ColumnInfo[]): boolean {
  return columns.some((c) => c.kind === 'numeric');
}
