// Run-level metrics and monthly / weekly summaries. A port of src/metrics.R; names follow the R code
// (snake_case fields, same formulas) so the two can be compared number for number.

import {
  KM_PER_MI, MI_PER_KM, isFin, rnd, sum, mean, median, finite, dayNum, monthKey, weekStart, parseHkTime,
  lm, clusterComplete, fToC,
} from './util.js';

export const DRIFT_MIN_MIN = 20;   // cardiac drift is only computed for runs of at least this many minutes
export const ZONE_LO = [0.6, 0.7, 0.8, 0.9];
export const ZONE_NAMES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
export const TEMP_EDGES_F = [60, 70, 80];

export const toMinutes = (v, unit) => (unit === 's' ? v / 60 : unit === 'hr' || unit === 'h' ? v * 60 : v);
export const toKcal = (v, unit) => (unit === 'kJ' ? v / 4.184 : v);   // Apple's "Cal" is kcal
export const toMiles = (v, unit) => (unit === 'km' ? v * MI_PER_KM : unit === 'm' ? v / 1609.344 : v);

// Seconds each sample represents: the time between the midpoints to its neighbours, clipped to [t0, t1].
export function hrWeights(t, t0, t1) {
  const n = t.length, w = new Array(n);
  let prev = t0;
  for (let i = 0; i < n; i++) {
    const next = i < n - 1 ? (t[i] + t[i + 1]) / 2 : t1;
    w[i] = Math.max(next - prev, 0);
    prev = next;
  }
  return w;
}
export function timeWeightedMean(t, v, t0, t1) {
  if (!t.length) return NaN;
  const w = hrWeights(t, t0, t1), sw = sum(w);
  return sw === 0 ? mean(v) : sum(v.map((x, i) => x * w[i])) / sw;
}
// Implausible HR samples: outside [40, 220] or an isolated spike more than `jump` bpm away from both neighbours.
export function hrSuspect(v, jump = 25) {
  const n = v.length, bad = v.map((x) => x < 40 || x > 220);
  for (let i = 1; i < n - 1; i++) if (Math.abs(v[i] - v[i - 1]) > jump && Math.abs(v[i] - v[i + 1]) > jump) bad[i] = true;
  return bad;
}

// ---- heart-rate zones ----
export function estimateMaxHr(birthDate, onDay) {
  if (!birthDate) return NaN;
  const b = new Date(birthDate + 'T00:00:00Z'), on = new Date(onDay * 86400000);
  if (Number.isNaN(b.getTime())) return NaN;
  const md = (d) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const age = on.getUTCFullYear() - b.getUTCFullYear() - (md(on) < md(b) ? 1 : 0);
  return rnd(208 - 0.7 * age);
}
export function recentRestingHr(x, onDay, days = 30) {
  const r = x.records.RestingHeartRate, out = [];
  for (let i = 0; i < r.n; i++) if (r.day[i] > onDay - days && r.day[i] <= onDay) out.push(r.v[i]);
  return out;
}
export function estimateRestHr(x, onDay, days = 30) {
  const v = recentRestingHr(x, onDay, days);
  return v.length ? rnd(median(v)) : NaN;
}
export const zoneBreaks = (maxHr, restHr = 0) => ZONE_LO.map((p) => Math.round((restHr + p * (maxHr - restHr)) * 1e6) / 1e6);
export function zoneLabels(maxHr, restHr = 0) {
  const b = zoneBreaks(maxHr, restHr).map(Math.floor);
  return [`Z1 \u2264${b[0]}`, `Z2 ${b[0] + 1}\u2013${b[1]}`, `Z3 ${b[1] + 1}\u2013${b[2]}`, `Z4 ${b[2] + 1}\u2013${b[3]}`, `Z5 >${b[3]}`];
}
// Seconds each run spent in each zone (runs x 5), from its time-weighted HR curve.
export function zoneSeconds(runs, maxHr, restHr = 0) {
  const b = zoneBreaks(maxHr, restHr);
  return runs.map((r) => {
    const out = [0, 0, 0, 0, 0];
    r.hr_curve.bpm.forEach((bpm, i) => { out[b.filter((x) => x < bpm).length] += r.hr_curve.sec[i]; });   // a sample equal to a limit is in the lower zone
    return out;
  });
}

// ---- lookups ----
function lowerBound(a, v) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }

function distBetween(ds, a, b) {   // miles covered between times a and b by the distance samples (prorated)
  let total = 0;
  for (const s of ds) {
    const len = s.t1 - s.t0;
    const frac = len > 0 ? Math.max(Math.min(s.t1, b) - Math.max(s.t0, a), 0) / len : (s.t0 >= a && s.t0 < b ? 1 : 0);
    total += toMiles(s.value * frac, s.unit);
  }
  return total;
}

