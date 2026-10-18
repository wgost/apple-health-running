// Tiny SVG chart engine (no dependencies). Charts keep the proportions of the R/ggplot figures: a 7.2 in wide
// chart is a 720 unit wide viewBox with ~12 unit axis text, so text scales with the chart on phones. Colours work
// on the dark and the light page (mid-grey text, faint grid).

import { esc, lm, isFin, monShort, yearOf, fmtMonDD, monthFirst, addMonths, fmtPace } from './util.js';

export const PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
export const RAMP = ['#d7301f', '#f28e2b', '#d4b000', '#1baf7a', '#2a78d6', '#6250d6'];
export const MID = '#818994';
const GRID = '#8a929c', TREND = '#9aa3ad';
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

// n colours interpolated along a ramp (like colorRampPalette)
export function rampColors(n, ramp = RAMP) {
  const rgb = ramp.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : (k / (n - 1)) * (rgb.length - 1), i = Math.min(Math.floor(t), rgb.length - 2), f = t - i;
    return '#' + [0, 1, 2].map((c) => Math.round(rgb[i][c] + (rgb[i + 1][c] - rgb[i][c]) * f).toString(16).padStart(2, '0')).join('');
  });
}

// ---- ticks ----
export function niceTicks(lo, hi, target = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
const tickLabel = (ticks) => {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1, dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return (v) => v.toFixed(Math.min(dec, 4));
};
export function numTicks(lo, hi, target = 5, label) {
  const t = niceTicks(lo, hi, target), f = label || tickLabel(t);
  return t.map((v) => ({ v, label: f(v) }));
}
// Date ticks: the 1st and 15th of each month for short ranges, else the 1st of every 1-12 months.
export function dateTicks(lo, hi) {
  const out = [];
  if (hi - lo <= 110) {
    for (let m = monthFirst(lo); m <= hi; m = addMonths(m, 1)) for (const d of [m, m + 14]) if (d >= lo && d <= hi) out.push({ v: d, label: fmtMonDD(d) });
  } else {
    const months = (hi - lo) / 30.4, step = months <= 8 ? 1 : months <= 16 ? 2 : months <= 30 ? 3 : months <= 60 ? 6 : 12;
    const multiYear = yearOf(lo) !== yearOf(hi);
    for (let m = monthFirst(lo); m <= hi; m = addMonths(m, step)) if (m >= lo) out.push({ v: m, label: multiYear ? `${monShort(m)} ${String(yearOf(m)).slice(2)}` : monShort(m) });
  }
  return out;
}

// ---- drawing ----
const num = (v) => (Math.round(v * 100) / 100).toString();
const textW = (s, px) => s.length * px * 0.56;

/**
 * spec: { w, h, title, x: {ticks, title, domain, rotate, pad}, y: {ticks, title, domain, pad},
 *         legend: [{label, color, shape: 'dot'|'square'|'line'}], layers: [...] }
 * layers: {kind:'points', pts:[{x,y,c,a}], r} | {kind:'line', pts, c, width, dash} | {kind:'bars', bars:[{x, segs:[{y0,y1,c,a}]}], width}
 *         {kind:'hline', y, dash} | {kind:'trend', pts, c} | {kind:'text', items:[{x,y,text}]}
 */
export function chart(spec) {
  const { w = 720, h, x, y, legend = [], layers } = spec;
  const AX = 12, TT = 14;   // axis text and title sizes
  const xs = [], ys = [];
  for (const L of layers) {
    if (L.kind === 'points' || L.kind === 'line' || L.kind === 'trend') for (const p of L.pts) { xs.push(p.x); ys.push(p.y); }
    else if (L.kind === 'bars') for (const b of L.bars) { xs.push(b.x - L.width / 2, b.x + L.width / 2); ys.push(0, ...b.segs.map((s) => s.y1)); }
    else if (L.kind === 'hline') ys.push(L.y);
    else if (L.kind === 'text') for (const t of L.items) { xs.push(t.x); ys.push(t.y); }
  }
  const dom = (axis, vals, defPad) => {
    let [lo, hi] = axis.domain || [Math.min(...vals), Math.max(...vals)];
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = axis.pad ?? defPad;
    return axis.domain ? [lo, hi] : [lo - (hi - lo) * pad[0], hi + (hi - lo) * pad[1]];
  };
  const xd = dom(x, xs, [0.05, 0.05]), yd = dom(y, ys, [0.05, 0.05]);
  const yTicks = (y.ticks || numTicks(yd[0], yd[1])).filter((t) => t.v >= yd[0] - 1e-9 && t.v <= yd[1] + 1e-9);
  let xTicks = (x.ticks || numTicks(xd[0], xd[1])).filter((t) => t.v >= xd[0] - 1e-9 && t.v <= xd[1] + 1e-9);

  const left = Math.max(...yTicks.map((t) => textW(t.label, AX)), 0) + (y.title ? 24 : 8) + 8, right = 12;
  const pw = w - left - right;
  if (xTicks.length > 1) {   // drop ticks whose labels would overlap
    const gap = x.rotate ? 15 : Math.max(...xTicks.map((t) => textW(t.label, AX))) + 14;
    const px = (v) => ((v - xd[0]) / (xd[1] - xd[0])) * pw;
    const kept = [xTicks[0]];
    for (const t of xTicks.slice(1)) if (px(t.v) - px(kept[kept.length - 1].v) >= gap) kept.push(t);
    xTicks = kept;
  }
  const xLab = xTicks.length ? (x.rotate ? Math.max(...xTicks.map((t) => textW(t.label, AX))) * 0.72 + 8 : AX + 10) : 0;
  const bottom = xLab + (x.title ? TT + 8 : 0) + 6;

  // legend rows (wrapped to the plot width)
  const rows = [[]];
  let cx = 0;
  for (const it of legend) {
    const iw = 16 + textW(it.label, AX) + 14;
    if (cx + iw > pw && rows[rows.length - 1].length) { rows.push([]); cx = 0; }
    rows[rows.length - 1].push({ ...it, x: cx }); cx += iw;
  }
  const legendH = legend.length ? rows.length * 18 + 8 : 0;
  const top = 6 + legendH, ph = h - top - bottom;
  const sx = (v) => left + ((v - xd[0]) / (xd[1] - xd[0])) * pw, sy = (v) => top + ph - ((v - yd[0]) / (yd[1] - yd[0])) * ph;

  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(spec.title || '')}" font-family='${FONT}'>`];
  rows.forEach((row, ri) => row.forEach((it) => {
    const lx = left + it.x, ly = 12 + ri * 18;
    if (it.shape === 'line') o.push(`<line x1="${num(lx)}" x2="${num(lx + 12)}" y1="${ly}" y2="${ly}" stroke="${it.color}" stroke-width="1.6"/><circle cx="${num(lx + 6)}" cy="${ly}" r="3" fill="${it.color}"/>`);
    else if (it.shape === 'square') o.push(`<rect x="${num(lx)}" y="${ly - 6}" width="12" height="12" fill="${it.color}"/>`);
    else o.push(`<circle cx="${num(lx + 6)}" cy="${ly}" r="4" fill="${it.color}"/>`);
    o.push(`<text x="${num(lx + 16)}" y="${ly + 4}" font-size="${AX}" fill="${MID}">${esc(it.label)}</text>`);
  }));
  for (const t of yTicks) {
    o.push(`<line x1="${left}" x2="${num(left + pw)}" y1="${num(sy(t.v))}" y2="${num(sy(t.v))}" stroke="${GRID}" stroke-opacity=".2"/>`);
    o.push(`<text x="${left - 6}" y="${num(sy(t.v) + 4)}" text-anchor="end" font-size="${AX}" fill="${MID}">${esc(t.label)}</text>`);
  }
  for (const t of xTicks) {
    const px = sx(t.v), py = top + ph + AX + 6;
    o.push(x.rotate
      ? `<text x="${num(px)}" y="${num(py - 4)}" text-anchor="end" font-size="${AX}" fill="${MID}" transform="rotate(-45 ${num(px)} ${num(py - 4)})">${esc(t.label)}</text>`
      : `<text x="${num(px)}" y="${num(py)}" text-anchor="middle" font-size="${AX}" fill="${MID}">${esc(t.label)}</text>`);
  }
  if (x.title) o.push(`<text x="${num(left + pw / 2)}" y="${h - 6}" text-anchor="middle" font-size="${TT}" fill="${MID}">${esc(x.title)}</text>`);
  if (y.title) o.push(`<text transform="translate(14 ${num(top + ph / 2)}) rotate(-90)" text-anchor="middle" font-size="${TT}" fill="${MID}">${esc(y.title)}</text>`);

  for (const L of layers) {
    if (L.kind === 'hline') o.push(`<line x1="${left}" x2="${num(left + pw)}" y1="${num(sy(L.y))}" y2="${num(sy(L.y))}" stroke="${TREND}" stroke-width="1"${L.dash ? ' stroke-dasharray="5 4"' : ''}/>`);
    else if (L.kind === 'bars') {
      for (const b of L.bars) for (const s of b.segs) {
        if (s.y1 <= s.y0) continue;
        o.push(`<rect x="${num(sx(b.x - L.width / 2))}" y="${num(sy(s.y1))}" width="${num(sx(b.x + L.width / 2) - sx(b.x - L.width / 2))}" height="${num(sy(s.y0) - sy(s.y1))}" fill="${s.c}"${s.a < 1 ? ` fill-opacity="${s.a}"` : ''}/>`);
      }
    } else if (L.kind === 'line') {
      const pts = [...L.pts].sort((a, b) => a.x - b.x);
      if (pts.length > 1) o.push(`<polyline fill="none" stroke="${L.c}" stroke-width="${L.width || 1.6}" stroke-linejoin="round" points="${pts.map((p) => `${num(sx(p.x))},${num(sy(p.y))}`).join(' ')}"/>`);
    } else if (L.kind === 'trend') {
      const pts = L.pts.filter((p) => isFin(p.x) && isFin(p.y));
      if (pts.length > 1) {
        const fit = lm(pts.map((p) => p.x), pts.map((p) => p.y)), lo = Math.min(...pts.map((p) => p.x)), hi = Math.max(...pts.map((p) => p.x));
        o.push(`<line x1="${num(sx(lo))}" y1="${num(sy(fit.intercept + fit.slope * lo))}" x2="${num(sx(hi))}" y2="${num(sy(fit.intercept + fit.slope * hi))}" stroke="${TREND}" stroke-width="1.4"/>`);
      }
    } else if (L.kind === 'points') {
      for (const p of L.pts) if (isFin(p.x) && isFin(p.y)) o.push(`<circle cx="${num(sx(p.x))}" cy="${num(sy(p.y))}" r="${L.r}" fill="${p.c}"${p.a !== undefined && p.a < 1 ? ` fill-opacity="${p.a}"` : ''}/>`);
    } else if (L.kind === 'text') {
      for (const t of L.items) o.push(`<text x="${num(sx(t.x))}" y="${num(sy(t.y) - 5)}" text-anchor="middle" font-size="11" fill="${MID}">${esc(t.text)}</text>`);
    }
  }
  o.push('</svg>');
  return o.join('');
}

// ---- small builders for the chart specs the report sections pass to chart() ----
const SIZE_PX = 1.98;   // ggplot point size -> radius in a 100 px/in chart
export const dateAxis = (days, extra = {}) => ({ ticks: dateTicks(Math.min(...days), Math.max(...days)), ...extra });
export const dots = (rs, fx, fy, color, size) => ({ kind: 'points', r: size * SIZE_PX, pts: rs.map((r) => ({ x: fx(r), y: fy(r), c: color(r) })) });
export const paceTicks = (vals) => numTicks(Math.min(...vals), Math.max(...vals), 5, fmtPace);
