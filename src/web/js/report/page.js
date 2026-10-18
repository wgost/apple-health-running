// Page assembly: tables, an accumulator for the report body (headings, chart boxes), and the final page, which is
// the shared template (shared/page.tmpl) filled with the shared CSS and scripts.
import { esc, slug } from '../util.js';
import { UN } from './format.js';

export const table = (headers, rows, align, cls = '') => {
  const al = { l: 'left', r: 'right', c: 'center' };
  const th = headers.map((h, i) => `<th style="text-align:${al[align[i]]}">${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td style="text-align:${al[align[i]]}">${c}</td>`).join('')}</tr>`).join('');
  return `<table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
};
// a table with a "Measure" column and one column per month (or band): cells are [value, delta] pairs
export const transpose = (labels, cols) => labels.map((l, i) => [l, ...cols.map((c) => c[i])]);
export const pairCell = (v, d) => `<span class="v">${v}</span>${d}`;

// Fill {{name}} placeholders in one pass, so text that is substituted is never scanned for placeholders again.
export const fillTemplate = (tmpl, vars) => tmpl.replace(/\{\{([a-z_]+)\}\}/g, (_, k) => vars[k]);

/**
 * @param shared  the files in shared/ as strings: { template, themeInit, css, pageJs }
 */
export function newPage(shared) {
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

  const render = () => {
    const tocHtml = `<ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text.replace(/^[0-9]+\.\s*/, ''))}</a></li>`).join('')}</ul>`;
    return fillTemplate(shared.template, { theme_init: shared.themeInit, css: shared.css, toc: tocHtml, body: parts.join('\n'), page_js: shared.pageJs });
  };
  return { add, h1, h2, closeDiv, bullets, fig, figU, figGrid, render };
}
