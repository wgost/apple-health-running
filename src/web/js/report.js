// Build the running report as one self-contained HTML string. A port of cli/report/build.R: same sections,
// tables and numbers; charts are inline SVG built by charts.js. The sections live in report/.

import { isFin, rnd, finite, dayNum, monLong, monShort, dayOfMonth, monthLast, yearOf } from './util.js';
import * as M from './metrics.js';
import { md } from './report/format.js';
import { newPage } from './report/page.js';
import { reportOverview } from './report/overview.js';
import { reportSummary } from './report/summary.js';
import { reportPerformance } from './report/performance.js';
import { reportReference } from './report/reference.js';

/**
 * @param x          result of readHealthExport()
 * @param startDay   first day of the report range, endDay: last day (normally today); both as day numbers
 * @param opts       { shared: { template, themeInit, css, pageJs } (the files in shared/ as strings),
 *                     sourceName: string, generated: string }
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

  const monthFirstDay = (m) => dayNum(m + '-01');
  const withYear = new Set(ms.map((m) => monShort(monthFirstDay(m.month)))).size < ms.length;   // a month name repeats after 12 months: add the year
  const monLabel = (m, abbreviate = true) => {
    const d1 = monthFirstDay(m), last = monthLast(d1), lo = Math.max(d1, startDay), hi = Math.min(last, endActual);
    return lo === d1 && hi === last ? (abbreviate ? `${monShort(d1)}${withYear ? ' ' + String(yearOf(d1)).slice(2) : ''}` : monLong(d1)) : `${md(lo)}\u2013${dayOfMonth(hi)}`;
  };
  const monthNames = ms.map((m) => monLabel(m.month));   // table headers and chart legends: "Oct"
  const latestMonthName = monLabel(ms[ms.length - 1].month, false);   // the KPI caption: "October"
  const monthNo = (m) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
  const monthFollows = ms.map((m, i) => i > 0 && monthNo(m.month) - monthNo(ms[i - 1].month) === 1);   // the previous column is the calendar-previous month, so a change can be shown
  const monthPartial = ms.map((m) => { const d1 = monthFirstDay(m.month); return d1 < startDay || endActual < monthLast(d1); });

  const page = newPage(opts.shared);
  const ctx = { x, startDay, opts, runs, outv, ms, wk, rg, startActual, endActual, maxHr, maxHrFromAge, restHr, restHrFound,
    zlab, zoneNote, zsec, monthNames, latestMonthName, monthPartial, monthFollows, ...page };

  reportOverview(ctx);
  reportSummary(ctx);
  reportPerformance(ctx);
  reportReference(ctx);
  return page.render();
}
