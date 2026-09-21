// Checks the shape of the timeout wrapper around the sandbox proxy.
//
// The browser pass cannot see this: its stand-in sandbox is a plain object, and wrapping
// a plain object in a catch-all Proxy works fine. Inside Express the wrapper is handed an
// RPC proxy, and a trap that returns a function for *any* property also captures toString
// and Symbol.toPrimitive, so converting the object to a string yields a promise and the
// add-on dies with "cannot convert object to primitive value". These assertions fail on
// that shape without needing Express.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "guard-"));

const emitted = join(out, "ui/timeout.js");
try {
    execFileSync(join(root, "node_modules/.bin/tsc"), [
        join(root, "src/ui/timeout.ts"),
        "--outDir", out,
        "--module", "esnext",
        "--target", "es2020",
        "--moduleResolution", "bundler",
        "--skipLibCheck"
    ], { stdio: "pipe" });
} catch {
    // tsc reports unrelated errors in ambient typings under node_modules and exits
    // non-zero even though it still emits. Only a missing file is a real problem here.
}
if (!existsSync(emitted)) {
    console.error("could not compile src/ui/timeout.ts");
    process.exit(1);
}

const { guarded } = await import(pathToFileURL(emitted).href);

const METHODS = ["build", "describeSelection", "auditPage", "fixOffBrandColors", "applyColorToSelection",
    "addPaletteToPage", "getAvailableFonts", "getSelectionFont", "loadFont", "applyFontToSelection",
    "auditFonts", "fixOffBrandFonts", "addTextToPage", "replaceSelectedText"];

const stub = Object.fromEntries(METHODS.map(m => [m, async () => m]));
const wrapped = guarded(stub);

const checks = [
    ["converts to a string", () => { String(wrapped); }],
    ["works in a template literal", () => { `${wrapped}`; }],
    ["is not mistaken for a promise", () => { if (typeof wrapped.then === "function") throw new Error("then is a function"); }],
    ["leaves unknown properties alone", () => { if (typeof wrapped.nope === "function") throw new Error("nope is a function"); }],
    ["exposes every sandbox method", () => {
        const missing = METHODS.filter(m => typeof wrapped[m] !== "function");
        if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
    }],
    ["still calls through", async () => { if (await wrapped.build() !== "build") throw new Error("wrong answer"); }]
];

let failed = 0;
for (const [name, check] of checks) {
    try {
        await check();
        console.log(`pass  ${name}`);
    } catch (e) {
        console.error(`FAIL  ${name}: ${e.message}`);
        failed++;
    }
}
process.exit(failed ? 1 : 0);
