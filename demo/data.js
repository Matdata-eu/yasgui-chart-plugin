// Sample SELECT results (SPARQL 1.1 JSON) for the demo
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const EX = 'http://example.org/';

const iri = (value) => ({ type: 'uri', value });
const lit = (value) => ({ type: 'literal', value });
const typed = (value, type) => ({ type: 'literal', value: String(value), datatype: XSD + type });

function select(vars, rows) {
  return {
    head: { vars },
    results: {
      bindings: rows.map((row) => Object.fromEntries(vars.map((v, i) => [v, row[i]]).filter(([, t]) => t))),
    },
  };
}

export const datasets = {
  length: {
    label: 'Track length per line category',
    results: select(
      ['category', 'categoryLabel', 'lengthKm'],
      [
        [iri(EX + 'category/main'), lit('Main line'), typed(3612.4, 'decimal')],
        [iri(EX + 'category/regional'), lit('Regional line'), typed(1820.9, 'decimal')],
        [iri(EX + 'category/freight'), lit('Freight line'), typed(744.2, 'decimal')],
        [iri(EX + 'category/highspeed'), lit('High-speed line'), typed(209.5, 'decimal')],
        [iri(EX + 'category/siding'), lit('Siding'), typed(96.1, 'decimal')],
      ]
    ),
  },
  countries: {
    label: 'Operational points per country and type',
    results: select(
      ['country', 'type', 'count'],
      [
        ['BE', 'Station', 560], ['BE', 'Junction', 210], ['BE', 'Halt', 120],
        ['NL', 'Station', 410], ['NL', 'Junction', 150], ['NL', 'Halt', 60],
        ['LU', 'Station', 68], ['LU', 'Junction', 21],
        ['FR', 'Station', 2980], ['FR', 'Junction', 1240], ['FR', 'Halt', 860],
      ].map(([c, t, n]) => [lit(c), lit(t), typed(n, 'integer')])
    ),
  },
  monthly: {
    label: 'Changes per month',
    results: select(
      ['month', 'additions', 'removals'],
      Array.from({ length: 24 }, (_, i) => {
        const d = new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10);
        return [
          typed(d, 'date'),
          typed(Math.round(400 + 150 * Math.sin(i / 3) + i * 12), 'integer'),
          typed(Math.round(120 + 60 * Math.cos(i / 4)), 'integer'),
        ];
      })
    ),
  },
  scatter: {
    label: 'Line length vs. speed',
    results: select(
      ['line', 'lengthKm', 'maxSpeed'],
      Array.from({ length: 60 }, (_, i) => [
        iri(EX + 'line/' + (i + 1)),
        typed((5 + ((i * 37) % 180) + (i % 7) * 3.3).toFixed(1), 'decimal'),
        typed(60 + ((i * 53) % 260), 'integer'),
      ])
    ),
  },
  histogram: {
    label: 'Distribution of platform lengths',
    results: select(
      ['platformLength'],
      Array.from({ length: 200 }, (_, i) => [
        typed(Math.round(80 + 340 * Math.abs(Math.sin(i * 1.7)) * Math.abs(Math.cos(i * 0.3))), 'integer'),
      ])
    ),
  },
};
