// Runs the command-line tool on the sample export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
const sample = new URL('../example/export.zip', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('writes the report named after its date range', () => {
  const out = mkdtempSync(join(tmpdir(), 'cli-'));
  const r = run(sample, '--duration', '24', '--end', '2026-10-18', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(out), ['running_report_2024-11-01_2026-10-18.html']);
  assert.ok(readFileSync(join(out, readdirSync(out)[0]), 'utf8').startsWith('<!DOCTYPE html>'));
});

test('rejects bad options', () => {
  assert.notEqual(run(sample, '--duration', '0').status, 0);
  assert.notEqual(run(sample, '--end', '2026-13-40').status, 0);
  assert.notEqual(run().status, 0);
  assert.notEqual(run('--nope').status, 0);
});

test('says so when the range has no runs', () => {
  const r = run(sample, '--duration', '1', '--end', '2020-01-15', '--out', mkdtempSync(join(tmpdir(), 'cli-')));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /[Nn]o running workouts/);
});
