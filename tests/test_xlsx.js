const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = require('path').join(__dirname, '..');

// load SheetJS
const XLSX = require(path.join(dir, 'xlsx.full.min.js'));

const src = fs.readFileSync(path.join(dir, 'popup.js'), 'utf8');
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
  slice('function buildXlsx', 'function downloadBlob'),
  'module.exports = { CSV_HEADERS, buildXlsx, relToDate };',
].join('\n');

const m = { exports: {} };
vm.runInNewContext(code, {
  module: m, exports: m.exports, Date, Math, JSON, Number, String,
  parseInt, parseFloat, isNaN, console, TextEncoder,
  window: { XLSX }, // buildXlsx uses window.XLSX
  Uint8Array,
});
const { buildXlsx, CSV_HEADERS } = m.exports;

// sample reviews
const reviews = [];
for (let i = 1; i <= 50; i++) {
  reviews.push({
    id: 'r' + i,
    name: 'User ' + i,
    profile: 'https://contributor.google.com/u/' + i + '/reviews',
    localGuide: i % 3 === 0 ? 'Local Guide · ' + i * 10 + ' reviews' : '',
    rating: String((i % 5) + 1),
    text: 'Review number ' + i + '. "Quoted" text, with, commas\nand newline.',
    date: ['2 weeks ago', '1 bulan yang lalu', '3 days ago', 'Jan 12, 2025'][i % 4],
    likes: String(i % 7),
    photos: i % 4,
    ownerReply: i % 5 === 0 ? 'Thanks for visiting!' : '',
    ownerReplyDate: i % 5 === 0 ? '1 week ago' : '',
  });
}
const place = { name: 'Cafe Enak', rating: '4,6', reviewCount: '1.234', url: 'https://www.google.com/maps/place/Cafe+Enak' };

const bytes = buildXlsx(reviews, place, '2026-11-13T00:00:00Z');
console.log('xlsx bytes:', bytes.length, 'type:', bytes.constructor.name);

// write to disk then re-read with SheetJS to verify structure
const out = path.join(dir, 'test_output.xlsx');
fs.writeFileSync(out, Buffer.from(bytes));

const wb = XLSX.read(new Uint8Array(fs.readFileSync(out)), { type: 'array' });
console.log('sheets:', wb.SheetNames);
if (wb.SheetNames.length !== 2 || wb.SheetNames[0] !== 'Reviews' || wb.SheetNames[1] !== 'Summary') {
  console.error('FAIL sheet names');
  process.exit(1);
}

const revRows = XLSX.utils.sheet_to_json(wb.Sheets['Reviews'], { header: 1 });
console.log('Reviews rows (incl header):', revRows.length);
if (revRows.length !== 51) { console.error('FAIL row count', revRows.length); process.exit(1); }
if (revRows[0].length !== CSV_HEADERS.length) { console.error('FAIL header cols'); process.exit(1); }
console.log('row1:', JSON.stringify(revRows[1]).slice(0, 160));
console.log('row50 name:', revRows[50][1], '| reply:', revRows[50][9]);

const sumRows = XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { header: 1 });
console.log('Summary rows:', sumRows.length);
for (const r of sumRows.slice(0, 24)) console.log('  ', JSON.stringify(r));

// assertions on summary content
const flat = sumRows.map(r => JSON.stringify(r)).join('\n');
if (!flat.includes('Cafe Enak')) { console.error('FAIL place name in summary'); process.exit(1); }
if (!flat.includes('Owner reply rate')) { console.error('FAIL reply rate row'); process.exit(1); }
if (!flat.includes('Reviews per month')) { console.error('FAIL per month row'); process.exit(1); }

console.log('\nXLSX TEST PASSED — file:', out);
