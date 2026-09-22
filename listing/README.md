# Listing assets

Artwork for the Adobe add-on submission form, not for the add-on bundle.

A `manifestVersion: 2` manifest has no `icon` field — the SDK's own manifest class only
reads one for version 1, and returns `undefined` otherwise. Icons are uploaded to the
distribution portal when creating the listing, so these files stay out of `src/` and out
of `dist.zip`.

| File | Use |
| --- | --- |
| `icon-36.png` | smallest size Adobe asks for |
| `icon-64.png` | mid size |
| `icon-144.png` | listing tile |

All three are the brand mark on the dark panel background. The mark on its own is white
on transparency, which disappears against Adobe's light interface, so it is composited
onto `#17171c` with rounded corners.

To regenerate after changing `src/logo.png`, render it centred on a 288px dark rounded
square and downscale to 36, 64 and 144.
