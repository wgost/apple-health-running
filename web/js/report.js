// Build the running report as one self-contained HTML string. A port of src/build_report.R: same sections,
// tables and numbers; charts are inline SVG (see charts.js) instead of PNG images.

import {
  KM_PER_MI, isFin, rnd, sum, mean, median, finite, dayNum, dayStr, monthKey, weekStart, esc, slug, fmtPace, fmtDur, fmtHm, f1, f2, r0, fToC,
  monLong, monShort, dayOfMonth, yearOf, fmtMd, fmtMonDD, monthLast,
} from './util.js';
import * as M from './metrics.js';
import { chart, numTicks, dateTicks, rampColors, PAL, MID } from './charts.js';
import { THEME_INIT, TOGGLE_JS, TABS_JS, LIGHTBOX_JS } from './page_scripts.js';

const NO_DELTA = '<span class="d"></span>';
const ZONE_FILL = ['#c9dff3', '#7fb5e8', '#eda100', '#eb6834', '#c2321f'];   // Z1..Z5
const SIZE_PX = 1.98;   // ggplot point size -> radius in a 100 px/in chart

/**
 * @param x          result of readHealthExport()
 * @param startDay   first day of the report range, endDay: last day (normally today); both as day numbers
 * @param opts       { css: string, sourceName: string, generated: string }
 */
