const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = require('path').join(__dirname, '..');
const XLSX = require(path.join(dir, 'xlsx.full.min.js'));

const fixture = JSON.parse(
  fs.readFileSync(require('path').join(__dirname, 'fixtures', 'reviews.json'), 'utf8')
);
const reviews = fixture.reviews;
const place = fixture.place;
const exportedAt = fixture.exported_at;
console.log('fixture reviews:', reviews.length, '| place:', place.name);

const src = fs.readFileSync(path.join(dir, 'popup.js'), 'utf8');
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('slice fail: ' + from);
  return src.slice(a, b);
}
const code = [
  slice('const CSV_HEADERS', 'function reviewRow'),
  slice('function reviewRow', 'function csvEscape'),
  slice('function csvEscape', 'function relToDate'),
  slice('function relToDate', 'function distFromReviews'),
  slice('function distFromReviews', 'function buildXlsx'),
  slice('function buildXlsx', 'function downloadBlob'),
  'module.exports = { CSV_HEADERS, buildCsv, buildXlsx, relToDate };',
].join('\n');
const m = { exports: {} };
vm.runInNewContext(code, {
  module: m, exports: m.exports, Date, Math, JSON, Number, String,
  parseInt, parseFloat, isNaN, console, TextEncoder,
  window: { XLSX }, Uint8Array,
});
const { CSV_HEADERS, buildCsv, buildXlsx } = m.exports;

let fails = 0;
function check(name, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + extra : ''));
}

// ---- CSV ----
const csv = buildCsv(reviews, place, exportedAt);
const csvLines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
check('CSV line count = 11', csvLines.length === 11, csvLines.length);
check('CSV header matches', csvLines[0] === CSV_HEADERS.join(','), csvLines[0]);

// RFC4180 parse-back
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
check('CSV parses to 11 rows', parsed.length === 11, parsed.length);
check('CSV every row 14 cols', parsed.every(r => r.length === CSV_HEADERS.length));
check('CSV quote-escape in text', parsed[1][5].includes('"bagus"'), parsed[1][5]);

// ---- XLSX ----
const bytes = buildXlsx(reviews, place, exportedAt);
const outFile = path.join(dir, 'test_e2e.xlsx');
fs.writeFileSync(outFile, Buffer.from(bytes));
const wb = XLSX.read(new Uint8Array(fs.readFileSync(outFile)), { type: 'array' });
check('XLSX sheets = Reviews + Summary', wb.SheetNames.length === 2 && wb.SheetNames[0] === 'Reviews' && wb.SheetNames[1] === 'Summary', wb.SheetNames.join(','));

const revRows = XLSX.utils.sheet_to_json(wb.Sheets['Reviews'], { header: 1 });
check('XLSX Reviews rows = 11', revRows.length === 11, revRows.length);
check('XLSX Reviews cols = 14', revRows[0].length === 14, revRows[0].length);
// owner reply di row index 4 (rev-4)
check('XLSX owner_reply rev-4', revRows[4][9] === 'Thanks for visiting number 4!', revRows[4][9]);
check('XLSX owner_reply_date rev-4', revRows[4][10] === '1 week ago', revRows[4][10]);

const sumRows = XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { header: 1 });
const flat = JSON.stringify(sumRows);
check('Summary has place name', flat.includes('Test Cafe'));
check('Summary has Owner reply rate', flat.includes('Owner reply rate'));
check('Summary has Reviews per month', flat.includes('Reviews per month'));
check('Summary has rating distribution', flat.includes('Rating distribution'));

console.log(fails === 0 ? '\n=== E2E ALL PASSED ===' : '\n=== ' + fails + ' FAILURES ===');
process.exit(fails === 0 ? 0 : 1);
