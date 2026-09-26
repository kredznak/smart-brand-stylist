// Removes the two things a capture of an unpublished add-on always picks up and
// that a user of the published add-on would never see:
//
//   - the DEVELOPER MODE badge, a blue chip in the middle of the Express toolbar,
//     which is on screen because add-on testing has to be enabled to run at all
//   - the window focus border, a few pixels of blue along one edge of the window
//
// Both are flat color on flat color. The badge is repainted by sampling the
// toolbar immediately left and right of it, per row rather than once, so the fill
// follows the bar instead of assuming a value -- which matters because the badge
// can sit flush against the top of the capture, where the rows above it are the
// white padding and must stay white.
//
// Nothing about the add-on's own interface is touched.

import { readFileSync, writeFileSync } from "node:fs";
import { read, write } from "./png.mjs";

const isBlue = (r, g, b) => b > 110 && b - r > 45 && b - g > 35;

// The badge is roughly 105px wide at 1360. Anything much wider is the window
// border; anything much narrower is text or an icon.
const MIN_CHIP = 80;
const MAX_CHIP = 140;

export function clean(file) {
    const img = read(file, readFileSync);
    const { width: w, height: h, ch, stride, pix } = img;

    const at = (x, y) => {
        const i = y * stride + x * ch;
        return [pix[i], pix[i + 1], pix[i + 2]];
    };
    const paint = (x, y, [r, g, b]) => {
        const i = y * stride + x * ch;
        pix[i] = r; pix[i + 1] = g; pix[i + 2] = b;
        if (ch === 4) pix[i + 3] = 255;
    };

    // Collect compact blue runs, then merge them into clusters. The Share button is
    // blue too, so the badge is picked out as the cluster nearest the middle of the
    // bar -- Share is pinned to the right.
    const clusters = [];
    for (let y = 0; y < h; y++) {
        let start = null;
        for (let x = 0; x <= w; x++) {
            const on = x < w && isBlue(...at(x, y));
            if (on && start === null) start = x;
            if (!on && start !== null) {
                const end = x - 1, len = x - start;
                if (len >= MIN_CHIP && len <= MAX_CHIP) {
                    const hit = clusters.find(c => start <= c.x1 + 6 && end >= c.x0 - 6);
                    if (hit) {
                        hit.x0 = Math.min(hit.x0, start); hit.x1 = Math.max(hit.x1, end);
                        hit.y0 = Math.min(hit.y0, y); hit.y1 = Math.max(hit.y1, y);
                    } else {
                        clusters.push({ x0: start, x1: end, y0: y, y1: y });
                    }
                }
                start = null;
            }
        }
    }

    let badge = null;
    if (clusters.length) {
        const off = c => Math.abs((c.x0 + c.x1) / 2 - w / 2);
        const nearest = clusters.reduce((a, b) => (off(b) < off(a) ? b : a));
        if (off(nearest) < w * 0.08) badge = nearest;
    }

    if (badge) {
        const { x0, x1, y0, y1 } = badge;
        const lx = Math.max(0, x0 - 10), rx = Math.min(w - 1, x1 + 10);
        const mid = (x0 + x1) >> 1;
        for (let y = Math.max(0, y0 - 3); y < Math.min(h, y1 + 4); y++) {
            const left = at(lx, y), right = at(rx, y);
            for (let x = Math.max(0, x0 - 3); x < Math.min(w, x1 + 4); x++) {
                paint(x, y, x <= mid ? left : right);
            }
        }
    }

    // The focus border runs the full width at the very edge of the content, with the
    // white padding just beyond it, so white is the seamless thing to replace it with.
    const border = [];
    for (let y = 0; y < h; y++) {
        let n = 0, seen = 0;
        for (let x = 0; x < w; x += 4) { seen++; if (isBlue(...at(x, y))) n++; }
        if (n > seen * 0.8) border.push(y);
    }
    for (const y of border) for (let x = 0; x < w; x++) paint(x, y, [255, 255, 255]);

    if (badge || border.length) write(file, img, writeFileSync);

    return {
        badge: badge && { w: badge.x1 - badge.x0 + 1, h: badge.y1 - badge.y0 + 1 },
        borderRows: border.length
    };
}
