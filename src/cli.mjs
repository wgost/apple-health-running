#!/usr/bin/env node
// Generate the running report from an Apple Health export.
//
// Usage:
//   node src/cli.mjs path/to/export.zip [--duration 3] [--out output] [--end YYYY-MM-DD]
//
//   --duration  number of calendar months to report, ending on --end (default 3: this month and the two before it)
//   --out       output folder (default ./output)
//   --end       last day of the report (default today)
//
// Parsing a multi-GB export takes a minute or two. It runs the same code as the browser app (src/lib/).

import { openAsBlob, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { readHealthExport } from './lib/parse.js';
import { buildReport } from './lib/build-report.js';
import { loadAssets } from './lib/assets.js';
import { dayNum, dayStr, reportStart } from './lib/util.js';

const USAGE = 'Usage: node src/cli.mjs path/to/export.zip [--duration MONTHS] [--out DIR] [--end YYYY-MM-DD]';
const fail = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const opt = { duration: '3', out: 'output', end: localToday(), zip: null };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a === '--duration' || a === '--out' || a === '--end') {
    if (i + 1 >= args.length) fail(`${a} needs a value`);
    opt[a.slice(2)] = args[++i];
  } else if (a.startsWith('-')) fail(`Unknown option ${a}`);
  else opt.zip = a;
}
if (!opt.zip) fail('Give the path to export.zip');
const months = Number(opt.duration);
if (!Number.isInteger(months) || months < 1) fail('--duration must be a whole number of months (1 or more)');
if (!/^\d{4}-\d{2}-\d{2}$/.test(opt.end) || dayStr(dayNum(opt.end)) !== opt.end) fail('--end must be a date as YYYY-MM-DD');

const end = dayNum(opt.end), start = reportStart(months, end);
const t0 = Date.now();
console.error(`Reading ${opt.zip} (this can take a few minutes)...`);
let shown = -1;
const x = await readHealthExport(await openAsBlob(opt.zip), { start: dayStr(start), end: opt.end }, (p) => {
  const pct = Math.floor(p.fraction * 100);
  if (pct !== shown && pct % 5 === 0) { shown = pct; console.error(`  ${pct}%`); }
});
console.error(`Parsed in ${Math.round((Date.now() - t0) / 1000)} s: ${x.workouts.length} running workouts, ${x.sampleCount.toLocaleString('en-US')} samples.`);
console.error(`Report range: ${dayStr(start)} to ${opt.end}`);

const assets = await loadAssets(async (name) => readFileSync(new URL(`./lib/assets/${name}`, import.meta.url), 'utf8'));
let html;
try {
  html = buildReport(x, start, end, { assets, sourceName: basename(opt.zip), generated: opt.end });
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
mkdirSync(resolve(opt.out), { recursive: true });
const file = join(resolve(opt.out), `running_report_${dayStr(start)}_${opt.end}.html`);
writeFileSync(file, html);
console.error(`Report: ${file}`);