function overlapMean(rec, srcIdx, t0, t1) {   // mean of the samples overlapping [t0, t1], weighted by overlap seconds
  let num = 0, den = 0;
  const from = lowerBound(rec.t0, t0 - 86400);
  for (let i = from; i < rec.n && rec.t0[i] <= t1; i++) {
    if (rec.src[i] !== srcIdx || rec.t1[i] < t0) continue;
    const w = Math.max(Math.min(rec.t1[i], t1) - Math.max(rec.t0[i], t0), 1);
    num += rec.v[i] * w; den += w;
  }
  return den ? num / den : NaN;
}

export function workoutMiles(x, w) {
  const s = x.stats.get(w.id).find((st) => st.type === 'DistanceWalkingRunning');
  return s && isFin(s.sum) ? toMiles(s.sum, s.unit) : toMiles(w.totalDistance, w.totalDistanceUnit);
}
export function workoutWeather(x, id) {
  const m = x.meta.get(id), tv = m.get('HKWeatherTemperature'), hv = m.get('HKWeatherHumidity');
  const temp = tv ? parseFloat(tv) : NaN;
  return { temp_f: tv && tv.includes('degC') ? (temp * 9) / 5 + 32 : temp, humidity: hv ? parseFloat(hv) / 100 : NaN };
}
export const workoutIndoor = (x, id) => x.meta.get(id).get('HKIndoorWorkout') === '1';

// ---- run table ----
export function buildRuns(x, startDay, endDay) {
  if (!x.workouts.length) throw new Error('No running workouts found in the export.');
  const ws = x.workouts.filter((w) => { const d = dayNum(w.date); return d >= startDay && d <= endDay; });
  if (!ws.length) throw new Error('No running workouts in the selected period.');
  ws.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const { HeartRate: hr, DistanceWalkingRunning: dist, HeartRateRecoveryOneMinute: hrr, RunningPower: power, RunningStrideLength: stride } = x.records;
  const srcIndex = new Map(x.sources.map((s, i) => [s, i]));

  const runs = ws.map((w) => {
    const id = w.id, t0 = w.t0, t1 = w.t1, src = srcIndex.get(w.source);
    const dur = toMinutes(w.duration, w.durationUnit);
    const stat = (type, field = 'sum') => { const s = x.stats.get(id).find((st) => st.type === type); return s ? s[field] : NaN; };
    const mi = workoutMiles(x, w);

    // watch HR samples within the workout, same source as the workout
    const ht = [], hv = [];
    for (let i = lowerBound(hr.t0, t0); i < hr.n && hr.t0[i] <= t1; i++) if (hr.src[i] === src) { ht.push(hr.t0[i]); hv.push(hr.v[i]); }
    const sus = hrSuspect(hv);
    const kt = ht.filter((_, i) => !sus[i]), kv = hv.filter((_, i) => !sus[i]);
    let maxGap = NaN;
    if (ht.length) { maxGap = 0; let prev = t0; for (const t of [...ht, t1]) { maxGap = Math.max(maxGap, t - prev); prev = t; } }

    // distance samples overlapping the workout (prorated), same source
    const ds = [];
    for (let i = lowerBound(dist.t0, t0 - 86400); i < dist.n && dist.t0[i] < t1; i++) {
      if (dist.src[i] === src && dist.t1[i] > t0) ds.push({ t0: dist.t0[i], t1: dist.t1[i], value: dist.v[i], unit: x.units[dist.unit[i]] });
    }

    // cardiac drift: how much speed per heartbeat falls from the first to the second half
    const mid = (t0 + t1) / 2;
    const first = kt.map((t, i) => i).filter((i) => kt[i] <= mid), second = kt.map((t, i) => i).filter((i) => kt[i] > mid);
    const hr1 = timeWeightedMean(first.map((i) => kt[i]), first.map((i) => kv[i]), t0, mid);
    const hr2 = timeWeightedMean(second.map((i) => kt[i]), second.map((i) => kv[i]), mid, t1);
    const sp1 = distBetween(ds, t0, mid) / (mid - t0), sp2 = distBetween(ds, mid, t1) / (t1 - mid);
    const drift = dur >= DRIFT_MIN_MIN && [hr1, hr2, sp1, sp2].every(isFin) && sp1 > 0 && sp2 > 0 ? 100 * (1 - sp2 / hr2 / (sp1 / hr1)) : NaN;

    const steps = stat('StepCount');
    const e = x.stats.get(id).find((st) => st.type === 'ActiveEnergyBurned');
    let rr = NaN;
    for (let i = lowerBound(hrr.t0, t1 - 300); i < hrr.n && hrr.t0[i] <= t1 + 2400; i++) { rr = hrr.v[i]; break; }
    const hr_avg = kt.length ? timeWeightedMean(kt, kv, t0, t1) : NaN;
    const wx = workoutWeather(x, id);
    const date = dayNum(w.date);
    return {
      date, start: w.start, end: w.end, source: w.source, indoor: workoutIndoor(x, id),
      mi, energy_kcal: e ? toKcal(e.sum, e.unit) : NaN, duration_min: dur, elapsed_min: (t1 - t0) / 60, pace_mi: dur / mi,
      hr_avg, hr_max: kv.length ? Math.max(...kv) : NaN,
      hr_curve: { bpm: kv, sec: kt.length ? hrWeights(kt, t0, t1) : [] },
      hr_n: ht.length, hr_suspect_n: sus.filter(Boolean).length, hr_max_gap_s: maxGap,
      cadence_spm: steps / dur,
      vert_osc_cm: stat('RunningVerticalOscillation', 'average'), gct_ms: stat('RunningGroundContactTime', 'average'),
      hrr_1min: rr, power_w: overlapMean(power, src, t0, t1), stride_m: overlapMean(stride, src, t0, t1),
      drift_pct: drift, temp_f: wx.temp_f, humidity: wx.humidity, dist_samples_mi: distBetween(ds, t0, t1),
      month: monthKey(date), ef: (mi * 1609.344) / dur / hr_avg,   // efficiency: metres per heartbeat
      t0, t1,
    };
  });
  // duplicates: same start, or overlapping intervals
  const seen = new Set();
  runs.forEach((r, i) => { r.duplicate = seen.has(r.start) || (i > 0 && r.t0 < runs[i - 1].t1); seen.add(r.start); });
  return runs;
}

