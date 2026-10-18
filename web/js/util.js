// Small shared helpers: numbers, dates and text formatting. Mirrors the R helpers in src/metrics.R and src/build_report.R.

export const KM_PER_MI = 1.609344;
export const MI_PER_KM = 1 / KM_PER_MI;
export const isFin = Number.isFinite;

// R's round(): halves go to the even neighbour (183.5 -> 184, 182.5 -> 182).
export function rnd(x, digits = 0) {
  if (!isFin(x)) return x;
  const p = 10 ** digits, y = x * p, f = Math.floor(y);
  const r = Math.abs(y - f - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return r / p;
}

export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export const finite = (a) => a.filter(isFin);

// ---- dates: a day is an integer count of days since 1970-01-01; 'YYYY-MM-DD' strings are the interchange form ----
export const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
export const dayStr = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const monthKey = (n) => dayStr(n).slice(0, 7);
export const weekStart = (n) => n - ((n + 3) % 7);   // Monday; 1970-01-01 was a Thursday
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monShort = (n) => MON[new Date(n * 86400000).getUTCMonth()];
export const monLong = (n) => MONTH[new Date(n * 86400000).getUTCMonth()];
export const dayOfMonth = (n) => new Date(n * 86400000).getUTCDate();
export const yearOf = (n) => new Date(n * 86400000).getUTCFullYear();
export const fmtMonDD = (n) => `${monShort(n)} ${String(dayOfMonth(n)).padStart(2, '0')}`;   // "Aug 03"
export const fmtMd = (n) => `${monShort(n)} ${dayOfMonth(n)}`;                                  // "Aug 3"
export const addMonths = (n, k) => { const d = new Date(n * 86400000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, d.getUTCDate()) / 86400000); };
export const monthFirst = (n) => { const d = new Date(n * 86400000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86400000); };
export const monthLast = (n) => addMonths(monthFirst(n), 1) - 1;
// First day of the earliest month in a report of `months` calendar months ending with the current one.
export const reportStart = (months, today) => addMonths(monthFirst(today), -(months - 1));

// Apple timestamps look like "2026-10-16 06:38:41 -0400"; returns seconds since the epoch (UTC).
export function parseHkTime(s) {
  if (!s) return NaN;
  const c = (i) => s.charCodeAt(i) - 48;
  const secs = Date.UTC(c(0) * 1000 + c(1) * 100 + c(2) * 10 + c(3), c(5) * 10 + c(6) - 1, c(8) * 10 + c(9), c(11) * 10 + c(12), c(14) * 10 + c(15), c(17) * 10 + c(18)) / 1000;
  if (s.length < 25) return secs;
  const off = (c(21) * 10 + c(22)) * 3600 + (c(23) * 10 + c(24)) * 60;
  return s[20] === '-' ? secs + off : secs - off;
}

// ---- text ----
export function fmtPace(minPerUnit) {
  if (!isFin(minPerUnit)) return 'NA';
  const tot = Math.round(minPerUnit * 60);
  return `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`;
}
export function fmtDur(minutes) {
  const tot = Math.round(minutes * 60), h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), s = tot % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtHm(minutes) {   // "5 h 37 m", "31 m", or "<1 m" for a few seconds
  const t = Math.round(minutes);
  if (t === 0 && minutes > 0) return '<1 m';
  return t < 60 ? `${t} m` : `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')} m`;
}
export const f1 = (v) => (isFin(v) ? v.toFixed(1) : 'N/A');
export const f2 = (v) => (isFin(v) ? v.toFixed(2) : 'N/A');
export const r0 = (v) => Math.round(rnd(v)).toLocaleString('en-US');
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(?<=\w)'/g, '\u2019');
export const slug = (s) => s.replace(/^[0-9]+\.\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fToC = (f) => ((f - 32) * 5) / 9;

// ---- statistics ----
// Ordinary least squares y ~ x; returns slope, intercept and residuals.
export function lm(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const slope = sxx ? sxy / sxx : 0, intercept = my - slope * mx;
  return { slope, intercept, resid: x.map((xi, i) => y[i] - (intercept + slope * xi)) };
}
// Complete-linkage clustering of 1-D values, cut at height h (like cutree(hclust(dist(v), "complete"), h = h)).
export function clusterComplete(values, h) {
  let groups = values.map((_, i) => [i]);
  for (;;) {
    let best = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      let d = 0;
      for (const a of groups[i]) for (const b of groups[j]) d = Math.max(d, Math.abs(values[a] - values[b]));
      if (d < best) { best = d; bi = i; bj = j; }
    }
    if (bi < 0 || best > h) break;
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
  }
  return groups;
}
