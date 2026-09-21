# Smart Brand Stylist

An Adobe Express add-on: turn a logo **or a website** into a brand kit (colors and fonts), get AI copy suggestions, and find and fix off-brand colors and fonts on the page.

## Run it (first time)

Open this folder in VS Code, then in the VS Code terminal:

```bash
npm install
npm run build
npm run start
```

The first `npm run start` asks to set up a local SSL certificate. Choose **Automatically** and enter your Mac password when asked. Leave the terminal running.

## Load it in Adobe Express

1. Go to https://express.adobe.com and open any document.
2. One time only: click your avatar (top right) > Settings > turn on **Add-on Development** and accept the developer terms.
3. In the left rail click **Add-ons**, switch on **Add-on Development** (top right of that panel), then **Test your local add-on**.
4. Keep the URL as `https://localhost:5241`, tick the checkbox, and click **Connect**.

Edits you save in `src/` reload automatically.

## Where things are

| Path | What it does |
| --- | --- |
| `src/ui/components/App.tsx` | Screens, Colors tab and Audit tab |
| `src/ui/components/FontsTab.tsx` | Brand fonts, pairings, font audit |
| `src/ui/components/CopyTab.tsx` | AI copy suggestions |
| `src/ui/extractColors.ts` | Pulls colors out of a logo, on the user's device |
| `src/shared/color.ts` | Palette building shared by the logo and website paths |
| `src/ui/fontCatalog.ts` | Suggested font pairings |
| `src/ui/config.ts` | Address of the AI helper server |
| `server/` | AI helper server, and the website reader (see `server/README.md`) |
| `src/sandbox/code.ts` | Reads and edits the Express document |
| `src/shared/color.ts` | Palette generation, color distance, contrast |
| `src/shared/DocumentSandboxApi.ts` | The contract between the panel and the sandbox |
| `src/manifest.json` | Add-on name, version, entry points |

## Package for submission

```bash
npm run package
```

This creates `dist.zip`, which is what you upload in the Adobe Express add-on distribution flow.
