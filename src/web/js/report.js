// Build the running report as one self-contained HTML string. A port of cli/report/build.R: same sections,
// tables and numbers; charts are inline SVG built by charts.js. The sections live in report/.

import { isFin, rnd, finite, dayNum, monLong, dayOfMonth, monthLast } from './util.js';
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
  const monLabel = (m) => {
    const d1 = monthFirstDay(m), last = monthLast(d1), lo = Math.max(d1, startDay), hi = Math.min(last, endActual);
    return lo === d1 && hi === last ? monLong(d1) : `${md(lo)}\u2013${dayOfMonth(hi)}`;
  };
  const monthNames = ms.map((m) => monLabel(m.month));
  const monthPartial = ms.map((m) => { const d1 = monthFirstDay(m.month); return d1 < startDay || endActual < monthLast(d1); });

  const page = newPage(opts.shared);
  const ctx = { x, startDay, endDay, opts, runs, outv, ms, wk, rg, startActual, endActual, maxHr, maxHrFromAge, restHr, restHrFound,
    zlab, zoneNote, zsec, monthNames, monthPartial, ...page };

  reportOverview(ctx);
  reportSummary(ctx);
  reportPerformance(ctx);
  reportReference(ctx);
  return page.render();
}