// Running workouts before `start` (for load context), from the workout table only.
export function priorRuns(x, startDay, weeks = 5) {
  return x.workouts.filter((w) => { const d = dayNum(w.date); return d < startDay && d >= startDay - 7 * weeks; })
    .map((w) => ({ date: dayNum(w.date), mi: workoutMiles(x, w), indoor: workoutIndoor(x, w.id) }));
}

// ---- summaries ----
const sumBy = (a, f) => sum(a.map(f));
function monthRow(m) {
  const mech = m.filter((r) => isFin(r.vert_osc_cm));
  const fast = m.reduce((a, r) => (r.pace_mi < a.pace_mi ? r : a), m[0]);
  const W = sumBy(mech, (r) => r.duration_min);
  const en = m.filter((r) => isFin(r.energy_kcal));
  const withHr = m.filter((r) => isFin(r.hr_avg));
  const maxes = m.filter((r) => isFin(r.hr_max));
  const longest = m.reduce((a, r) => Math.max(a, r.mi), 0);
  return {
    month: m[0].month, runs: m.length, mi: sumBy(m, (r) => r.mi), minutes: sumBy(m, (r) => r.duration_min),
    kcal: en.length ? sumBy(en, (r) => r.energy_kcal) : NaN,
    kcal_per_mi: en.length ? sumBy(en, (r) => r.energy_kcal) / sumBy(en, (r) => r.mi) : NaN,
    pace_mi: sumBy(m, (r) => r.duration_min) / sumBy(m, (r) => r.mi),
    hr_weighted: sumBy(withHr, (r) => r.hr_avg * r.duration_min) / sumBy(withHr, (r) => r.duration_min),
    hr_max: maxes.length ? Math.max(...maxes.map((r) => r.hr_max)) : NaN,
    longest_mi: longest, fastest_pace: fast.pace_mi, fastest_mi: fast.mi,
    cadence: sumBy(m, (r) => r.cadence_spm * r.duration_min) / sumBy(m, (r) => r.duration_min),   // NaN if any run has no steps, as in R
    vert_osc: W > 0 ? sumBy(mech, (r) => r.vert_osc_cm * r.duration_min) / W : NaN,
    gct: W > 0 ? sumBy(mech, (r) => r.gct_ms * r.duration_min) / W : NaN,
    mech_runs: mech.length,
  };
}
// type: 'all' | 'outdoor' | 'indoor'. Months with no runs of that type get a row with runs = 0 and NaN elsewhere.
export function monthlySummary(runs, type = 'all') {
  const months = [...new Set(runs.map((r) => r.month))].sort();
  const v = runs.filter((r) => type === 'all' || (type === 'outdoor' ? !r.indoor : r.indoor));
  return months.map((mo) => {
    const m = v.filter((r) => r.month === mo);
    return m.length ? monthRow(m) : { month: mo, runs: 0 };
  });
}

