// One command to put the server online: create the usage store, upload the API key,
// deploy, and point the add-on at the result.
//
// The two steps this exists for are the ones done by hand until now — copying the KV
// namespace id into wrangler.toml, and the deployed URL into src/ui/config.ts. Both are
// silent when they go wrong: the add-on builds fine and fails only once someone uses it.
//
// Safe to run again. Anything already done is detected and left alone.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = join(here, "..");
const wranglerToml = join(here, "wrangler.toml");
const configTs = join(repo, "src/ui/config.ts");

const step = message => console.log(`\n• ${message}`);
const done = message => console.log(`  ${message}`);

function wrangler(args, { input, quiet } = {}) {
    return execFileSync("npx", ["wrangler", ...args], {
        cwd: here,
        input,
        encoding: "utf8",
        stdio: input === undefined ? ["ignore", "pipe", quiet ? "pipe" : "inherit"] : ["pipe", "pipe", "pipe"]
    });
}

// --- 1. signed in? -------------------------------------------------------------------
step("Checking you are signed in to Cloudflare");
let who;
try {
    who = wrangler(["whoami"], { quiet: true });
} catch {
    who = "";
}
if (/not authenticated/i.test(who) || !who) {
    console.error("\n  You are not signed in. Run this first, then run me again:\n\n      cd server && npx wrangler login\n");
    process.exit(1);
}
done((who.match(/associated with the email (.+?)[\s!]*$/im) ?? who.match(/account.*/i) ?? ["signed in"])[0].trim());

// --- 2. usage store ------------------------------------------------------------------
step("Making sure the USAGE store exists");
let toml = readFileSync(wranglerToml, "utf8");
const currentId = toml.match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/)?.[1];

if (currentId && currentId !== "replace-with-your-kv-namespace-id") {
    done(`already set to ${currentId}`);
} else {
    const listed = JSON.parse(wrangler(["kv", "namespace", "list"], { quiet: true }));
    let found = listed.find(n => n.title.endsWith("USAGE"));
    if (!found) {
        wrangler(["kv", "namespace", "create", "USAGE"], { quiet: true });
        found = JSON.parse(wrangler(["kv", "namespace", "list"], { quiet: true })).find(n => n.title.endsWith("USAGE"));
    }
    if (!found) throw new Error("Could not create or find the USAGE namespace.");
    toml = toml.replace(/(\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*)"[^"]+"/, `$1"${found.id}"`);
    writeFileSync(wranglerToml, toml);
    done(`wrote id ${found.id} into wrangler.toml`);
}

// --- 3. API key ----------------------------------------------------------------------
step("Making sure the Anthropic key is uploaded");
let secrets = [];
try {
    secrets = JSON.parse(wrangler(["secret", "list"], { quiet: true }));
} catch {
    secrets = []; // no secrets yet on a Worker that has never deployed
}
if (secrets.some(s => s.name === "ANTHROPIC_API_KEY")) {
    done("already uploaded");
} else {
    const devVars = join(here, ".dev.vars");
    if (!existsSync(devVars)) {
        console.error("\n  No key to upload. Either create server/.dev.vars with your key, or run:\n\n      cd server && npx wrangler secret put ANTHROPIC_API_KEY\n");
        process.exit(1);
    }
    const key = readFileSync(devVars, "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m)?.[1].trim();
    if (!key || key === "paste-your-key-here") {
        console.error("\n  server/.dev.vars still has the placeholder key in it.\n");
        process.exit(1);
    }
    wrangler(["secret", "put", "ANTHROPIC_API_KEY"], { input: key }); // never printed
    done("uploaded from server/.dev.vars");
}

// --- 4. deploy -----------------------------------------------------------------------
step("Deploying");
const output = wrangler(["deploy"], { quiet: true });
const url = output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
if (!url) {
    console.error(output);
    throw new Error("Deployed, but could not find the URL in wrangler's output. Paste it into src/ui/config.ts yourself.");
}
done(url);

// --- 5. point the add-on at it -------------------------------------------------------
step("Pointing the add-on at the deployed server");
const config = readFileSync(configTs, "utf8");
const existing = config.match(/const PRODUCTION_API_BASE = "([^"]+)"/)?.[1];
if (existing === url) {
    done("already correct");
} else {
    writeFileSync(configTs, config.replace(/(const PRODUCTION_API_BASE = )"[^"]+"/, `$1"${url}"`));
    done(`set PRODUCTION_API_BASE to ${url}`);
}

console.log(`
Done. The server is live at ${url}

Next:
  1. npm run build        (in the project root, so the add-on ships the new address)
  2. Check the deployed server answers:
       curl -s -X POST ${url}/analyze-site -H 'Content-Type: application/json' -d '{"url":"stripe.com"}'
  3. Commit the changed wrangler.toml and src/ui/config.ts.
`);
