const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'popup.js'), 'utf8');

function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('slice fail: ' + from + ' -> ' + to);
  return src.slice(a, b);
}

const code = [
  slice('const CSV_HEADERS', 'function reviewRow'),
  slice('function reviewRow', 'function csvEscape'),
  slice('function csvEscape', 'function relToDate'),
  slice('function relToDate', 'function distFromReviews'),
  slice('function distFromReviews', 'function buildXlsx'),
  'module.exports = { CSV_HEADERS, buildCsv, relToDate, csvEscape, distFromReviews };',
].join('\n');

const m = { exports: {} };
vm.runInNewContext(code, {
  module: m,
  exports: m.exports,
  Date,
  Math,
  JSON,
  Number,
  String,
  parseInt,
  parseFloat,
  isNaN,
  console,
});
const { CSV_HEADERS, buildCsv, relToDate, distFromReviews } = m.exports;

let fails = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' = ' + JSON.stringify(got) + (ok ? '' : ' want ' + JSON.stringify(want)));
}

// ---- relToDate: relative (TZ-independent via UTC) ----
const ref = new Date('2026-11-13T00:00:00Z');
expect('2 weeks ago', relToDate('2 weeks ago', ref), '2026-10-30');
expect('3 bulan yang lalu', relToDate('3 bulan yang lalu', ref), '2026-08-13');
expect('il y a 5 jours', relToDate('il y a 5 jours', ref), '2026-11-08');
expect('1 year ago', relToDate('1 year ago', ref), '2025-11-13');
expect('hace 2 días', relToDate('hace 2 días', ref), '2026-11-11');
expect('a moment ago', relToDate('a moment ago', ref), '2026-11-13');
expect('3 hours ago', relToDate('3 hours ago', ref), '2026-11-12');
expect('a month ago', relToDate('a month ago', ref), '2026-10-13');
expect('baru saja', relToDate('baru saja', ref), '2026-11-13');
expect('2 hari yang lalu', relToDate('2 hari yang lalu', ref), '2026-11-11');

// ---- relToDate: absolute (fixed by regex-year fast path) ----
expect('12 Jan 2025', relToDate('12 Jan 2025', ref), '2025-01-12');
expect('Jan 12, 2025', relToDate('Jan 12, 2025', ref), '2025-01-12');
expect('2025-03-07', relToDate('2025-03-07', ref), '2025-03-07');

// ---- distFromReviews: 4,5 must bucket into 5 (Google rounds up), comma decimal ----
const dist = distFromReviews([
  { rating: '5' },
  { rating: '4,5' },
  { rating: '3' },
  { rating: '2' },
  { rating: '1' },
  { rating: '5' },
]);
expect('dist.5', dist.dist[5], 3);
expect('dist.4', dist.dist[4], 0);
expect('dist.cnt', dist.cnt, 6);

// ---- buildCsv: RFC4180 round-trip ----
const rows = [
  {
    id: 'x1', name: 'Bob "BB"', profile: 'https://u/1',
    localGuide: 'Local Guide · 50 reviews', rating: '5',
    text: 'Great,\n"multi" line', date: '2 weeks ago', likes: '3',
    photos: 2, ownerReply: 'Thanks!', ownerReplyDate: '1 week ago',
  },
  {
    id: 'x2', name: 'Ani', profile: '', localGuide: '', rating: '3',
    text: 'Biasa saja, kopi dingin', date: '1 bulan yang lalu', likes: '',
    photos: 0, ownerReply: '', ownerReplyDate: '',
  },
];
const csv = buildCsv(rows, { name: 'Cafe Test', url: 'https://maps/1' }, '2026-11-13T00:00:00Z');
console.log('--- CSV ---');
console.log(csv);

function parseCSV(t) {
  const out = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r' && t[i + 1] === '\n') { row.push(field); out.push(row); row = []; field = ''; i++; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out;
}
const parsed = parseCSV(csv.replace(/^\uFEFF/, ''));
expect('csv row count', parsed.length, 3);
expect('csv col count r1', parsed[1].length, CSV_HEADERS.length);
expect('csv col count r2', parsed[2].length, CSV_HEADERS.length);
expect('csv quote escape', parsed[1][1], 'Bob "BB"');
expect('csv multiline', parsed[1][5], 'Great,\n"multi" line');
expect('csv BOM', csv.charCodeAt(0), 0xfeff);

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' TESTS FAILED');
process.exit(fails === 0 ? 0 : 1);
