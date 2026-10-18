// Outdoor-run performance trends and the temperature effect. Takes the context built by buildReport() in ../build-report.js.

import * as M from '../metrics.js';
import { isFin, rnd, fmtPace, f1, f2, r0, fToC } from '../util.js';
import { chart, rampColors, PAL, dateAxis, dots } from '../charts.js';
import { NO_DELTA, delta, dual, UN, tempU } from './format.js';
import { table, transpose, pairCell } from './page.js';

export function reportPerformance(ctx) {
  const { runs, outv, monthNames, monthFollows, add, h1, h2, closeDiv, bullets, fig, figU, figGrid } = ctx;
  h1('Performance');
  add('<p>This section uses outdoor runs only, so treadmill distance does not blur the comparisons. Read the metrics as trends, not scores: most have no universal target, so compare runs at a similar pace and temperature.</p>');
  bullets([
    '<b>Efficiency</b>: metres per heartbeat; higher is better. Look for a rise at the same pace.',
    '<b>Power</b>: no universal target (it scales with body weight). The goal is the same or lower HR at the same power.',
    '<b>Stride length</b>: no target (it grows with speed and height). The goal is more of it at the same effort, with cadence around 165\u2013180 steps/min.',
    '<b>Cardiac drift</b>: under 5% on an easy run is good, 5\u201310% is common, and above 10% points to heat, fatigue or starting too fast.',
    `<b>Temperature</b>: context only. Heat above roughly ${dual('70\u00b0F', '21\u00b0C')} raises HR and lowers efficiency, so a dip on a hot day is not lost fitness.`,
  ]);

  const pf = M.perfSummary(runs);
  const pu = (v, fmt, unit) => (isFin(v) ? fmt(v) + unit : 'N/A');
  h2('Efficiency, power and drift');
  add('<p class="caption">\u25b2 / \u25bc = change from the previous month (drift in percentage points).</p>');
  const shown = pf.map((m, i) => i).filter((i) => pf[i].runs > 0);   // months without an outdoor run get no column
  const pcols = shown.map((i) => {
    const m = pf[i], pr = monthFollows[i] ? pf[i - 1] : null;
    const vals = [m.runs, pu(m.ef, f2, ' m/beat'), pu(m.power_w, r0, ' W'), pu(m.stride_m, f2, ' m'),
      isFin(m.drift) ? `${f1(m.drift)}% (${m.drift_n} runs)` : 'N/A', tempU(m.temp_f)];
    const dels = vals.map(() => NO_DELTA);
    if (pr) {   // differences of the values as displayed (rounded)
      dels[1] = delta(rnd(m.ef, 2), rnd(pr.ef, 2), 'abs', 2);
      dels[2] = delta(rnd(m.power_w), rnd(pr.power_w), 'abs');
      dels[3] = delta(rnd(m.stride_m, 2), rnd(pr.stride_m, 2), 'abs', 2);
      dels[4] = delta(rnd(m.drift, 1), rnd(pr.drift, 1), 'abs', 1);
      dels[5] = dual(delta(rnd(m.temp_f), rnd(pr.temp_f), 'abs', 0, 1, '\u00b0'), delta(rnd(fToC(m.temp_f)), rnd(fToC(pr.temp_f)), 'abs', 0, 1, '\u00b0'));
    }
    return vals.map((v, k) => pairCell(v, dels[k]));
  });
  add('<div class="tablebox">', table(['Measure', ...shown.map((i) => monthNames[i])], transpose(['Outdoor runs', 'Efficiency', 'Avg running power', 'Avg stride length', 'Median cardiac drift', 'Avg start temperature'], pcols),
    ['l', ...shown.map(() => 'r')], 'months deltas'), '</div>');

  const trendPlot = (title, subtitle, rs, fx, fy, o = {}) => fig(chart({
    h: o.h, title, x: o.x || dateAxis(rs.map(fx)), y: { title: o.ytitle },
    layers: [dots(rs, fx, fy, () => PAL[0], o.size || 2.4), { kind: 'trend', pts: rs.map((r) => ({ x: fx(r), y: fy(r) })) }],
  }), title, subtitle);

  const efRuns = outv.filter((r) => isFin(r.ef));
  if (efRuns.length >= 3) trendPlot('Pace efficiency', 'Metres per heartbeat (speed \u00f7 avg HR), outdoor runs, with a straight-line trend.', efRuns, (r) => r.date, (r) => r.ef, { h: 340, ytitle: 'metres per beat' });

  const pw = [['Avg running power (W)', 'power_w'], ['Avg stride length (m)', 'stride_m']].map(([name, k]) => [name, outv.filter((r) => isFin(r[k])).map((r) => ({ date: r.date, value: r[k] }))]).filter(([, d]) => d.length);
  if (pw.length) figGrid('Running power and stride length', 'Per outdoor run, with straight-line trends.', pw.map(([name, d]) => ({
    title: name,
    svg: chart({ w: 360, h: 300, title: name, x: dateAxis(d.map((p) => p.date)), y: {},
      layers: [dots(d, (p) => p.date, (p) => p.value, () => PAL[0], 2.2), { kind: 'trend', pts: d.map((p) => ({ x: p.date, y: p.value })) }] }),
  })));

  const sc2 = outv.filter((r) => isFin(r.stride_m) && isFin(r.cadence_spm));
  if (sc2.length >= 3) figU((u) => {
    const step = 0.5;   // 30-second pace bands
    const pace = sc2.map((r) => r.pace_mi * u.pace);
    const lo = Math.floor(Math.min(...pace) / step), hi = Math.floor(Math.max(...pace) / step);
    const bands = Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) * step), colors = rampColors(bands.length);
    return {
      title: 'Stride length vs cadence', subtitle: null,
      svg: chart({
        h: 380, title: 'Stride length vs cadence', x: { title: 'cadence (steps/min)' }, y: { title: 'stride length (m)' },
        legendTitle: `pace (${u.punit})`,
        legend: bands.map((b, i) => ({ label: `${fmtPace(b)}\u2013${fmtPace(b + step)}`, color: colors[i], shape: 'dot' })),
        layers: [dots(sc2, (r) => r.cadence_spm, (r) => r.stride_m, (r) => colors[Math.floor((r.pace_mi * u.pace) / step) - lo], 3)],
      }),
    };
  });

  const dr = outv.filter((r) => isFin(r.drift_pct));
  if (dr.length) {
    const dlo = Math.floor(Math.min(...dr.map((r) => r.duration_min)) / 10) * 10, dhi = Math.floor(Math.max(...dr.map((r) => r.duration_min)) / 10) * 10;
    const dbands = []; for (let b = dlo; b <= dhi; b += 10) dbands.push(b);
    const colors = rampColors(dbands.length);
    fig(chart({
      h: 340, title: 'Cardiac drift per run', x: dateAxis(dr.map((r) => r.date)), y: { title: 'drift (%)' },
      legendTitle: 'duration (min)',
      legend: dbands.map((b, i) => ({ label: `${b}\u2013${b + 10}`, color: colors[i], shape: 'dot' })),
      layers: [{ kind: 'hline', y: 0 }, { kind: 'hline', y: 5, dash: true }, dots(dr, (r) => r.date, (r) => r.drift_pct, (r) => colors[(Math.floor(r.duration_min / 10) * 10 - dlo) / 10], 3)],
    }), 'Cardiac drift per run', 'Positive = HR rose relative to speed in the 2nd half. Dashed line at 5%.');
  } else bullets(['No outdoor runs long enough with heart-rate and distance data in both halves.']);
  closeDiv();

  h2('Temperature and performance');
  const wo = M.weatherRuns(runs);
  for (const u of UN) {   // the temperature bins and the pace column differ by unit system
    const wb = M.weatherBins(runs, u.dunit === 'mi' ? 'F' : 'C');
    if (!wb.length) continue;
    add(`<p class="caption ${u.cls}">\u25b2 / \u25bc = change from the previous (cooler) band (pace in seconds, \u25bc = faster; drift in percentage points).</p>`);
    const wcols = wb.map((w, k) => {
      const pr = k > 0 ? wb[k - 1] : null;
      const vals = [w.runs, `${rnd(w.humidity)}%`, `${fmtPace(w.pace_mi * u.pace)} /${u.dunit}`, `${f1(w.hr)} bpm`, `${f2(w.ef)} m/beat`, isFin(w.drift) ? `${f1(w.drift)}%` : 'N/A'];
      const dels = vals.map(() => NO_DELTA);
      if (pr) {
        const dd = (a, b, kind, digits, scale, suffix) => delta(a, b, kind, digits, scale, suffix, 'previous band');
        dels[1] = dd(rnd(w.humidity), rnd(pr.humidity), 'abs', 0, 1, '%');
        dels[2] = dd(w.pace_mi, pr.pace_mi, 'abs', 0, 60 * u.pace, ' s');
        dels[3] = dd(rnd(w.hr, 1), rnd(pr.hr, 1), 'abs', 1, 1, '');
        dels[4] = dd(rnd(w.ef, 2), rnd(pr.ef, 2), 'abs', 2, 1, '');
        dels[5] = dd(rnd(w.drift, 1), rnd(pr.drift, 1), 'abs', 1, 1, '');
      }
      return vals.map((v, i) => pairCell(v, dels[i]));
    });
    add(`<div class="tablebox ${u.cls}">`, table(['Measure', ...wb.map((w) => w.bin)], transpose(['Runs', 'Avg humidity', 'Avg pace', 'Avg HR', 'Efficiency', 'Median drift'], wcols), ['l', ...wb.map(() => 'r')], 'months deltas'), '</div>');
  }
  if (!wo) bullets(['Too few outdoor runs with weather data to estimate an effect.']);
  else for (const u of UN) {
    figGrid('Temperature and performance', 'Outdoor runs. HR vs expected = avg HR minus the HR a straight-line fit predicts for that speed.',
      [['Efficiency (m per beat)', 'ef'], ['HR vs expected for the pace (bpm)', 'hr_resid']].map(([name, k]) => ({
        title: name,
        svg: chart({ w: 360, h: 320, title: name, x: { title: `temperature at start (${u.tunit})` }, y: {},
          layers: [dots(wo, (r) => u.temp(r.temp_f), (r) => r[k], () => PAL[0], 2.4), { kind: 'trend', pts: wo.map((r) => ({ x: u.temp(r.temp_f), y: r[k] })) }] }),
      })), u.cls);
  }
  closeDiv();
  closeDiv();
}
