// Minimal zip reader for huge archives: reads only the central directory (zip64 aware) and streams a single
// entry through the browser's built-in decompressor. Nothing is loaded into memory as a whole, so a multi-GB
// XML file inside a multi-GB zip works as long as the browser can slice the File.

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));   // sizes beyond 2^53 are not a concern

async function bytes(blob, start, end) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

async function readDirectory(blob) {
  const tailLen = Math.min(blob.size, 65557 + 22);
  const tailStart = blob.size - tailLen;
  const tail = await bytes(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This does not look like a zip file.');
  let entries = u16(tail, eocd + 10), dirSize = u32(tail, eocd + 12), dirOffset = u32(tail, eocd + 16);
  if (entries === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error('Unsupported zip64 layout.');
    const z64At = u64(tail, loc + 8);
    const z = await bytes(blob, z64At, z64At + 56);
    if (u32(z, 0) !== 0x06064b50) throw new Error('Unsupported zip64 layout.');
    entries = u64(z, 32); dirSize = u64(z, 40); dirOffset = u64(z, 48);
  }
  const dir = await bytes(blob, dirOffset, dirOffset + dirSize);
  const out = [];
  let p = 0;
  for (let n = 0; n < entries && p + 46 <= dir.byteLength; n++) {
    if (u32(dir, p) !== 0x02014b50) break;
    const method = u16(dir, p + 10);
    let compSize = u32(dir, p + 20), size = u32(dir, p + 24);
    const nameLen = u16(dir, p + 28), extraLen = u16(dir, p + 30), commentLen = u16(dir, p + 32);
    let offset = u32(dir, p + 42);
    const name = new TextDecoder().decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(dir, e), len = u16(dir, e + 2);
      if (id === 0x0001) {   // zip64: the fields that were 0xFFFFFFFF, in this order
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(dir, q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(dir, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(dir, q); q += 8; }
      }
      e += 4 + len;
    }
    out.push({ name, method, compSize, size, offset });
    p = extraEnd + commentLen;
  }
  return out;
}

// Open the health data XML as a stream of decompressed bytes. Apple translates the file name (export.xml in English),
// so take the largest .xml in the archive; the others (the clinical _cda.xml) are tiny by comparison.
// `onBytes(n)` is called with the number of compressed bytes read so far.
export async function openExportXml(blob, onBytes = () => {}) {
  const entries = await readDirectory(blob);
  const entry = entries.filter((e) => /\.xml$/i.test(e.name)).sort((a, b) => b.size - a.size)[0];
  if (!entry) throw new Error('No XML file found in this zip. Is it the export from the Health app?');
  const head = await bytes(blob, entry.offset, entry.offset + 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error('Damaged zip entry.');
  const start = entry.offset + 30 + u16(head, 26) + u16(head, 28);
  let read = 0;
  const counter = new TransformStream({
    transform(chunk, ctl) { read += chunk.byteLength; onBytes(read); ctl.enqueue(chunk); },
  });
  const raw = blob.slice(start, start + entry.compSize).stream().pipeThrough(counter);
  if (entry.method === 0) return { stream: raw, compressed: entry.compSize, size: entry.size, name: entry.name };
  if (entry.method !== 8) throw new Error(`Unsupported zip compression method ${entry.method}.`);
  return { stream: raw.pipeThrough(new DecompressionStream('deflate-raw')), compressed: entry.compSize, size: entry.size, name: entry.name };
}
