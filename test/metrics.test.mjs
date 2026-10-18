import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyLoad, routeGroups } from '../src/web/js/metrics.js';

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
