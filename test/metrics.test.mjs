import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyLoad, routeGroups, monthlySummary } from '../src/lib/metrics.js';

const run = (date, mi, indoor = false) => ({ date, mi, indoor });

test('a run with no distance adds nothing to the weekly distance', () => {
  const [w] = weeklyLoad([run(20000, NaN), run(20001, 3), run(20002, 2, true)]);
  assert.deepEqual([w.mi, w.mi_outdoor, w.mi_indoor], [5, 3, 2]);
});

test('route groups leave out runs with no distance', () => {
  const runs = [NaN, 5, 5.1, 5.2, 5.1, 5].map((mi, i) => run(20000 + i, mi));
  const groups = routeGroups(runs);
  assert.equal(groups.length, 5);
  assert.ok(groups.every((r) => r.route_mi > 5 && r.route_mi < 5.2));
});

test('a run with no distance does not turn the month totals into NaN', () => {
  const r = (mi, min) => ({ month: '2026-10', date: 20000, mi, duration_min: min, energy_kcal: NaN, pace_mi: min / mi, cadence_spm: 160, indoor: false });
  const [m] = monthlySummary([r(3, 30), { ...r(NaN, 3), cadence_spm: NaN }, r(5, 50)]);
  assert.equal(m.runs, 3);
  assert.equal(m.mi, 8);
  assert.equal(m.minutes, 83);
  assert.equal(m.pace_mi, 10);
  assert.equal(m.longest_mi, 5);
  assert.equal(m.cadence, 160);
});