export function buildReport(x, startDay, endDay, opts) {
  const runs = M.buildRuns(x, startDay, endDay);
  const outv = runs.filter((r) => !r.indoor);
  const ms = M.monthlySummary(runs);
  const wk = M.weeklyLoad(runs, M.priorRuns(x, startDay));
  const rg = M.routeGroups(runs);
  const startActual = Math.min(...runs.map((r) => r.date)), endActual = Math.max(...runs.map((r) => r.date));
  const hrSeen = Math.max(...finite(runs.map((r) => r.hr_max)));
  let maxHr = M.estimateMaxHr(x.birthDate, endActual);
  const maxHrFromAge = isFin(maxHr);
  if (!maxHrFromAge) maxHr = hrSeen;
  let restHr = M.estimateRestHr(x, endActual);
  const restHrFound = isFin(restHr);
  if (!restHrFound) restHr = 0;
  const zlab = M.zoneLabels(maxHr, restHr);
  const zoneNote = restHrFound ? `heart-rate reserve (max ${rnd(maxHr)}, resting ${rnd(restHr)} bpm)` : `share of max HR (${rnd(maxHr)} bpm)`;
  const zsec = M.zoneSeconds(runs, maxHr, restHr);

  const md = (d) => fmtMd(d);
  const monthFirstDay = (m) => dayNum(m + '-01');
  const monLabel = (m) => {
    const d1 = monthFirstDay(m), last = monthLast(d1), lo = Math.max(d1, startDay), hi = Math.min(last, endActual);
    return lo === d1 && hi === last ? monLong(d1) : `${md(lo)}\u2013${dayOfMonth(hi)}`;
  };
  const monthNames = ms.map((m) => monLabel(m.month));
  const monthPartial = ms.map((m) => { const d1 = monthFirstDay(m.month); return d1 < startDay || endActual < monthLast(d1); });
  const hm = (minutes) => fmtHm(minutes).replace(/^</, '&lt;');

  // ---- units: US (default) and metric. Text is written twice (u-us / u-si spans); charts are drawn twice. ----
  const dual = (us, si) => (us === si ? us : `<span class="u-us">${us}</span><span class="u-si">${si}</span>`);
  const UN = [
    { cls: 'u-us', dist: 1, pace: 1, dlab: 'miles', dunit: 'mi', punit: 'min/mi', tunit: '\u00b0F', near: '0.6 mi', temp: (f) => f },
    { cls: 'u-si', dist: KM_PER_MI, pace: 1 / KM_PER_MI, dlab: 'kilometres', dunit: 'km', punit: 'min/km', tunit: '\u00b0C', near: '1 km', temp: fToC },
  ];
  const distU = (mi, f = f2, suffix = '') => dual(`${f(mi)} mi${suffix}`, `${f(mi * KM_PER_MI)} km${suffix}`);
  const paceU = (p) => dual(`${fmtPace(p)} /mi`, `${fmtPace(p / KM_PER_MI)} /km`);
  const kcalU = (perMi, per = '') => dual(`${r0(perMi)} kcal${per ? ' per mi' : ''}`, `${r0(perMi / KM_PER_MI)} kcal${per ? ' per km' : ''}`);
  const tempU = (f) => (isFin(f) ? dual(`${r0(f)}\u00b0F`, `${r0(fToC(f))}\u00b0C`) : 'N/A');

  const table = (headers, rows, align, cls = '') => {
    const al = { l: 'left', r: 'right', c: 'center' };
    const th = headers.map((h, i) => `<th style="text-align:${al[align[i]]}">${h}</th>`).join('');
    const body = rows.map((r) => `<tr>${r.map((c, i) => `<td style="text-align:${al[align[i]]}">${c}</td>`).join('')}</tr>`).join('');
    return `<table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  };
  // a table with a "Measure" column and one column per month (or band): cells are [value, delta] pairs
  const transpose = (labels, cols) => labels.map((l, i) => [l, ...cols.map((c) => c[i])]);
  const pairCell = (v, d) => `<span class="v">${v}</span>${d}`;

  const parts = [], toc = [];
  const add = (...s) => parts.push(s.join(''));
  const h1 = (t) => { const id = slug(t); toc.push({ id, text: t }); add(`<div id="${id}" class="section level1"><h1>${esc(t)}</h1>`); };
  const h2 = (t) => add(`<div id="${slug(t)}" class="section level2"><h2>${esc(t)}</h2>`);
  const closeDiv = () => add('</div>');
  const bullets = (items) => add('<ul>', items.map((i) => `<li>${i}</li>`).join('\n'), '</ul>');

  // chart boxes: HTML title and subtitle above an SVG
  const fig = (svg, title, subtitle, cls = null, panel = false) => {
    if (!svg) return;
    add(`<div class="chart${panel ? ' panel' : ''}${cls ? ' ' + cls : ''}">`, title ? `<p class="ctitle">${esc(title)}</p>` : '',
      subtitle ? `<p class="csub">${esc(subtitle)}</p>` : '', `<p class="fig">${svg}</p></div>`);
  };
  const figU = (build) => { for (const u of UN) { const c = build(u); if (c) fig(c.svg, c.title, c.subtitle, u.cls); } };
  const figGrid = (title, subtitle, plots, cls = null) => {
    add(`<div class="figgrid${cls ? ' ' + cls : ''}"><p class="figtitle"><b>${esc(title)}</b>`, subtitle ? `<br><span>${esc(subtitle)}</span>` : '', '</p>');
    for (const p of plots) fig(p.svg, p.title, null, null, true);
    closeDiv();
  };
  const dateAxis = (days, extra = {}) => ({ ticks: dateTicks(Math.min(...days), Math.max(...days)), ...extra });
  const dots = (rs, fx, fy, color, size) => ({ kind: 'points', r: size * SIZE_PX, pts: rs.map((r) => ({ x: fx(r), y: fy(r), c: color(r) })) });
  const paceTicks = (vals) => numTicks(Math.min(...vals), Math.max(...vals), 5, fmtPace);

  // ---- meta + KPIs ----
  const yr = (d) => String(yearOf(d));
  add('<div class="meta">',
    `<span>Range <b>${md(startActual)}${yr(startActual) !== yr(endActual) ? ', ' + yr(startActual) : ''} \u2013 ${md(endActual)}, ${yr(endActual)}</b></span>`,
    `<span>Runs <b>${runs.length}</b> (${outv.length} outdoor, ${runs.length - outv.length} indoor)</span>`,
    `<span>Export generated <b>${x.exportDate ? `${md(dayNum(x.exportDate.slice(0, 10)))}, ${x.exportDate.slice(0, 4)}` : 'unknown'}</b></span>`,
    `<span>Source: ${esc([...new Set(runs.map((r) => r.source))].join(', '))}</span>`, '</div>');

  const lastMonth = ms[ms.length - 1].month;
  const cm = runs.filter((r) => r.month === lastMonth);
  const D = sum(cm.map((r) => r.mi)), Mn = sum(cm.map((r) => r.duration_min));
  const withHr = cm.filter((r) => isFin(r.hr_avg));
  const H = sum(withHr.map((r) => r.hr_avg * r.duration_min)) / sum(withHr.map((r) => r.duration_min));
  const L = cm.reduce((a, r) => (r.mi > a.mi ? r : a), cm[0]);
  const withEnergy = cm.filter((r) => isFin(r.energy_kcal));
  const kcalTotal = sum(withEnergy.map((r) => r.energy_kcal));
  const kp = [
    ['Distance', distU(D, f1), distU(D / cm.length, f1, ' per run')],
    ['Running time', hm(Mn), `${cm.length} runs`],
    ['Avg pace', paceU(Mn / D), 'distance-weighted'],
    ['Active energy', withEnergy.length ? `${r0(kcalTotal)} kcal` : 'N/A', withEnergy.length ? kcalU(kcalTotal / sum(withEnergy.map((r) => r.mi)), 'per') : ''],
    ['Avg heart rate', `${rnd(H)} bpm`, 'duration-weighted'],
    ['Longest run', distU(L.mi), `${md(L.date)} \u00b7 ${fmtDur(L.duration_min)}`],
  ];
  add(`<p class="caption">Latest month (${monthNames[monthNames.length - 1]}), all runs. Earlier months are in the tables below.</p>`);
  add('<div class="kpis">', kp.map((k) => `<div class="kpi"><span class="l">${k[0]}</span><span class="v">${k[1]}</span><span class="s">${k[2]}</span></div>`).join(''), '</div>');

  // ---- 1. Summary ----
  h1('1. Summary');
  const segButtons = (group) => add(`<div class="seg" role="group" aria-label="Run type" data-group="${group}">`,
    '<button type="button" data-pane="all">All runs</button><button type="button" data-pane="outdoor">Outdoor</button>',
    '<button type="button" data-pane="indoor">Indoor</button></div>');

  // change from the previous month, as a small up/down note after the value
  const delta = (nw, old, kind = 'pct', digits = 0, scale = 1, suffix = '', vs = 'previous month') => {
    if (!isFin(nw) || !isFin(old)) return NO_DELTA;
    const d = rnd(kind === 'pct' ? 100 * (nw / old - 1) : (nw - old) * scale, digits);
    if (d === 0) return NO_DELTA;
    return `<span class="d" title="vs ${vs}">${d > 0 ? '\u25b2' : '\u25bc'} ${Math.abs(d).toFixed(digits)}${kind === 'pct' ? '%' : suffix}</span>`;
  };

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
    const cols = msx.map((m, i) => cell(m, i > 0 ? msx[i - 1] : null, monthPartial[i]));
    add('<div class="tablebox">', table(['Measure', ...monthNames], transpose(rows, cols), ['l', ...msx.map(() => 'r')], 'months deltas'), '</div>');
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
    const dels = vals.map((_, k) => (i > 0 ? delta(share[i][k], share[i - 1][k], 'abs', 0, 1, ' pt') : NO_DELTA));
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
          legend: monthNames.map((n, i) => ({ label: n, color: monthCols[i], shape: 'dot' })),
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

  // ---- 2. Performance (outdoor runs) ----
  h1('2. Performance');
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
  const pcols = pf.map((m, i) => {
    const pr = i > 0 ? pf[i - 1] : null;
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
  add('<div class="tablebox">', table(['Measure', ...monthNames], transpose(['Outdoor runs', 'Efficiency', 'Avg running power', 'Avg stride length', 'Median cardiac drift', 'Avg start temperature'], pcols),
    ['l', ...pf.map(() => 'r')], 'months deltas'), '</div>');

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

  // ---- 3. Reference: how it's calculated, data checks ----
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

  // ---- page ----
  const tocHtml = `<ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text.replace(/^[0-9]+\.\s*/, ''))}</a></li>`).join('')}</ul>`;
  return `<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Running Log</title>\n${THEME_INIT}\n` +
    `<style>\n${opts.css}\n</style>\n</head>\n<body>\n` +
    `<header id="topbar"><nav>${tocHtml}</nav><div class="tools"><button id="theme-toggle" type="button" aria-label="Switch between dark and light mode" title="Dark / light"></button>` +
    `<button id="units-toggle" type="button" aria-label="Switch between US units (miles, \u00b0F) and metric units (km, \u00b0C)" title="US / metric units"></button></div></header>\n${TOGGLE_JS}\n` +
    `<main>\n<h1 class="title">Running Log</h1>\n${parts.join('\n')}\n</main>\n${TABS_JS}\n${LIGHTBOX_JS}\n</body>\n</html>\n`;
}
