/**
 * Just enough ZIP to read and write a spreadsheet.
 *
 * An .xlsx is a zip of XML parts, so both reading a supplier's list and writing
 * our own costing workbook come down to this. The alternative was a library:
 * ExcelJS is about a megabyte, and this project fails its own build when a
 * chunk creeps past 400KB, so a dependency that size would have to earn its
 * place. It does not — the browser already has the hard part.
 *
 * `DecompressionStream` and `CompressionStream` do the DEFLATE work. Entries we
 * write are stored uncompressed: a price list is a few hundred rows, so the
 * saving is irrelevant beside the CRC and header code it would cost.
 */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** CRC-32, which the zip format requires and nothing in the platform provides. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Reads the named parts out of a zip.
 *
 * Walks the central directory rather than scanning for local headers: a local
 * header may claim a zero size and defer the truth to a data descriptor, which
 * is exactly what some spreadsheet writers emit.
 */
export async function readZipParts(
  file: ArrayBuffer,
  wanted: (name: string) => boolean,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(file);
  const view = new DataView(file);
  const out = new Map<string, Uint8Array>();

  // End of central directory: scan back from the end for its signature. The
  // comment field means it is not at a fixed offset.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 0x10000; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That file is not a readable .xlsx (no zip directory found).');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = textDecoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    if (!wanted(name)) continue;

    // The local header repeats the name and extra fields; the data follows it.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`That .xlsx uses an unsupported compression method (${method}).`);
  }

  return out;
}

export const decodePart = (bytes: Uint8Array): string => textDecoder.decode(bytes);

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface ZipEntry {
  name: string;
  /** Text is encoded UTF-8; bytes are written as given. */
  data: string | Uint8Array;
}

/** Builds a store-only zip. Returns a Blob ready to download. */
export function writeZip(entries: ZipEntry[], mimeType: string): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const data = typeof entry.data === 'string' ? textEncoder.encode(entry.data) : entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date — a fixed 1980-01-01 keeps output byte-stable
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end] as BlobPart[], { type: mimeType });
}

/** XML text escaping. Supplier descriptions really do contain `&` and `"`. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
