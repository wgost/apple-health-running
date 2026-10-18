// Build a report from an export.zip in Node (same code as the browser).
// Usage: node web/test/build.mjs export.zip out.html [months=24] [today=YYYY-MM-DD]
import { openAsBlob, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readHealthExport } from '../js/parse.js';
import { buildReport } from '../js/report.js';
import { loadShared } from '../js/shared.js';
import { dayNum, dayStr, reportStart } from '../js/util.js';

const [zip, out, months = '24', today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const end = dayNum(today), start = reportStart(+months, end);
const t = Date.now();
const x = await readHealthExport(await openAsBlob(zip), { start: dayStr(start), end: today });
const shared = await loadShared(async (name) => readFileSync(new URL(`../../shared/${name}`, import.meta.url), 'utf8'));
writeFileSync(out, buildReport(x, start, end, { shared, sourceName: basename(zip), generated: today }));
console.log(`${x.workouts.length} workouts, ${x.sampleCount} samples, ${Date.now() - t} ms -> ${out}`);
