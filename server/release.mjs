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
    try {
        return execFileSync("npx", ["wrangler", ...args], {
            cwd: here,
            input,
            encoding: "utf8",
            stdio: input === undefined ? ["ignore", "pipe", quiet ? "pipe" : "inherit"] : ["pipe", "pipe", "pipe"]
        });
    } catch (e) {
        // execFileSync throws an object whose default rendering is a wall of buffers.
        // What is wanted is whatever wrangler actually said.
        const said = `${e.stdout ?? ""}${e.stderr ?? ""}`.replace(/\x1B\[[0-9;]*m/g, "").trim();
        const failure = new Error(said || `wrangler ${args[0]} failed`);
        failure.said = said;
        throw failure;
    }
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
    // The deployed server should have its own key, so it can be revoked without
    // breaking local work. .prod.vars is preferred, .dev.vars is the fallback.
    const readKey = file => {
        const path = join(here, file);
        if (!existsSync(path)) return null;
        const value = readFileSync(path, "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m)?.[1].trim();
        return !value || value.startsWith("paste-your-") ? null : value;
    };

    const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
    const source = fromEnv ? "the ANTHROPIC_API_KEY in your shell" : readKey(".prod.vars") ? "server/.prod.vars" : readKey(".dev.vars") ? "server/.dev.vars" : null;
    const key = fromEnv || readKey(".prod.vars") || readKey(".dev.vars");

    if (!key) {
        console.error(`
  No key to upload. Give the deployed server its own key, so you can revoke it
  without breaking local development:

      1. Make a new key at https://console.anthropic.com (Settings > API keys)
      2. cp .prod.vars.example .prod.vars   and paste it in
      3. npm run release

  Or upload one by hand with: npx wrangler secret put ANTHROPIC_API_KEY
`);
        process.exit(1);
    }
    // Falling back to the development key is a decision, not a default: it puts the key
    // you use locally behind a public URL, so revoking the public one breaks local work.
    if (source === "server/.dev.vars" && !process.argv.includes("--allow-dev-key")) {
        console.error(`
  Refusing to put your development key on a public server.

  Give the deployed server its own key, so it can be revoked on its own:

      1. Make a new key at https://console.anthropic.com (Settings > API keys)
      2. cp .prod.vars.example .prod.vars   and paste it in
      3. npm run release

  If you really do want to use the development key, run:

      npm run release -- --allow-dev-key
`);
        process.exit(1);
    }
    if (source === "server/.dev.vars") {
        console.warn("  warning: using your local development key on a public server.");
    }
    wrangler(["secret", "put", "ANTHROPIC_API_KEY"], { input: key }); // never printed
    done(`uploaded from ${source}`);
}

// --- 4. deploy -----------------------------------------------------------------------
step("Deploying");
let output;
try {
    output = wrangler(["deploy"], { quiet: true });
} catch (e) {
    if (/workers\.dev subdomain/i.test(e.said ?? "")) {
        const account = (who.match(/\b[0-9a-f]{32}\b/) ?? [""])[0];
        console.error(`
  Your Cloudflare account has no workers.dev subdomain yet, so there is nowhere
  to publish to. This is a one-time account setup and cannot be done from
  wrangler, which has no command for it.

  Open the Workers & Pages page once and Cloudflare creates the subdomain:

      https://dash.cloudflare.com/${account}/workers-and-pages

  Then run this again. The Worker and its key are already uploaded, so only the
  last step is left.
`);
        process.exit(1);
    }
    console.error(`\n  Deploy failed:\n\n${(e.said ?? e.message).split("\n").map(l => "  " + l).join("\n")}\n`);
    process.exit(1);
}
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
