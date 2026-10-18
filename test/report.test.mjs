// Builds the sample report in Node and checks the page made from assets/ (template, CSS, scripts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAsBlob, readFileSync } from 'node:fs';
import { readHealthExport } from '../src/lib/parse.js';
import { buildReport } from '../src/lib/build-report.js';
import { fillTemplate } from '../src/lib/report/page.js';
import { loadAssets } from '../src/lib/assets.js';
import { dayNum, dayStr, reportStart } from '../src/lib/util.js';

const assetUrl = (name) => new URL(`../src/lib/assets/${name}`, import.meta.url);

test('fillTemplate substitutes each placeholder once and leaves substituted text alone', () => {
  assert.equal(fillTemplate('a {{x}} b {{y}}', { x: '{{y}} $& \\n', y: 'Y' }), 'a {{y}} $& \\n b Y');
});

test('the sample report is a complete page built from the asset files', async () => {
  const today = '2026-10-18', end = dayNum(today), start = reportStart(24, end);
  const x = await readHealthExport(await openAsBlob(new URL('../example/export.zip', import.meta.url)), { start: dayStr(start), end: today });
  const assets = await loadAssets(async (name) => readFileSync(assetUrl(name), 'utf8'));
  const html = buildReport(x, start, end, { assets, sourceName: 'export.zip', generated: today });

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!/\{\{[a-z_]+\}\}/.test(html), 'unfilled placeholder');
  assert.ok(html.includes(assets.css.slice(0, 80)), 'CSS inlined');
  assert.ok(html.includes("wire('theme-toggle'"), 'page script inlined');
  assert.equal((html.match(/<script>/g) || []).length, 2);
  assert.equal((html.match(/<section|class="section level1"/g) || []).length, 3);
  assert.ok((html.match(/<svg /g) || []).length >= 20, 'charts are inline SVG');
  assert.ok(html.indexOf('<main>') < html.indexOf('class="kpis"') && html.indexOf('class="kpis"') < html.indexOf('</main>'));
});
