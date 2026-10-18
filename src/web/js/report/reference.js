// Section 3: how the numbers are calculated, and data checks. Takes the context built by buildReport() in ../report.js.

import * as M from '../metrics.js';
import { KM_PER_MI, isFin, rnd, sum, finite, esc, fmtPace, f2, r0, fmtMonDD } from '../util.js';
import { dual } from './format.js';
import { table } from './page.js';

export function reportReference(ctx) {
  const { x, opts, runs, outv, endActual, maxHr, maxHrFromAge, restHr, restHrFound, add, h1, h2, closeDiv } = ctx;
  h1('3. Reference');
  h2("How it's calculated");
  const calc = [
    ['Distance and pace', 'Distance, duration', 'Workout totals'],
    ['', 'Avg pace', '\u03a3 duration \u00f7 \u03a3 distance'],
    ['Heart rate', 'Avg HR', '\u03a3(run HR \u00d7 duration) \u00f7 \u03a3 duration'],
    ['', 'Max HR', 'Highest HR sample'],
    ['', 'Zone max HR', maxHrFromAge ? '208 \u2212 0.7 \u00d7 age' : 'Highest valid HR sample'],
    ['', 'Resting HR', 'Median of resting-HR readings, last 30 days'],
    ['', 'HR zone limit', 'resting HR + % \u00d7 (max HR \u2212 resting HR)'],
    ['', 'Time in zone', 'Time-weighted HR samples'],
    ['Energy and form', 'Active energy', 'Watch workout total (kcal)'],
    ['', 'Avg cadence', 'Steps \u00f7 duration'],
    ['', 'Vertical oscillation, ground contact', 'Duration-weighted mean'],
    ['Performance (outdoor runs)', 'Efficiency', 'Speed (m/min) \u00f7 avg HR'],
    ['', 'Power, stride length', 'Mean of the watch\u2019s samples'],
    ['', 'Cardiac drift', '100 \u00d7 (1 \u2212 (speed \u00f7 HR, 2nd half) \u00f7 (speed \u00f7 HR, 1st half))'],
    ['', 'Weather', 'Temperature and humidity at the start'],
  ];
  add('<div class="tablebox">', table(['Area', 'Metric', 'Formula'], calc, ['l', 'l', 'l'], 'formulas'), '</div>');
  closeDiv();

  h2('Data checks');
  const nOut = outv.length, cov = (k) => `${outv.filter((r) => isFin(r[k])).length} of ${nOut}`;
  const paces = runs.map((r) => r.pace_mi), diffMi = Math.max(...runs.map((r) => Math.abs(r.dist_samples_mi - r.mi)));
  const nRest = M.recentRestingHr(x, endActual).length;
  const checks = [
    ['Workouts', 'Type and source', `Running workouts only; ${esc([...new Set(runs.map((r) => r.source))].join(', '))}`],
    ['', 'Duplicate or overlapping workouts', runs.filter((r) => r.duplicate).length],
    ['', 'Pace range', dual(`${fmtPace(Math.min(...paces))}\u2013${fmtPace(Math.max(...paces))} /mi; no runs excluded`, `${fmtPace(Math.min(...paces) / KM_PER_MI)}\u2013${fmtPace(Math.max(...paces) / KM_PER_MI)} /km; no runs excluded`)],
    ['Distance and time', 'Workout total vs sum of distance samples', dual(`Largest difference ${f2(diffMi)} mi`, `Largest difference ${f2(diffMi * KM_PER_MI)} km`)],
    ['', 'End \u2212 start vs recorded duration', `Largest difference ${f2(Math.max(...runs.map((r) => r.elapsed_min - r.duration_min)))} min`],
    ['Heart rate', 'Samples inside workouts', `${r0(sum(runs.map((r) => r.hr_n)))} (${Math.min(...runs.map((r) => r.hr_n))}\u2013${Math.max(...runs.map((r) => r.hr_n))} per run)`],
    ['', 'Runs with HR samples', `${runs.filter((r) => r.hr_n > 0).length} of ${runs.length}`],
    ['', 'Longest stretch without an HR sample', `${rnd(Math.max(...finite(runs.map((r) => r.hr_max_gap_s))))} s`],
    ['', 'Samples excluded (outside 40\u2013220 bpm, or spikes over 25 bpm from both neighbours)', sum(runs.map((r) => r.hr_suspect_n))],
    ['HR zone inputs', 'Date of birth (for max HR)', maxHrFromAge ? `Found; max HR ${rnd(maxHr)} bpm` : `Missing; max HR is the highest recorded HR (${rnd(maxHr)} bpm)`],
    ['', 'Resting HR, last 30 days', restHrFound ? `${nRest} readings to ${fmtMonDD(endActual)}; median ${rnd(restHr)} bpm` : 'No readings; zones are a plain share of max HR'],
    ['Performance inputs (outdoor runs)', 'Power', cov('power_w')],
    ['', 'Stride length', cov('stride_m')],
    ['', 'Weather', cov('temp_f')],
    ['', `Cardiac drift (runs of ${M.DRIFT_MIN_MIN} min or more, HR and distance in both halves)`, cov('drift_pct')],
  ];
  add('<div class="tablebox">', table(['Area', 'Check', 'Result'], checks.map((r) => r.map(String)), ['l', 'l', 'l'], 'formulas'), '</div>');
  add(`<p class="caption">${dual('Distance in miles, temperature in \u00b0F', 'Distance in kilometres, temperature in \u00b0C')}. Runs are dated by local start time. Generated ${esc(opts.generated)} in your browser from ${esc(opts.sourceName)}.</p>`);
  closeDiv();
  closeDiv();
}
