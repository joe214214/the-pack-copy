/**
 * Pure-TS ZIP writer (STORE method, no external dependency).
 *
 * Used by "Download All (.zip)" in DeliverableFiles when a task delivers
 * multiple images/videos/files. Since PNG/JPEG/WebP/MP4/WebM are already
 * compressed, STORE (method 0 — no re-deflation) produces virtually the same
 * archive size while finishing in milliseconds in the browser.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const used = new Set<string>();
  const normalized = entries.map((e, idx) => {
    let name = (e.name || `file-${idx + 1}`).replace(/[\\/]+/g, "_");
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}_${idx + 1}${name.slice(dot)}` : `${name}_${idx + 1}`;
    }
    used.add(name);
    return { nameBytes: enc.encode(name), data: e.data, crc: crc32(e.data) };
  });

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const item of normalized) {
    const nLen = item.nameBytes.length;
    const size = item.data.length;

    // Local file header (30 + nLen)
    const lh = new Uint8Array(30 + nLen);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true);      // STORE
    lv.setUint32(14, item.crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nLen, true);
    lh.set(item.nameBytes, 30);
    localParts.push(lh, item.data);

    // Central directory header (46 + nLen)
    const ch = new Uint8Array(46 + nLen);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, item.crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nLen, true);
    cv.setUint32(42, offset, true);
    ch.set(item.nameBytes, 46);
    centralParts.push(ch);

    offset += lh.length + size;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, normalized.length, true);
  ev.setUint16(10, normalized.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd] as BlobPart[], { type: "application/zip" });
}

export async function downloadFilesAsZip(
  files: Array<{ name?: string; url?: string }>,
  zipFilename = "deliverables.zip"
): Promise<void> {
  const valid = files.filter((f) => f.url);
  const entries: ZipEntry[] = await Promise.all(
    valid.map(async (f, idx) => {
      const res = await fetch(f.url!);
      if (!res.ok) throw new Error(`Failed to fetch ${f.name || idx + 1} (${res.status})`);
      return { name: f.name || `file-${idx + 1}`, data: new Uint8Array(await res.arrayBuffer()) };
    })
  );
  const blob = buildZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
