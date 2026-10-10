import {
  analyzeColumns,
  getSelectResults,
  hasNumericColumn,
  isNumericTerm,
  toNumber,
  toTimestamp,
} from '../src/columns';
import {
  date,
  dec,
  int,
  iri,
  lengthPerCategory,
  lit,
  perMonth,
  select,
  textOnly,
} from './fixtures';

describe('term helpers', () => {
  it('recognises numbers', () => {
    expect(isNumericTerm(int(3))).toBe(true);
    expect(isNumericTerm(dec(3.5))).toBe(true);
    expect(isNumericTerm(lit('42'))).toBe(true);
    expect(isNumericTerm(lit('-1.5e3'))).toBe(true);
    expect(isNumericTerm(lit('42 km'))).toBe(false);
    expect(isNumericTerm(lit('42', 'en'))).toBe(false);
    expect(isNumericTerm(iri('http://example.org/1'))).toBe(false);
    expect(isNumericTerm(date('2024-01-01'))).toBe(false);
    expect(isNumericTerm(undefined)).toBe(false);
  });

  it('converts numbers and dates', () => {
    expect(toNumber(dec(1200.5))).toBe(1200.5);
    expect(toNumber(lit('abc'))).toBeNull();
    expect(toTimestamp(date('2024-01-01'))).toBe(Date.UTC(2024, 0, 1));
    expect(
      toTimestamp({
        type: 'literal',
        value: '2024',
        datatype: 'http://www.w3.org/2001/XMLSchema#gYear',
      })
    ).toBe(Date.UTC(2024, 0, 1));
    expect(
      toTimestamp({
        type: 'literal',
        value: '2024-05-06T10:00:00',
        datatype: 'http://www.w3.org/2001/XMLSchema#dateTime',
      })
    ).toBe(Date.UTC(2024, 4, 6, 10));
  });
});

describe('getSelectResults', () => {
  it('unwraps YASR results', () => {
    expect(getSelectResults({ json: lengthPerCategory })).toBe(lengthPerCategory);
    expect(getSelectResults(lengthPerCategory)).toBe(lengthPerCategory);
  });

  it('uses getVariables/getBindings when there is no JSON', () => {
    const results = {
      getVariables: () => ['a'],
      getBindings: () => [{ a: int(1) }],
    };
    expect(getSelectResults(results)?.head.vars).toEqual(['a']);
  });

  it('rejects non-SELECT results', () => {
    expect(getSelectResults(null)).toBeNull();
    expect(getSelectResults({ json: { boolean: true } })).toBeNull();
  });
});

describe('analyzeColumns', () => {
  it('classifies columns and finds label columns', () => {
    const columns = analyzeColumns(lengthPerCategory);
    expect(columns.map((c) => c.kind)).toEqual(['iri', 'text', 'numeric']);
    expect(columns[0].labelColumn).toBe('categoryLabel');
    expect(columns[1].isLabel).toBe(true);
    expect(hasNumericColumn(columns)).toBe(true);
  });

  it('recognises date columns', () => {
    expect(analyzeColumns(perMonth).map((c) => c.kind)).toEqual(['date', 'numeric']);
  });

  it('only treats a text column as label when it maps 1:1 onto the IRI', () => {
    const data = select(
      ['s', 'type', 'n'],
      [
        [iri('http://example.org/a'), lit('x'), int(1)],
        [iri('http://example.org/a'), lit('y'), int(2)],
      ]
    );
    const columns = analyzeColumns(data);
    expect(columns[0].labelColumn).toBeUndefined();
    expect(columns[1].isLabel).toBeFalsy();
  });

  it('treats mixed columns as text', () => {
    const data = select(['v'], [[int(1)], [lit('abc')]]);
    expect(analyzeColumns(data)[0].kind).toBe('text');
  });

  it('reports no numeric column for text-only results', () => {
    expect(hasNumericColumn(analyzeColumns(textOnly))).toBe(false);
  });
});
