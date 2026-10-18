// Formatting helpers shared by the report sections: US / metric units, month-over-month change notes.
import { KM_PER_MI, isFin, rnd, fmtPace, fmtHm, f2, r0, fToC, fmtMd } from '../util.js';

export const NO_DELTA = '<span class="d"></span>';
export const md = fmtMd;
export const hm = (minutes) => fmtHm(minutes).replace(/^</, '&lt;');

// ---- units: US (default) and metric. Text is written twice (u-us / u-si spans); charts are drawn twice. ----
export const dual = (us, si) => (us === si ? us : `<span class="u-us">${us}</span><span class="u-si">${si}</span>`);
export const UN = [
  { cls: 'u-us', dist: 1, pace: 1, dlab: 'miles', dunit: 'mi', punit: 'min/mi', tunit: '\u00b0F', near: '0.6 mi', temp: (f) => f },
  { cls: 'u-si', dist: KM_PER_MI, pace: 1 / KM_PER_MI, dlab: 'kilometres', dunit: 'km', punit: 'min/km', tunit: '\u00b0C', near: '1 km', temp: fToC },
];
export const distU = (mi, f = f2, suffix = '') => dual(`${f(mi)} mi${suffix}`, `${f(mi * KM_PER_MI)} km${suffix}`);
export const paceU = (p) => dual(`${fmtPace(p)} /mi`, `${fmtPace(p / KM_PER_MI)} /km`);
export const kcalU = (perMi, per = '') => dual(`${r0(perMi)} kcal${per ? ' per mi' : ''}`, `${r0(perMi / KM_PER_MI)} kcal${per ? ' per km' : ''}`);
export const tempU = (f) => (isFin(f) ? dual(`${r0(f)}\u00b0F`, `${r0(fToC(f))}\u00b0C`) : 'N/A');

// change from the previous month, as a small up/down note after the value
export const delta = (nw, old, kind = 'pct', digits = 0, scale = 1, suffix = '', vs = 'previous month') => {
  if (!isFin(nw) || !isFin(old)) return NO_DELTA;
  const d = rnd(kind === 'pct' ? 100 * (nw / old - 1) : (nw - old) * scale, digits);
  if (d === 0) return NO_DELTA;
  return `<span class="d" title="vs ${vs}">${d > 0 ? '\u25b2' : '\u25bc'} ${Math.abs(d).toFixed(digits)}${kind === 'pct' ? '%' : suffix}</span>`;
};
