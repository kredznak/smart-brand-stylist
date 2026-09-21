# AI helper server

The add-on's AI features (copy suggestions, matching fonts to a logo) call this small server, and the server calls Claude. This keeps your Anthropic API key out of the add-on, where anyone could read it.

It also reads websites. When someone types their address on the upload screen, the panel cannot fetch the page itself — an add-on panel is a sandboxed iframe and the browser blocks it from reading another site — so this server visits the page and returns the colors and font families it found. `src/site.js` does that work; no AI and no API key are involved, so it keeps working before you add a key.

Only public addresses are accepted. Loopback, private and link-local ranges are refused so the endpoint cannot be used to reach machines that the caller could not reach directly.

## Run it locally

You need an Anthropic API key from https://console.anthropic.com (Settings > API keys).

```bash
cd ~/Documents/smart-brand-stylist/server
npm install
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` in VS Code and replace `paste-your-key-here` with your key. Then:

```bash
npm run dev
```

Leave it running. It listens on http://localhost:8787, which is what the add-on is set to use (`src/ui/config.ts`). You now have two terminals running: this one, and `npm run start` for the add-on.

Never commit `.dev.vars`. It is already in `.gitignore`.

## Deploy it (needed before submitting to Adobe)

Reviewers and real users cannot reach your laptop, so the server has to be online. With a free Cloudflare account, sign in once:

```bash
cd server
npx wrangler login
```

That opens a browser. Then:

```bash
npm run release
```

which creates the `USAGE` store and writes its id into `wrangler.toml`, uploads your API key as a secret, deploys, and sets `PRODUCTION_API_BASE` in `src/ui/config.ts` to the URL it got back.

Give the deployed server **its own API key**, so the public one can be revoked without breaking your local work. Make a second key at https://console.anthropic.com, then:

```bash
cp .prod.vars.example .prod.vars
```

and paste it in. `.prod.vars` is gitignored, like `.dev.vars`. The script prefers `ANTHROPIC_API_KEY` from your shell, then `.prod.vars`, then `.dev.vars`, and warns if it falls back to your development key. Then rebuild the add-on from the project root with `npm run build`, and commit the two changed files.

Run it as often as you like: anything already done is detected and left alone.

It exists because two of those steps used to be copied by hand — the store id into `wrangler.toml`, and the deployed URL into `src/ui/config.ts`. Both fail silently when they go wrong, because the add-on still builds and only breaks once somebody uses it.

Local testing keeps using `http://localhost:8787` whatever this is set to, so you never have to switch it back.

## Usage limits

The add-on is free to its users, so every Claude call is paid for by whoever deploys this. Three limits keep that bill predictable, and all of them are already in the code.

| Limit | Default | Where to change it |
| --- | --- | --- |
| Burst, per caller | 10 requests/minute | `[[unsafe.bindings]]` in `wrangler.toml` |
| Claude requests, per caller per day | 60 | `DAILY_LIMIT` in `wrangler.toml` |
| Website reads, per caller per day | 200 | `DAILY_SITE_LIMIT` in `wrangler.toml` |

Claude requests and website reads are counted separately, because reading a page costs nothing but bandwidth while asking Claude costs money. A day spent trying out websites therefore cannot use up the AI budget, and each refusal names the allowance that actually ran out.

Callers are identified by IP address (`CF-Connecting-IP`). The daily counters live in the `USAGE` KV namespace under `<date>:<quota>:<ip>` and expire after 48 hours. The counter is read-then-write rather than atomic, so a simultaneous burst can overshoot a limit slightly; that is deliberate, since the alternative costs a durable object for no real benefit at this scale.

Requests that never reach a handler — unknown paths, CORS preflights — do not consume an allowance.

If you want a layer that runs before the Worker does, add a Cloudflare WAF rate-limiting rule in the dashboard under **Security > WAF > Rate limiting rules**.

## Cap your Anthropic spend

The usage limits above are per caller, so enough callers can still add up. Put a hard ceiling on the account itself:

1. Go to https://console.anthropic.com > **Settings** > **Limits**.
2. Set a **monthly spend limit**. Start low; you can raise it once you see real usage.
3. On the same page set **email alerts** at a fraction of that, so you hear about it before the cap is hit rather than when suggestions stop working.
4. Give the deployed server its own **API key** (Settings > API keys) in `server/.prod.vars`, rather than reusing your development one, so you can revoke the public key on its own.

Do this **before** deploying, not after. Once the server is online, anyone with its address can spend against that key, and the per-caller limits in the Worker are per IP address.

Worth knowing: when the cap is reached, Anthropic starts refusing requests and the add-on shows "The AI service returned an error. Please try again." Nothing breaks, but the AI features stop until the next month or until you raise the cap.

## Privacy policy

Adobe asks for a privacy policy URL when you submit an add-on. There is a complete draft in [`PRIVACY.md`](../PRIVACY.md) at the root of this repository, written to match what the code actually does. Publish it somewhere public — GitHub Pages, or your own site — and give Adobe that URL.

Read it before you publish it. It is accurate as of this commit, and it will stop being accurate if you change what gets sent to the server, add analytics, or start storing anything. It is a starting point written by a developer, not legal advice.
