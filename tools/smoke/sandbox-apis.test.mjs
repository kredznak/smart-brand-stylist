// Fails if the document sandbox uses an Express API that Express refuses to run.
//
// Members marked @experimental in the SDK typings throw "Experimental APIs are not
// supported" at runtime unless the manifest sets experimentalApis, which a distributed
// add-on may not do. TypeScript compiles them happily, and local dev ran two of them
// without complaint, so nothing caught it until the add-on was used: allDescendants
// threw whenever a selection held a group or an image, and selectionIncludingNonEditable
// threw on every action that checked the selection.
//
// A couple of names are additionally listed by hand, because the typings do not mark
// everything Express actually gates.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const typings = join(root, "node_modules/@adobe/ccweb-add-on-sdk-types/sandbox/express-document-sdk.d.ts");
const sandbox = join(root, "src/sandbox/code.ts");

// Gated at runtime but not marked @experimental in the typings.
const ALSO_GATED = ["selectionIncludingNonEditable"];

// Reads of these are allowed where the code clearly guards them.
const GUARDED_BY_DESIGN = new Set(["selectionIncludingNonEditable"]);

const lines = (await readFile(typings, "utf8")).split("\n");
const experimental = new Set(ALSO_GATED);

for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("@experimental")) continue;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const member = lines[j].match(/^\s+(?:static |readonly |get |set |async )?([A-Za-z_]\w*)\s*[(<:]/);
        if (member && !lines[j].trim().startsWith("*")) {
            experimental.add(member[1]);
            break;
        }
    }
}

const code = (await readFile(sandbox, "utf8")).split("\n");
const findings = [];

for (const name of experimental) {
    code.forEach((line, index) => {
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
        if (!new RegExp(`\\.${name}\\b`).test(line)) return;
        // A guarded read sits inside a try, which the helper it lives in makes explicit.
        const guarded = GUARDED_BY_DESIGN.has(name) && code.slice(Math.max(0, index - 6), index).some(l => l.includes("try {"));
        if (!guarded) findings.push({ name, line: index + 1, text: line.trim() });
    });
}

console.log(`checked ${experimental.size} experimental Express APIs against src/sandbox/code.ts`);
if (findings.length === 0) {
    console.log("pass  the sandbox uses none of them unguarded");
    process.exit(0);
}
for (const f of findings) {
    console.error(`FAIL  ${sandbox.replace(root, "")}:${f.line} uses experimental "${f.name}"`);
    console.error(`        ${f.text}`);
}
console.error("\nExpress throws on these unless the manifest opts in, which a distributed add-on cannot do.");
process.exit(1);
