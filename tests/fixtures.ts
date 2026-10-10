import type { SparqlSelectResults, SparqlTerm } from '../src/types';

const XSD = 'http://www.w3.org/2001/XMLSchema#';

export const iri = (value: string): SparqlTerm => ({ type: 'uri', value });
export const lit = (value: string, lang?: string): SparqlTerm =>
  lang ? { type: 'literal', value, 'xml:lang': lang } : { type: 'literal', value };
export const int = (value: number): SparqlTerm => ({
  type: 'literal',
  value: String(value),
  datatype: XSD + 'integer',
});
export const dec = (value: number): SparqlTerm => ({
  type: 'literal',
  value: String(value),
  datatype: XSD + 'decimal',
});
export const date = (value: string): SparqlTerm => ({
  type: 'literal',
  value,
  datatype: XSD + 'date',
});

export function select(vars: string[], rows: (SparqlTerm | undefined)[][]): SparqlSelectResults {
  return {
    head: { vars },
    results: {
      bindings: rows.map((row) => {
        const binding: Record<string, SparqlTerm> = {};
        row.forEach((term, i) => {
          if (term) binding[vars[i]] = term;
        });
        return binding;
      }),
    },
  };
}

const EX = 'http://example.org/';

/** Track length per line category, with labels */
export const lengthPerCategory = select(
  ['category', 'categoryLabel', 'length'],
  [
    [iri(EX + 'cat/A'), lit('Main line'), dec(1200.5)],
    [iri(EX + 'cat/B'), lit('Branch line'), dec(340)],
    [iri(EX + 'cat/C'), lit('Siding'), dec(55.25)],
  ]
);

/** Operational points per country and type (long format) */
export const pointsPerCountryAndType = select(
  ['country', 'type', 'count'],
  [
    [lit('BE'), lit('station'), int(10)],
    [lit('BE'), lit('junction'), int(4)],
    [lit('NL'), lit('station'), int(7)],
    [lit('NL'), lit('junction'), int(2)],
    [lit('FR'), lit('station'), int(20)],
  ]
);

/** Values over time */
export const perMonth = select(
  ['month', 'count'],
  [
    [date('2024-03-01'), int(5)],
    [date('2024-01-01'), int(3)],
    [date('2024-02-01'), int(8)],
  ]
);

export const numbersOnly = select(
  ['x', 'y'],
  [
    [int(1), dec(2.5)],
    [int(2), dec(3.5)],
    [int(3), dec(1)],
  ]
);

export const textOnly = select(['s', 'name'], [[iri(EX + 'a'), lit('A')]]);
