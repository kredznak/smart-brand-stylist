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

### Changing the key later

`wrangler secret list` returns names, never values, so the script cannot tell a key you
have just put in `.prod.vars` from the one already on the server — it sees the name is
taken and leaves it alone. To replace it, say so:

```bash
npm run release -- --rotate-key
```

Without that flag a new key in `.prod.vars` is read, found to be unnecessary, and
silently ignored, and the server keeps running the old one.

It exists because two of those steps used to be copied by hand — the store id into `wrangler.toml`, and the deployed URL into `src/ui/config.ts`. Both fail silently when they go wrong, because the add-on still builds and only breaks once somebody uses it.

Local testing keeps using `http://localhost:8787` whatever this is set to, so you never have to switch it back.

## Usage limits

The add-on is free to its users, so every Claude call is paid for by whoever deploys this. Three limits are in the code to keep that bill predictable. Read the caveats below before relying on them: as of 2026-09-25 the burst limit does not enforce at all, and the daily counters undercount parallel requests. The ceiling that actually holds is the Anthropic spend limit in the next section.

| Limit | Default | Where to change it |
| --- | --- | --- |
| Burst, per caller | 10 requests/minute — **not enforcing, see below** | `[[ratelimits]]` in `wrangler.toml` |
| Claude requests, per caller per day | 60 | `DAILY_LIMIT` in `wrangler.toml` |
| Website reads, per caller per day | 200 | `DAILY_SITE_LIMIT` in `wrangler.toml` |

Claude requests and website reads are counted separately, because reading a page costs nothing but bandwidth while asking Claude costs money. A day spent trying out websites therefore cannot use up the AI budget, and each refusal names the allowance that actually ran out.

Callers are identified by IP address (`CF-Connecting-IP`). The daily counters live in the `USAGE` KV namespace under `<date>:<quota>:<ip>` and expire after 48 hours. The counter is read-then-write rather than atomic, and the overshoot is not slight: thirty requests sent in parallel were measured incrementing it by one, because each read the same value before any of them wrote. Sequential traffic is counted exactly. Counting parallel traffic properly needs a durable object, which is a paid-plan feature.

Requests that never reach a handler — unknown paths, CORS preflights — do not consume an allowance.

### The burst limit does not enforce

Measured on 2026-09-25 against the deployed Worker: 58 requests from one IP address inside one Cloudflare location, not one of them refused with a 429. The binding is not missing. `wrangler versions view` lists it as `env.BURST (10 requests/60s)  Rate Limit`, the runtime calls `limit()` without throwing, and it returns success every time. The same configuration refuses at the eleventh request under `npm run dev`, so the syntax is right. Changing `namespace_id` off Cloudflare's example `1001` made no difference.

This has already failed once before, differently. The binding was first declared as `[[unsafe.bindings]]` with `type = "ratelimit"`, which also attached, also reported itself correctly, and also never refused anything. Treat a rate limit binding as unproven until you have watched it return a 429 from the deployed server; local dev enforced both broken versions quite happily, which is what made them look fine.

A Cloudflare WAF rate-limiting rule runs before the Worker, but **it cannot protect a `workers.dev` URL**: that hostname belongs to Cloudflare's zone rather than yours, so zone WAF and rate-limiting rules are never evaluated for traffic to it. Using one means putting the Worker on a custom domain in your own Cloudflare account, which is also Cloudflare's advice for anything beyond a hobby project.

Until one of those is in place, the Anthropic spend limit below is the only ceiling that actually holds.

## Cap your Anthropic spend

The usage limits above are per caller, so enough callers can still add up. Put a hard ceiling on the account itself:

1. Go to https://console.anthropic.com > **Settings** > **Limits**.
2. Set a **monthly spend limit**. Start low; you can raise it once you see real usage.
3. On the same page set **email alerts** at a fraction of that, so you hear about it before the cap is hit rather than when suggestions stop working.
4. Give the deployed server its own **API key** (Settings > API keys) in `server/.prod.vars`, rather than reusing your development one, so you can revoke the public key on its own.

Do this **before** deploying, not after. Once the server is online, anyone with its address can spend against that key. The per-caller limits in the Worker are per IP address and weaker than they look, so treat this as the real limit rather than a backstop.

Worth knowing: when the cap is reached, Anthropic starts refusing requests and the add-on shows "The AI service returned an error. Please try again." Nothing breaks, but the AI features stop until the next month or until you raise the cap.

## Privacy policy

Adobe asks for a privacy policy URL when you submit an add-on. [`PRIVACY.md`](../PRIVACY.md) is the policy, written to match what the code actually does, and `npm run privacy` renders it into `docs/index.html` for publishing.

It is published at **https://kredznak.github.io/smart-brand-stylist/** — that is the URL to give Adobe. GitHub Pages serves it from the `/docs` folder on `main`, so a push updates it. Pages only serves a private repository on a paid plan, which is why this one is public.

Edit `PRIVACY.md`, never `docs/index.html`: the second is generated from the first, so that the published policy and the one in the repository cannot drift apart. Re-run `npm run pages` after editing (it also renders `TERMS.md` and `HELP.md` to `docs/terms.html` and `docs/help.html`).

Read it before you publish it. It is accurate as of this commit, and stops being accurate if you change what is sent to the server, add analytics, or start storing anything. It was written by a developer, not a lawyer.
