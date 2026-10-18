// Checks the JS port against the R results written by dump_r.R.
// Usage: node web/test/compare.mjs export.zip R_OUT_DIR START END
import { openAsBlob, readFileSync, existsSync } from 'node:fs';
import { readHealthExport } from '../js/parse.js';
import * as M from '../js/metrics.js';
import { dayNum, dayStr, isFin } from '../js/util.js';

const [zip, dir, start, end] = process.argv.slice(2);
const csv = (name) => {
  const p = `${dir}/${name}.csv`;
  if (!existsSync(p)) return null;
  const [head, ...rows] = readFileSync(p, 'utf8').trim().split('\n');
  const cols = head.split(',').map((c) => c.replace(/"/g, ''));
  return rows.map((r) => { const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '')); return Object.fromEntries(cols.map((c, i) => [c, cells[i]])); });
};
let bad = 0, checked = 0;
function cmp(label, js, r) {
  const rv = r === 'NA' || r === '' || r === undefined ? NaN : isNaN(Number(r)) ? r : Number(r);
  checked++;
  const ok = typeof rv === 'string' ? String(js) === rv : (Number.isNaN(rv) && !isFin(js) && typeof js !== 'string') || (isFin(rv) && isFin(js) && Math.abs(js - rv) <= 1e-6 * Math.max(1, Math.abs(rv)));
  if (!ok) { bad++; if (bad < 30) console.log('MISMATCH', label, 'js=', js, 'R=', r); }
}
function table(name, jsRows, map) {
  const rr = csv(name);
  if (!rr) { console.log('skip', name); return; }
  if (rr.length !== jsRows.length) { bad++; console.log('ROWS', name, jsRows.length, 'vs R', rr.length); return; }
  rr.forEach((row, i) => { for (const [col, f] of Object.entries(map)) cmp(`${name}[${i}].${col}`, f(jsRows[i]), row[col]); });
}

const blob = await openAsBlob(zip);
const x = await readHealthExport(blob, { start, end });
const sd = dayNum(start), ed = dayNum(end);
const runs = M.buildRuns(x, sd, ed);
const keys = ['mi', 'energy_kcal', 'duration_min', 'elapsed_min', 'pace_mi', 'hr_avg', 'hr_max', 'hr_n', 'hr_suspect_n', 'hr_max_gap_s', 'cadence_spm',
  'vert_osc_cm', 'gct_ms', 'hrr_1min', 'power_w', 'stride_m', 'drift_pct', 'temp_f', 'humidity', 'dist_samples_mi', 'ef'];
table('runs', runs, { ...Object.fromEntries(keys.map((k) => [k, (r) => r[k]])), date: (r) => dayStr(r.date), start: (r) => r.start, end: (r) => r.end, source: (r) => r.source,
  indoor: (r) => (r.indoor ? 'TRUE' : 'FALSE'), duplicate: (r) => (r.duplicate ? 'TRUE' : 'FALSE'), month: (r) => r.month });

const zi = csv('zoneinfo')[0];
const endActual = Math.max(...runs.map((r) => r.date));
const maxHr = isFin(M.estimateMaxHr(x.birthDate, endActual)) ? M.estimateMaxHr(x.birthDate, endActual) : Math.max(...runs.map((r) => r.hr_max).filter(isFin));
const restHr = isFin(M.estimateRestHr(x, endActual)) ? M.estimateRestHr(x, endActual) : 0;
cmp('max_hr', maxHr, zi.max_hr); cmp('rest_hr', restHr, zi.rest_hr); cmp('zone labels', M.zoneLabels(maxHr, restHr).join('|'), zi.labels);
const zs = M.zoneSeconds(runs, maxHr, restHr);
table('zones', zs, Object.fromEntries(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map((c, k) => [c, (z) => z[k]])));

const msMap = Object.fromEntries(['month', 'runs', 'mi', 'minutes', 'kcal', 'kcal_per_mi', 'pace_mi', 'hr_weighted', 'hr_max', 'longest_mi', 'fastest_pace', 'fastest_mi', 'cadence', 'vert_osc', 'gct', 'mech_runs'].map((k) => [k, (r) => r[k]]));
for (const [name, type] of [['ms_all', 'all'], ['ms_out', 'outdoor'], ['ms_in', 'indoor']]) {
  const rows = M.monthlySummary(runs, type), rr = csv(name);
  // R fills missing months with NA; compare only the columns present in every JS row
  table(name, rows.map((r) => ({ ...Object.fromEntries(Object.keys(msMap).map((k) => [k, NaN])), ...r })), msMap);
}
const wk = M.weeklyLoad(runs, M.priorRuns(x, sd));
table('wk', wk, { week: (w) => dayStr(w.week), mi: (w) => w.mi, mi_outdoor: (w) => w.mi_outdoor, mi_indoor: (w) => w.mi_indoor, in_range: (w) => (w.in_range ? 'TRUE' : 'FALSE') });
const rg = M.routeGroups(runs);
table('rg', rg, { date: (r) => dayStr(r.date), route_mi: (r) => r.route_mi });
table('perf', M.perfSummary(runs), Object.fromEntries(['month', 'runs', 'ef', 'power_w', 'stride_m', 'drift', 'drift_n', 'temp_f'].map((k) => [k, (r) => r[k]])));
const wbMap = Object.fromEntries(['bin', 'runs', 'humidity', 'pace_mi', 'hr', 'ef', 'drift'].map((k) => [k, (r) => r[k]]));
table('wbF', M.weatherBins(runs, 'F'), wbMap); table('wbC', M.weatherBins(runs, 'C'), wbMap);
const wr = M.weatherRuns(runs);
if (wr) table('wr', wr, { date: (r) => dayStr(r.date), hr_resid: (r) => r.hr_resid });
console.log(`${checked} values compared, ${bad} differences`);
process.exit(bad ? 1 : 0);
