// The meta line and the KPI cards at the top of the report. Takes the context built by buildReport() in ../build-report.js.

import { isFin, rnd, sum, dayNum, esc, fmtDur, f1, r0, yearOf } from '../util.js';
import { distU, paceU, kcalU, hm, md } from './format.js';

export function reportOverview(ctx) {
  const { x, runs, outv, ms, startActual, endActual, latestMonthName, add } = ctx;
  const yr = (d) => String(yearOf(d));
  add('<div class="meta">',
    `<span>Range <b>${md(startActual)}${yr(startActual) !== yr(endActual) ? ', ' + yr(startActual) : ''} \u2013 ${md(endActual)}, ${yr(endActual)}</b></span>`,
    `<span>Runs <b>${runs.length}</b> (${outv.length} outdoor, ${runs.length - outv.length} indoor)</span>`,
    `<span>Export generated <b>${x.exportDate ? `${md(dayNum(x.exportDate.slice(0, 10)))}, ${x.exportDate.slice(0, 4)}` : 'unknown'}</b></span>`,
    `<span>Source: ${esc([...new Set(runs.map((r) => r.source))].join(', '))}</span>`, '</div>');

  const lastMonth = ms[ms.length - 1].month;
  const cm = runs.filter((r) => r.month === lastMonth);
  const cd = cm.filter((r) => isFin(r.mi));   // runs with a recorded distance
  const D = sum(cd.map((r) => r.mi)), Mn = sum(cm.map((r) => r.duration_min));
  const withHr = cm.filter((r) => isFin(r.hr_avg));
  const H = sum(withHr.map((r) => r.hr_avg * r.duration_min)) / sum(withHr.map((r) => r.duration_min));
  const L = cm.reduce((a, r) => (r.mi > a.mi ? r : a), cm[0]);
  const withEnergy = cm.filter((r) => isFin(r.energy_kcal));
  const kcalTotal = sum(withEnergy.map((r) => r.energy_kcal));
  const kp = [
    ['Distance', distU(D, f1), distU(D / cd.length, f1, ' per run')],
    ['Running time', hm(Mn), `${cm.length} runs`],
    ['Avg pace', paceU(sum(cd.map((r) => r.duration_min)) / D), 'distance-weighted'],
    ['Active energy', withEnergy.length ? `${r0(kcalTotal)} kcal` : 'N/A', withEnergy.length ? kcalU(kcalTotal / sum(withEnergy.filter((r) => isFin(r.mi)).map((r) => r.mi)), 'per') : ''],
    ['Avg heart rate', `${rnd(H)} bpm`, 'duration-weighted'],
    ['Longest run', distU(L.mi), `${md(L.date)} \u00b7 ${fmtDur(L.duration_min)}`],
  ];
  add(`<p class="caption">Latest month (${latestMonthName}), all runs. Earlier months are in the tables below.</p>`);
  add('<div class="kpis">', kp.map((k) => `<div class="kpi"><span class="l">${k[0]}</span><span class="v">${k[1]}</span><span class="s">${k[2]}</span></div>`).join(''), '</div>');
}
