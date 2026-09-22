# Listing assets

Artwork for the Adobe add-on submission form, not for the add-on bundle.

A `manifestVersion: 2` manifest has no `icon` field — the SDK's own manifest class only
reads one for version 1, and returns `undefined` otherwise. Icons are uploaded to the
distribution portal when creating the listing, so these files stay out of `src/` and out
of `dist.zip`.

| File | Use |
| --- | --- |
| `icon-144.png` | **the one you upload** |
| `icon-64.png` | preview only: how it looks as the panel header icon |
| `icon-36.png` | preview only: how it looks minimized |

Adobe takes a single 144 px icon and resizes it into the 36 px and 64 px versions itself,
so only `icon-144.png` is uploaded. The other two are here to check that the mark still
reads at those sizes before you submit.

All three are the brand mark on the dark panel background. The mark on its own is white
on transparency, which disappears against Adobe's light interface, so it is composited
onto `#17171c` with rounded corners.

To regenerate after changing `src/logo.png`, render it centred on a 288px dark rounded
square and downscale to 36, 64 and 144.

The text for every other field on the submission form is in [`LISTING.md`](LISTING.md).
