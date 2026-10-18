// Stream an Apple Health export (.zip) into compact tables. A port of src/parse_export.R: export.xml is read once,
// line by line (Apple writes one element per line), and only running workouts and a few record types are kept.

import { openExportXml } from './zip.js';
import { parseHkTime, dayNum } from './util.js';

const REC_TYPES = {
  HeartRate: 'HKQuantityTypeIdentifierHeartRate',
  DistanceWalkingRunning: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  RestingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  HeartRateVariabilitySDNN: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  VO2Max: 'HKQuantityTypeIdentifierVO2Max',
  HeartRateRecoveryOneMinute: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
  RunningPower: 'HKQuantityTypeIdentifierRunningPower',
  RunningStrideLength: 'HKQuantityTypeIdentifierRunningStrideLength',
};
const REC_BY_ID = Object.fromEntries(Object.entries(REC_TYPES).map(([k, v]) => [v, k]));
const NEEDS_DAY = new Set(['RestingHeartRate', 'HeartRateVariabilitySDNN', 'VO2Max']);
const STAT_TYPES = new Set(['DistanceWalkingRunning', 'StepCount', 'ActiveEnergyBurned', 'RunningVerticalOscillation', 'RunningGroundContactTime']);
const META_KEYS = new Set(['HKIndoorWorkout', 'HKWeatherTemperature', 'HKWeatherHumidity']);
const ID_PREFIX = 'HKQuantityTypeIdentifier';

function attr(line, name) {
  const key = ` ${name}="`;
  const i = line.indexOf(key);
  if (i < 0) return null;
  const from = i + key.length, j = line.indexOf('"', from);
  return j < 0 ? null : line.slice(from, j);
}
const num = (s) => (s === null || s === '' ? NaN : Number(s));
function unescapeXml(s) {
  return s && s.includes('&') ? s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[e])) : s;
}

function newColumns() { return { t0: [], t1: [], v: [], src: [], unit: [], day: [] }; }

/**
 * @param {Blob} blob     the export.zip (a File from <input type=file> works)
 * @param {{start: string, end: string}} range  'YYYY-MM-DD'; records outside it are dropped (workouts are all kept)
 * @param {(p: {fraction: number, lines: number, workouts: number}) => void} [onProgress]
 */
