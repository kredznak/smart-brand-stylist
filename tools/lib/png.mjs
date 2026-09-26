// Just enough PNG to read pixels, change some, and write them back.
//
// There is no image library on a stock Mac -- no ImageMagick, no PIL, no ffmpeg --
// and sips can scale and pad but cannot draw. Node ships zlib, which is the only
// hard part, so the rest is chunk parsing and undoing the per-scanline filters.
//
// Chunks other than IDAT are carried through untouched, so an embedded color
// profile survives the round trip and the image does not shift color.

import { inflateSync, deflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function crc32(buf) {
    let c = ~0;
    for (const b of buf) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

export function read(file, fsRead) {
    const data = fsRead(file);
    if (!data.subarray(0, 8).equals(SIG)) throw new Error(`${file}: not a PNG`);

    const chunks = [];
    const idat = [];
    let pos = 8;
    while (pos < data.length) {
        const len = data.readUInt32BE(pos);
        const type = data.toString("ascii", pos + 4, pos + 8);
        const body = data.subarray(pos + 8, pos + 8 + len);
        if (type === "IDAT") idat.push(body);
        chunks.push({ type, body });
        pos += 12 + len;
    }

    const ihdr = chunks.find(c => c.type === "IHDR").body;
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    const depth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
    if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`${file}: unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`);
    }

    const ch = colorType === 2 ? 3 : 4;
    const stride = width * ch;
    const raw = inflateSync(Buffer.concat(idat));
    const pix = Buffer.alloc(height * stride);

    let p = 0;
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const f = raw[p++];
        const line = Buffer.from(raw.subarray(p, p + stride));
        p += stride;
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? line[i - ch] : 0;
            const b = prev[i];
            const c = i >= ch ? prev[i - ch] : 0;
            if (f === 1) line[i] = (line[i] + a) & 255;
            else if (f === 2) line[i] = (line[i] + b) & 255;
            else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
            else if (f === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
        }
        line.copy(pix, y * stride);
        prev = line;
    }

    return { width, height, ch, stride, pix, chunks };
}

export function write(file, img, fsWrite) {
    const { width, height, ch, stride, pix, chunks } = img;

    // Try every filter per row and keep the one that should compress best.
    const rows = Buffer.alloc(height * (stride + 1));
    let out = 0;
    let prev = Buffer.alloc(stride);
    const cand = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const line = pix.subarray(y * stride, (y + 1) * stride);
        let bestSum = Infinity, bestF = 0, best = null;
        for (let f = 0; f < 5; f++) {
            let sum = 0;
            for (let i = 0; i < stride; i++) {
                const a = i >= ch ? line[i - ch] : 0;
                const b = prev[i];
                const c = i >= ch ? prev[i - ch] : 0;
                const x = line[i];
                const v =
                    f === 0 ? x :
                    f === 1 ? x - a :
                    f === 2 ? x - b :
                    f === 3 ? x - ((a + b) >> 1) :
                              x - paeth(a, b, c);
                cand[i] = v & 255;
                sum += cand[i] < 128 ? cand[i] : 256 - cand[i];
            }
            if (sum < bestSum) { bestSum = sum; bestF = f; best = Buffer.from(cand); }
        }
        rows[out++] = bestF;
        best.copy(rows, out);
        out += stride;
        prev = line;
    }

    const deflated = deflateSync(rows, { level: 9 });
    const parts = [SIG];
    for (const c of chunks) {
        if (c.type === "IDAT") {
            if (c === chunks.find(x => x.type === "IDAT")) parts.push(chunk("IDAT", deflated));
            continue; // later IDATs are folded into the one above
        }
        parts.push(chunk(c.type, c.body));
    }
    fsWrite(file, Buffer.concat(parts));

    function chunk(type, body) {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(body.length, 0);
        head.write(type, 4, "ascii");
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4, 8), body])), 0);
        return Buffer.concat([head, body, crc]);
    }
}
