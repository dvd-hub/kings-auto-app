import "server-only";
import { inflateSync } from "node:zlib";

/** Accept only a bounded canvas PNG with actual visible ink, including server-side blank checks. */
export function signaturePng(value: string): Buffer | null {
  try {
    const bytes = Buffer.from(value.replace(/^data:image\/png;base64,/, ""), "base64");
    if (bytes.length > 500000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), channels = bytes[25] === 6 ? 4 : bytes[25] === 2 ? 3 : 0;
    if (!width || !height || width > 1600 || height > 600 || bytes[24] !== 8 || !channels || bytes[28] !== 0) return null;
    const chunks: Buffer[] = [];
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (offset + length + 12 > bytes.length) return null;
      if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const stride = width * channels;
    const pixels = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
    if (pixels.length !== (stride + 1) * height) return null;
    let previous = Buffer.alloc(stride), ink = 0;
    for (let y = 0; y < height; y++) {
      const filter = pixels[y * (stride + 1)];
      if (filter > 4) return null;
      const row = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? row[x - channels] : 0, up = previous[x], corner = x >= channels ? previous[x - channels] : 0;
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
        row[x] = (pixels[y * (stride + 1) + 1 + x] + predictor) & 255;
      }
      for (let x = 0; x < stride; x += channels) if ((channels === 3 || row[x + 3] > 20) && Math.min(row[x], row[x + 1], row[x + 2]) < 220) ink++;
      previous = row;
    }
    return ink >= 20 ? bytes : null;
  } catch { return null; }
}
