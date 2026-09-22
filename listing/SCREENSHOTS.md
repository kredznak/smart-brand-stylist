# Capturing the listing screenshots

Adobe needs at least one promotional image and recommends **1360 x 800**, PNG or JPG.
Five are planned; the shot list is in [`LISTING.md`](LISTING.md).

Capture at whatever size is convenient, drop the files in `listing/screenshots/raw/`,
and run:

```bash
npm run screenshots
```

Each one is scaled to fit and padded out to exactly 1360 x 800 in `listing/screenshots/`.
Upload those, never the raw ones. The tool warns when a capture was too small (it will
look soft) or too far from 17:10 (it will sit in thick bars).

---

## 1. Set up a demo brand, once

Every shot uses the same document, so this is done once and all five come out consistent.

**Use `src/logo.png` as the brand.** It is the add-on's own mark, so there is no question
about using someone else's trademark in a store listing — which there would be if the
screenshots showed a real company's logo or website being taken apart. Avoid typing a
well-known domain into the website field for the same reason.

1. Open a new Express document, something wide like a presentation or a social banner.
2. Open the add-on, choose **Upload a logo**, and pick `src/logo.png`.
3. Let it analyse. You now have a palette and the Colors tab is showing.

## 2. Build a page worth photographing

An empty canvas makes a poor screenshot and makes shot 4 impossible.

Put together something that looks like real work — a few headings, a paragraph, two or
three shapes, maybe an image. Then, deliberately:

- Give **two or three shapes colors that are not in the palette.** Not subtly off: pick
  something clearly different, so the Audit tab has something to find and the before/after
  is obvious to someone scrolling a store listing.
- Set **one text item to a font that is not your brand font**, so the Fonts tab scan has
  something to report.

Shot 4 is the one that fails without this. It is worth doing first.

## 3. Size the window

1360 x 800 is 17:10, which no browser window is by default, so captures end up in bars.
Setting the window first means almost no padding. With Express open in front:

```bash
osascript -e 'tell application "Google Chrome" to set bounds of front window to {100, 100, 1460, 900}'
```

For Safari, swap the application name. On a Retina display this captures at 2720 x 1600,
which scales down to exactly 1360 x 800 with no padding at all.

Then capture the window with **Cmd+Shift+4, then Space**, and click the window.

## 4. Take the five

Name them so they sort into the order they should appear in the listing:

| File | Screen | Make sure this is visible |
| --- | --- | --- |
| `1-upload.png` | Upload screen | Both halves: the logo picker **and** the website field. This is the first thing a new user sees. |
| `2-colors.png` | Colors tab | The palette, the harmony dropdown, and the shape on canvas that just took a color. |
| `3-fonts.png` | Fonts tab | Heading and body fonts, a pairing suggestion, and canvas text set in that font. |
| `4-audit.png` | Audit tab | A finished scan: off-brand swatches listed, each showing the brand color it would become, and the fix button. |
| `5-copy.png` | Copy tab | Generated headlines next to the document they were written for. |

Show the whole Express window with the panel open, not the panel cropped out on its own.
The guidelines ask that screenshots represent the add-on's real functionality and
appearance, and a floating panel with no canvas shows neither.

## 5. Check before you upload

- **Nothing personal in frame** — these go in a public store. No email address in the
  Express avatar menu, no bookmarks bar, no other tabs with readable titles, no
  notifications. Hide the bookmarks bar with Cmd+Shift+B.
- **No other company's brand** — no third-party logo on the canvas, no recognisable
  domain in the website field.
- **The status line reads sensibly.** It sits under the tabs and says what just happened
  ("Applied #635BFF to 1 item"). A screenshot showing an error, or "nothing selected",
  reads as broken.
- **Run `npm run screenshots` and read the warnings**, then open the results at full size
  and check nothing important sits in the padding.

## Why the tool exists

`sips --padToHeightWidth` crops instead of padding when the image is bigger than the
target, and `--resampleHeightWidthMax` only constrains the longer side — so the obvious
two-command version scales a wide capture to 1360 wide, leaves it 850 tall, and then
quietly loses 50 pixels off it. The tool computes the scale against both sides first.
