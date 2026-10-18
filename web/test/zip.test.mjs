// Run: node --test web/test/zip.test.mjs
// Checks the zip reader on deflated, stored and zip64 archives (made with Python's zipfile) and the JS parser's counts on the sample export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openAsBlob } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openExportXml } from '../js/zip.js';
import { readHealthExport } from '../js/parse.js';

const XML = '<?xml version="1.0"?>\n<HealthData>\n <ExportDate value="2026-01-01 00:00:00 +0000"/>\n</HealthData>\n'.repeat(1000);
function makeZip(method, zip64) {
  const path = join(mkdtempSync(join(tmpdir(), 'zip-')), 'a.zip');
  const py = `import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w',${method}) as z:\n z.writestr('other.txt','x')\n with z.open('apple_health_export/export.xml','w',force_zip64=${zip64}) as f: f.write(sys.argv[2].encode())`;
  execFileSync('python3', ['-c', py, path, XML]);
  return path;
}
async function readAll(path) {
  const { stream } = await openExportXml(await openAsBlob(path));
  const parts = [];
  for await (const c of stream) parts.push(Buffer.from(c));
  return Buffer.concat(parts).toString();
}

for (const [name, method, zip64] of [['deflated', 'zipfile.ZIP_DEFLATED', 'False'], ['stored', 'zipfile.ZIP_STORED', 'False'], ['zip64 flag', 'zipfile.ZIP_DEFLATED', 'True']]) {
  test(`reads export.xml from a ${name} zip`, async () => assert.equal(await readAll(makeZip(method, zip64)), XML));
}
test('rejects a zip without export.xml', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zip-')), 'b.zip');
  execFileSync('python3', ['-c', "import zipfile,sys\nzipfile.ZipFile(sys.argv[1],'w').writestr('x.txt','x')", path]);
  await assert.rejects(openExportXml(await openAsBlob(path)), /No export\.xml/);
});
test('parses the sample export like the R parser (34 running workouts, 83,444 samples)', async () => {
  const x = await readHealthExport(await openAsBlob(new URL('../../example/export.zip', import.meta.url).pathname), { start: '2026-08-01', end: '2026-10-18' });
  assert.equal(x.workouts.length, 34);
  assert.equal(x.sampleCount, 83444);
  assert.equal(x.birthDate, '1991-03-15');
});
