// Section 1: month tables, heart-rate zones and charts for all runs. Takes the context built by buildReport() in ../report.js.

import * as M from '../metrics.js';
import { KM_PER_MI, isFin, rnd, sum, mean, weekStart, fmtPace, f1, f2, r0, fmtMonDD } from '../util.js';
import { chart, PAL, dateAxis, dots, paceTicks } from '../charts.js';
import { NO_DELTA, delta, dual, distU, paceU, kcalU, hm } from './format.js';
import { table, transpose, pairCell } from './page.js';

const ZONE_FILL = ['#c9dff3', '#7fb5e8', '#eda100', '#eb6834', '#c2321f'];   // Z1..Z5

export function reportSummary(ctx) {
  const { x, startDay, runs, ms, wk, rg, endActual, zlab, zoneNote, zsec, monthNames, monthPartial, monthFollows, add, h1, h2, closeDiv, fig, figU, figGrid } = ctx;
  h1('1. Summary');
  const segButtons = (group) => add(`<div class="seg" role="group" aria-label="Run type" data-group="${group}">`,
    '<button type="button" data-pane="all">All runs</button><button type="button" data-pane="outdoor">Outdoor</button>',
    '<button type="button" data-pane="indoor">Indoor</button></div>');

  const monthTable = (msx, id, label, mech = true) => {
    add(`<div class="pane" data-group="tables" data-pane="${id}"><p class="pane-title">${label}</p>`);
    const rows = ['Runs', 'Total distance', 'Total running time', 'Active energy burned', dual('Energy per mile', 'Energy per km'),
      'Avg pace', 'Avg HR', 'Max HR', 'Longest run', 'Fastest run by pace', 'Avg cadence', ...(mech ? ['Avg vertical oscillation', 'Avg ground contact time'] : [])];
    const cell = (m, prev, partial) => {
      if (m.runs === 0) return rows.map((_, i) => pairCell(i === 0 ? '0' : '\u2014', NO_DELTA));
      const vals = [m.runs, distU(m.mi), hm(m.minutes),
        isFin(m.kcal) ? `${r0(m.kcal)} kcal` : 'N/A', isFin(m.kcal_per_mi) ? kcalU(m.kcal_per_mi) : 'N/A', paceU(m.pace_mi),
        `${f1(m.hr_weighted)} bpm`, isFin(m.hr_max) ? `${rnd(m.hr_max)} bpm` : 'N/A', distU(m.longest_mi),
        dual(`${fmtPace(m.fastest_pace)}\u00a0/mi, ${f2(m.fastest_mi)}\u00a0mi`, `${fmtPace(m.fastest_pace / KM_PER_MI)}\u00a0/km, ${f2(m.fastest_mi * KM_PER_MI)}\u00a0km`),   // no-break spaces: a narrow cell wraps only after the comma
        `${f1(m.cadence)} spm`,
        ...(mech ? [m.mech_runs ? `${f1(m.vert_osc)} cm` : 'Not recorded', m.mech_runs ? `${rnd(m.gct)} ms` : 'Not recorded'] : [])];
      const dels = rows.map(() => NO_DELTA);
      if (prev) {
        if (!partial) { dels[1] = delta(m.mi, prev.mi); dels[2] = delta(m.minutes, prev.minutes); dels[3] = delta(m.kcal, prev.kcal); }   // totals are not comparable for a part-month
        dels[5] = dual(delta(m.pace_mi, prev.pace_mi, 'abs', 0, 60, ' s'), delta(m.pace_mi, prev.pace_mi, 'abs', 0, 60 / KM_PER_MI, ' s'));
        dels[6] = delta(m.hr_weighted, prev.hr_weighted, 'abs', 1);
        dels[10] = delta(m.cadence, prev.cadence, 'abs', 1);
      }
      return vals.map((v, i) => pairCell(v, dels[i]));
    };
    const shown = msx.map((m, i) => i).filter((i) => msx[i].runs > 0);   // months without a run of this type get no column
    if (shown.length) {
      const cols = shown.map((i) => cell(msx[i], monthFollows[i] ? msx[i - 1] : null, monthPartial[i]));
      add('<div class="tablebox">', table(['Measure', ...shown.map((i) => monthNames[i])], transpose(rows, cols), ['l', ...shown.map(() => 'r')], 'months deltas'), '</div>');
    } else add(`<p>No ${label.toLowerCase()} in this range.</p>`);
    closeDiv();
  };
  h2('By month');
  segButtons('tables');
  add('<p class="caption">\u25b2 / \u25bc = change from the previous month (for pace, \u25bc means faster; pace is in seconds). Totals are not compared for a part-month.</p>');
  monthTable(ms, 'all', 'All runs', false);
  monthTable(M.monthlySummary(runs, 'outdoor'), 'outdoor', 'Outdoor runs');
  monthTable(M.monthlySummary(runs, 'indoor'), 'indoor', 'Indoor runs', false);
  closeDiv();

  // heart-rate zones, all runs
  h2('Heart-rate zones');
  add(`<p class="caption">Time in each zone, all runs. Zones by ${zoneNote}. \u25b2 / \u25bc = change in share from the previous month, in percentage points.</p>`);
  const zm = ms.map((m) => zsec.filter((_, i) => runs[i].month === m.month).reduce((a, z) => a.map((v, k) => v + z[k]), [0, 0, 0, 0, 0]));
  const zt = zm.map(sum);
  const share = zm.map((z, i) => (zt[i] > 0 ? [...z, z[0] + z[1]].map((v) => rnd((100 * v) / zt[i])) : [NaN, NaN, NaN, NaN, NaN, NaN]));
  const zcell = (sec, tot) => (sec > 0 ? `${hm(sec / 60)} (${rnd((100 * sec) / tot)}%)` : '\u2014');
  const zcols = zm.map((z, i) => {
    const vals = [...z.map((s) => zcell(s, zt[i])), zt[i] > 0 ? `${share[i][5]}%` : '\u2014'];
    const dels = vals.map((_, k) => (monthFollows[i] ? delta(share[i][k], share[i - 1][k], 'abs', 0, 1, ' pt') : NO_DELTA));
    return vals.map((v, k) => pairCell(v, dels[k]));
  });
  add('<div class="tablebox">', table(['Zone', ...monthNames], transpose([...zlab, 'Easy share (Z1\u2013Z2)'], zcols), ['l', ...zm.map(() => 'r')], 'months deltas'), '</div>');
  closeDiv();

  h2('Charts');
  const wkLabel = wk.map((w) => fmtMonDD(w.week));
  const wkPartial = wk.map((w) => w.week < startDay || w.week + 6 > endActual);
  segButtons('charts');
  add('<p class="caption">Applies to the next three charts: weekly time in heart-rate zones, pace vs heart rate, and cadence.</p>');
  const monthCols = monthNames.map((_, i) => PAL[i % PAL.length]);
  const chartTypes = [['all', 'All runs', () => true], ['outdoor', 'Outdoor runs', (r) => !r.indoor], ['indoor', 'Indoor runs', (r) => r.indoor]];
  const wkTicks = (() => {   // label every k-th week so the rotated labels do not overlap
    const k = Math.max(1, Math.ceil(wk.length / 20));
    return wk.map((w, i) => ({ v: w.week, label: wkLabel[i] })).filter((_, i) => i % k === 0);
  })();
  for (const [id, label, pick] of chartTypes) {
    const keep = runs.map(pick), sub = runs.filter((_, i) => keep[i]);
    add(`<div class="pane" data-group="charts" data-pane="${id}"><p class="pane-title">${label}</p>`);
    if (!sub.length) add(`<p>No ${label.toLowerCase()} in this range.</p>`);
    else {
      // weekly time in heart-rate zones (Z5 stacked on top)
      const bars = wk.map((w, i) => {
        const tot = [0, 0, 0, 0, 0];
        runs.forEach((r, j) => { if (keep[j] && weekStart(r.date) === w.week) zsec[j].forEach((s, k) => { tot[k] += s / 60; }); });
        let y0 = 0;
        const segs = tot.map((m, k) => { const s = { y0, y1: y0 + m, c: ZONE_FILL[k], a: wkPartial[i] ? 0.45 : 1 }; y0 += m; return s; });
        return { x: w.week, segs };
      });
      fig(chart({
        h: 380, title: 'Weekly time in heart-rate zones', x: { ticks: wkTicks, rotate: true, pad: [0.03, 0.03] },
        y: { title: 'minutes', domain: [0, Math.max(...bars.map((b) => b.segs[4].y1)) * 1.05] },
        legend: zlab.map((l, k) => ({ label: l, color: ZONE_FILL[k], shape: 'square' })), layers: [{ kind: 'bars', bars, width: 4.2 }],
      }), 'Weekly time in heart-rate zones', `Zones by ${zoneNote}. Faded bars are weeks only partly inside the range.`);

      // pace vs heart rate
      const sc = sub.filter((r) => isFin(r.pace_mi) && isFin(r.hr_avg));
      if (sc.length) figU((u) => ({
        title: 'Pace vs heart rate', subtitle: null,
        svg: chart({
          h: 420, title: 'Pace vs heart rate', x: { title: `pace (${u.punit})`, ticks: paceTicks(sc.map((r) => r.pace_mi * u.pace)) }, y: { title: 'avg HR (bpm)' },
          legend: monthNames.map((n, i) => ({ label: n, color: monthCols[i], shape: 'dot' })).filter((_, i) => sc.some((r) => r.month === ms[i].month)),
          layers: [dots(sc, (r) => r.pace_mi * u.pace, (r) => r.hr_avg, (r) => monthCols[ms.findIndex((m) => m.month === r.month)], 2.8)],
        }),
      }));

      // cadence
      const cd = sub.filter((r) => isFin(r.cadence_spm));
      if (cd.length >= 3) fig(chart({
        h: 340, title: 'Cadence', x: dateAxis(cd.map((r) => r.date)), y: { title: 'steps/min' },
        layers: [dots(cd, (r) => r.date, (r) => r.cadence_spm, () => PAL[0], 2.4), { kind: 'trend', pts: cd.map((r) => ({ x: r.date, y: r.cadence_spm })) }],
      }), 'Cadence', `Total steps per minute, ${label.toLowerCase()}, with a straight-line trend.`);
    }
    closeDiv();
  }

  // weekly distance already splits outdoor and indoor, so it sits outside the switch
  figU((u) => {
    const bars = wk.map((w, i) => ({ x: w.week, segs: [
      { y0: 0, y1: w.mi_outdoor * u.dist, c: PAL[0], a: wkPartial[i] ? 0.45 : 1 },
      { y0: w.mi_outdoor * u.dist, y1: w.mi * u.dist, c: PAL[1], a: wkPartial[i] ? 0.45 : 1 }] }));
    const top = Math.max(...wk.map((w) => w.mi * u.dist));
    return {
      title: 'Weekly distance', subtitle: 'Faded bars are weeks only partly inside the range.',
      svg: chart({
        h: 360, title: 'Weekly distance', x: { ticks: wkTicks, rotate: true, pad: [0.03, 0.03] }, y: { title: u.dlab, domain: [0, top * 1.12] },
        legend: [{ label: 'Outdoor', color: PAL[0], shape: 'square' }, { label: 'Indoor', color: PAL[1], shape: 'square' }],
        layers: [{ kind: 'bars', bars, width: 4.2 }, { kind: 'text', items: wk.map((w) => ({ x: w.week, y: w.mi * u.dist, text: f1(w.mi * u.dist) })) }],
      }),
    };
  });

  const rr = rg.filter((r) => isFin(r.route_mi));
  if (rr.length) figU((u) => {
    const routes = [...new Set(rr.map((r) => r.route_mi))].sort((a, b) => a - b);
    const label = (mi) => `~${(mi * u.dist).toFixed(1)} ${u.dunit} route`;
    return {
      title: 'Same routes over time', subtitle: `Pace on recurring outdoor distances (5+ runs within ~${u.near} of each other).`,
      svg: chart({
        h: 400, title: 'Same routes over time', x: dateAxis(rr.map((r) => r.date)), y: { title: `pace (${u.punit})`, ticks: paceTicks(rr.map((r) => r.pace_mi * u.pace)) },
        legend: routes.map((mi, i) => ({ label: label(mi), color: PAL[i % PAL.length], shape: 'line' })),
        layers: [...routes.map((mi, i) => ({ kind: 'line', c: PAL[i % PAL.length], width: 1.9, pts: rr.filter((r) => r.route_mi === mi).map((r) => ({ x: r.date, y: r.pace_mi * u.pace })) })),
          ...routes.map((mi, i) => dots(rr.filter((r) => r.route_mi === mi), (r) => r.date, (r) => r.pace_mi * u.pace, () => PAL[i % PAL.length], 2.4))],
      }),
    };
  });

  // recovery and fitness markers (daily / weekly series from the watch)
  const inRange = (rec, i) => rec.day[i] >= startDay && rec.day[i] <= endActual;
  const series = (type) => { const r = x.records[type], out = []; for (let i = 0; i < r.n; i++) if (inRange(r, i)) out.push({ date: r.day[i], value: r.v[i] }); return out; };
  const hrvWeeks = new Map();
  for (const p of series('HeartRateVariabilitySDNN')) { const w = weekStart(p.date); if (w >= startDay) { const a = hrvWeeks.get(w) || []; a.push(p.value); hrvWeeks.set(w, a); } }
  const panels = [
    ['Resting HR (bpm, daily)', series('RestingHeartRate')],
    ['HRV SDNN (ms, weekly mean)', [...hrvWeeks].sort((a, b) => a[0] - b[0]).map(([date, v]) => ({ date, value: mean(v) }))],
    ['1-min HR recovery (bpm drop, per run)', runs.filter((r) => isFin(r.hrr_1min)).map((r) => ({ date: r.date, value: r.hrr_1min }))],
    ['VO2max estimate (mL/kg/min)', series('VO2Max')],
  ].filter(([, d]) => d.length);
  if (panels.length) figGrid('Recovery and fitness markers', '', panels.map(([name, d]) => ({
    title: name,
    svg: chart({
      w: 360, h: 260, title: name, x: dateAxis(d.map((p) => p.date)), y: {},
      layers: [{ kind: 'line', c: PAL[0], width: 1.7, pts: d.map((p) => ({ x: p.date, y: p.value })) }, dots(d, (p) => p.date, (p) => p.value, () => PAL[0], 1.2)],
    }),
  })));
  closeDiv();
  closeDiv();
}
