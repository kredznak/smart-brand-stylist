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

Reviewers and real users cannot reach your laptop, so the server has to be online. With a free Cloudflare account:

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

Wrangler prints a URL like `https://smart-brand-stylist-api.<you>.workers.dev`. Paste it into `src/ui/config.ts` as `PRODUCTION_API_BASE`, then rebuild the add-on. Local testing keeps using `http://localhost:8787` automatically, so you do not have to switch this back and forth.

## Before going public

- Add rate limiting (Cloudflare dashboard > Security > WAF > Rate limiting rules) so nobody can run up your API bill.
- Set a monthly spend limit in the Anthropic console.
- Write a privacy policy that says brand details and the logo image are sent to this server and to Anthropic to generate suggestions, and are not stored.
