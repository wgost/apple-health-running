// Runs the whole job off the main thread: stream the zip, build the report, send back the HTML.
import { readHealthExport } from './parse.js';
import { buildReport } from './report.js';
import { dayNum, dayStr, reportStart } from './util.js';

self.onmessage = async (e) => {
  const { file, months, today } = e.data;
  try {
    const end = dayNum(today), start = reportStart(months, end);
    const x = await readHealthExport(file, { start: dayStr(start), end: today },
      (p) => self.postMessage({ type: 'progress', ...p, bytes: Math.round(p.fraction * file.size) }));
    self.postMessage({ type: 'status', text: 'Building the report' });
    const css = await (await fetch(new URL('../report.css', import.meta.url))).text();
    const html = buildReport(x, start, end, { css, sourceName: file.name, generated: today });
    self.postMessage({ type: 'done', html, name: `running_report_${dayStr(start)}_${today}.html`, workouts: x.workouts.length });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
