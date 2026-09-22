// Turns raw screen captures into the exact size Adobe wants for listing screenshots.
//
// Adobe recommends 1360x800 PNG or JPG. A Mac screen capture is never that: it is
// whatever the window happened to be, doubled on a Retina display. This scales each
// capture to fit and pads it out to the exact size.
//
// The padding matters. sips' own --padToHeightWidth silently CROPS when the image is
// larger than the target, so scaling has to happen first and has to fit BOTH sides --
// --resampleHeightWidthMax only constrains the longer one, which leaves a wide capture
// too tall and hands the crop back to sips. That cost 50px off the bottom of a test
// image before this was caught.
//
// Put captures in listing/screenshots/raw/ and run: npm run screenshots

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const W = 1360;
const H = 800;
const PAD = (process.argv.find(a => a.startsWith("--pad=")) ?? "--pad=FFFFFF").split("=")[1];

const root = fileURLToPath(new URL("..", import.meta.url));
const rawDir = join(root, "listing/screenshots/raw");
const outDir = join(root, "listing/screenshots");

const sips = (...args) => execFileSync("sips", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function size(file) {
    const out = sips("-g", "pixelWidth", "-g", "pixelHeight", file);
    return {
        w: Number(out.match(/pixelWidth:\s*(\d+)/)[1]),
        h: Number(out.match(/pixelHeight:\s*(\d+)/)[1])
    };
}

if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
    console.log(`\n  Created ${rawDir.replace(root, "")}\n\n  Put your captures there and run this again.`);
    console.log(`  See listing/SCREENSHOTS.md for what each one should show.\n`);
    process.exit(0);
}

const files = readdirSync(rawDir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort();
if (files.length === 0) {
    console.log(`\n  Nothing in listing/screenshots/raw/ yet.\n  See listing/SCREENSHOTS.md for what each one should show.\n`);
    process.exit(0);
}

console.log(`\n  Target ${W}x${H}, padding #${PAD}\n`);
let warnings = 0;

for (const name of files) {
    const out = join(outDir, name.replace(/\.jpe?g$/i, ".png"));
    copyFileSync(join(rawDir, name), out);

    const raw = size(out);
    // Fit inside the target: whichever side runs out first decides the scale.
    const scale = Math.min(W / raw.w, H / raw.h);
    if (raw.w / raw.h > W / H) sips("--resampleWidth", String(W), out);
    else sips("--resampleHeight", String(H), out);

    const fitted = size(out);
    sips("--padToHeightWidth", String(H), String(W), "--padColor", PAD, out);

    const final = size(out);
    const bars = final.w - fitted.w + (final.h - fitted.h);
    const barPct = Math.round((bars / (final.w - fitted.w > 0 ? W : H)) * 100);

    const notes = [];
    if (scale > 1) { notes.push(`UPSCALED ${scale.toFixed(2)}x, will look soft - recapture larger`); warnings++; }
    if (barPct > 15) { notes.push(`${barPct}% padding - recapture closer to 17:10`); warnings++; }
    if (final.w !== W || final.h !== H) { notes.push(`WRONG SIZE ${final.w}x${final.h}`); warnings++; }

    const tag = notes.length ? `  <- ${notes.join("; ")}` : "";
    console.log(`  ${name.padEnd(28)} ${String(raw.w).padStart(5)}x${String(raw.h).padEnd(5)} -> ${final.w}x${final.h}${tag}`);
}

console.log(
    warnings === 0
        ? `\n  ${files.length} ready in listing/screenshots/. Upload these, not the raw ones.\n`
        : `\n  ${files.length} written, ${warnings} worth a second look before uploading.\n`
);