export async function readHealthExport(blob, { start, end }, onProgress = () => {}) {
  const keepFrom = start;
  const keepTo = dayStrPlusOne(end);
  const sources = [], sourceIdx = new Map(), units = [], unitIdx = new Map();
  const intern = (list, map, s) => { let i = map.get(s); if (i === undefined) { i = list.length; list.push(s); map.set(s, i); } return i; };
  const cols = Object.fromEntries(Object.keys(REC_TYPES).map((k) => [k, newColumns()]));
  const workouts = [], stats = new Map(), meta = new Map();
  let exportDate = null, birthDate = null, cur = null, lines = 0, compressedRead = 0;

  const { stream, compressed } = await openExportXml(blob, (n) => { compressedRead = n; });

  function handle(line) {
    lines++;
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
    if (line.startsWith(' <Record type="')) {
      const id = attr(line, 'type');
      const type = REC_BY_ID[id];
      if (!type) return;
      const sd = attr(line, 'startDate');
      if (!sd) return;
      const d = sd.slice(0, 10);
      if (d < keepFrom || d >= keepTo) return;
      const c = cols[type];
      c.t0.push(parseHkTime(sd));
      c.t1.push(parseHkTime(attr(line, 'endDate')));
      c.v.push(num(attr(line, 'value')));
      c.src.push(intern(sources, sourceIdx, unescapeXml(attr(line, 'sourceName') ?? '')));
      c.unit.push(intern(units, unitIdx, attr(line, 'unit') ?? ''));
      if (NEEDS_DAY.has(type)) c.day.push(dayNum(d));
      return;
    }
    if (cur) {
      if (line.startsWith('  <WorkoutStatistics ')) {
        const type = (attr(line, 'type') ?? '').replace(ID_PREFIX, '');
        if (STAT_TYPES.has(type)) stats.get(cur).push({ type, sum: num(attr(line, 'sum')), average: num(attr(line, 'average')), unit: attr(line, 'unit') });
      } else if (line.startsWith('  <MetadataEntry ')) {
        const key = attr(line, 'key');
        if (META_KEYS.has(key)) { const m = meta.get(cur); if (!m.has(key)) m.set(key, attr(line, 'value')); }
      } else if (line.startsWith(' </Workout>')) cur = null;
      return;
    }
    if (line.startsWith(' <Workout ')) {
      if (!line.includes('workoutActivityType="HKWorkoutActivityTypeRunning"')) return;
      const id = workouts.length + 1;
      const startDate = attr(line, 'startDate'), endDate = attr(line, 'endDate');
      workouts.push({
        id, source: unescapeXml(attr(line, 'sourceName') ?? ''), start: startDate, end: endDate,
        duration: num(attr(line, 'duration')), durationUnit: attr(line, 'durationUnit'),
        totalDistance: num(attr(line, 'totalDistance')), totalDistanceUnit: attr(line, 'totalDistanceUnit'),
        t0: parseHkTime(startDate), t1: parseHkTime(endDate), date: startDate.slice(0, 10),
      });
      stats.set(id, []); meta.set(id, new Map());
      if (!line.trimEnd().endsWith('/>')) cur = id;
      return;
    }
    if (exportDate === null && line.startsWith(' <ExportDate ')) exportDate = attr(line, 'value');
    else if (birthDate === null && line.startsWith(' <Me ')) birthDate = attr(line, 'HKCharacteristicTypeIdentifierDateOfBirth');
  }

  const decoder = new TextDecoder('utf-8');   // invalid bytes become U+FFFD instead of failing
  const reader = stream.getReader();
  let carry = '', lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = carry + decoder.decode(value, { stream: true });
    let i = 0, j;
    while ((j = text.indexOf('\n', i)) >= 0) { handle(text.slice(i, j)); i = j + 1; }
    carry = text.slice(i);
    const now = Date.now();
    if (now - lastReport > 150) {
      lastReport = now;
      onProgress({ fraction: compressed ? Math.min(compressedRead / compressed, 1) : 0, lines, workouts: workouts.length });
      await new Promise((r) => setTimeout(r, 0));   // let the page repaint
    }
  }
  carry += decoder.decode();
  if (carry) handle(carry);
  onProgress({ fraction: 1, lines, workouts: workouts.length });

  return {
    workouts, stats, meta, records: finishRecords(cols), sources, units, exportDate, birthDate,
    sampleCount: Object.values(cols).reduce((n, c) => n + c.t0.length, 0),
  };
}

// Turn the growing arrays into typed arrays sorted by start time (stable, so ties keep file order).
function finishRecords(cols) {
  const out = {};
  for (const [type, c] of Object.entries(cols)) {
    const n = c.t0.length;
    let sorted = true;
    for (let i = 1; i < n && sorted; i++) if (c.t0[i] < c.t0[i - 1]) sorted = false;
    const order = Array.from({ length: n }, (_, i) => i);
    if (!sorted) order.sort((a, b) => c.t0[a] - c.t0[b]);
    const pick = (arr, T) => { const a = new T(n); for (let i = 0; i < n; i++) a[i] = arr[order[i]]; return a; };
    out[type] = {
      n, t0: pick(c.t0, Float64Array), t1: pick(c.t1, Float64Array), v: pick(c.v, Float64Array),
      src: pick(c.src, Int32Array), unit: pick(c.unit, Int32Array),
      day: c.day.length ? pick(c.day, Int32Array) : null,
    };
  }
  return out;
}

function dayStrPlusOne(s) {
  return new Date((dayNum(s) + 1) * 86400000).toISOString().slice(0, 10);   // exclusive upper bound on a date string
}
