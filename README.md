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

Edits you save in `src/` reload the panel automatically. The document sandbox (`src/sandbox/code.ts`) does not always reload with it, even after a page refresh; when that happens the panel shows a red notice that Express is running an older version. Toggle **Test your local add-on** off and on again (or click **Connect** again) to force it.

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

## Working on the document sandbox

`src/sandbox/code.ts` runs inside Express, not in the browser, and a few things there are not obvious:

- **Experimental APIs throw at runtime.** Anything marked `@experimental` in the SDK typings (and some things that are not marked, such as `selectionIncludingNonEditable`) throws "Experimental APIs are not supported" unless the manifest opts in, and that opt-in is not allowed in a submitted add-on. `allDescendants` is one: walk `children` instead (see `walk()` in `code.ts`).
- **Read the selection before any `await`.** The first press in the panel after selecting on the canvas can arrive while Express reports no selection at all. The panel waits for it (`src/ui/selection.ts`) and shows what Express currently sees under the tabs.
- **Don't rely on the value `keepContentActiveDuringAsync` passes to its callback.** Capture what the async lambda produced in a closure instead; inside Express the argument has not reliably been that value.
- **Keep sandbox calls synchronous where you can.** Applying a font loads it in one call (`loadFont`) and applies it in a second, synchronous one, like applying a color. A stalled call otherwise leaves the panel silent.
- **A red notice means the sandbox is stale.** The panel and sandbox carry the same build id; if Express is still running an older sandbox after a reload, the panel says so. Reconnect the add-on to force it.

## Package for submission

```bash
npm run package
```

This creates `dist.zip`, which is what you upload in the Adobe Express add-on distribution flow.