// Weekly distance from all recorded runs; weeks that include a pre-range run count those miles too.
export function weeklyLoad(runs, prior = []) {
  const all = [...runs.map((r) => ({ date: r.date, mi: r.mi, indoor: r.indoor, in_range: true })),
    ...prior.map((r) => ({ date: r.date, mi: r.mi, indoor: r.indoor, in_range: false }))];
  all.forEach((r) => { r.week = weekStart(r.date); });
  const lo = Math.min(...all.map((r) => r.week)), hi = Math.max(...all.map((r) => r.week));
  const out = [];
  for (let k = lo; k <= hi; k += 7) {
    const m = all.filter((r) => r.week === k);
    out.push({
      week: k, mi: sumBy(m, (r) => r.mi), mi_outdoor: sumBy(m.filter((r) => !r.indoor), (r) => r.mi),
      mi_indoor: sumBy(m.filter((r) => r.indoor), (r) => r.mi), in_range: m.some((r) => r.in_range),
    });
  }
  return out.filter((w) => w.in_range);
}

// Groups of outdoor runs with a similar distance (recurring routes); route_mi is the group's median distance.
export function routeGroups(runs, h = 0.6, minRuns = 5) {
  const o = runs.filter((r) => !r.indoor).map((r) => ({ ...r, route_mi: NaN }));
  if (o.length < minRuns) return o;
  for (const g of clusterComplete(o.map((r) => r.mi), h)) if (g.length >= minRuns) {
    const med = median(g.map((i) => o[i].mi));
    g.forEach((i) => { o[i].route_mi = med; });
  }
  return o;
}

// ---- performance analysis ----
export function wmean(v, w) {
  let num = 0, den = 0;
  v.forEach((x, i) => { if (isFin(x)) { num += x * w[i]; den += w[i]; } });
  return den ? num / den : NaN;
}
const medianFinite = (a) => { const f = finite(a); return f.length ? median(f) : NaN; };

export function perfSummary(runs) {
  const o = runs.filter((r) => !r.indoor);
  return [...new Set(runs.map((r) => r.month))].sort().map((mo) => {
    const m = o.filter((r) => r.month === mo), d = m.map((r) => r.duration_min), temps = finite(m.map((r) => r.temp_f));
    return {
      month: mo, runs: m.length, ef: wmean(m.map((r) => r.ef), d), power_w: wmean(m.map((r) => r.power_w), d),
      stride_m: wmean(m.map((r) => r.stride_m), d), drift: medianFinite(m.map((r) => r.drift_pct)),
      drift_n: finite(m.map((r) => r.drift_pct)).length, temp_f: temps.length ? mean(temps) : NaN,
    };
  });
}

export const TEMP_LABELS = {
  F: [`Under ${TEMP_EDGES_F[0]}\u00b0F`, `${TEMP_EDGES_F[0]}\u2013${TEMP_EDGES_F[1] - 1}\u00b0F`, `${TEMP_EDGES_F[1]}\u2013${TEMP_EDGES_F[2] - 1}\u00b0F`, `${TEMP_EDGES_F[2]}\u00b0F and over`],
  C: (() => { const e = TEMP_EDGES_F.map((f) => fToC(f).toFixed(1)); return [`Under ${e[0]}\u00b0C`, `${e[0]}\u2013${e[1]}\u00b0C`, `${e[1]}\u2013${e[2]}\u00b0C`, `${e[2]}\u00b0C and over`]; })(),
};
// Outdoor runs grouped by start temperature; empty bands are left out.
export function weatherBins(runs, unit = 'F') {
  const o = runs.filter((r) => !r.indoor && isFin(r.temp_f));
  const band = (t) => TEMP_EDGES_F.filter((e) => t >= e).length;
  return TEMP_LABELS[unit].map((bin, k) => {
    const m = o.filter((r) => band(r.temp_f) === k);
    if (!m.length) return null;
    const d = m.map((r) => r.duration_min), hum = finite(m.map((r) => r.humidity));
    return {
      bin, runs: m.length, humidity: hum.length ? mean(hum) : NaN, pace_mi: sum(d) / sumBy(m, (r) => r.mi),
      hr: wmean(m.map((r) => r.hr_avg), d), ef: wmean(m.map((r) => r.ef), d), drift: medianFinite(m.map((r) => r.drift_pct)),
    };
  }).filter(Boolean);
}
// Outdoor runs with temperature, HR and pace; null when there are too few. hr_resid is avg HR minus the HR expected for the speed.
export function weatherRuns(runs, minRuns = 8) {
  const o = runs.filter((r) => !r.indoor && isFin(r.temp_f) && isFin(r.hr_avg) && isFin(r.pace_mi));
  if (o.length < minRuns || new Set(o.map((r) => r.temp_f)).size < 3) return null;
  const fit = lm(o.map((r) => 60 / r.pace_mi), o.map((r) => r.hr_avg));
  return o.map((r, i) => ({ ...r, hr_resid: fit.resid[i] }));
}

export { KM_PER_MI };
