# Restaurant Premium V3 — Visual Pack

Template-owned concept photography for demos when the prospect has no images.

## Coherence (design-family requirement)

A design family must use a **coherent visual pack**, not a collage of unrelated stock.

Every asset in one pack should share:

- same venue type (e.g. contemporary fine-casual Italian);
- same photographic palette (warm neutrals / shared white-balance);
- coherent lighting (golden / soft evening, not mixed daylight vs neon);
- coherent styling (tableware, interiors, plating language).

**Current pack status:** files are aesthetically strong individually but come from **different locations / moods**. Treat them as a **concept placeholder pack**, not the final commercial coherent pack. Do **not** replace with random Unsplash downloads until a curated coherent set exists.

## Ownership boundary

| Source | Use |
|--------|-----|
| **Template-owned pack** (`/restaurant-premium-v3/assets/*`) | Fallback imagery for the design family when the lead has no photos |
| **Lead-owned imagery** | Prospect photos / logo / hero overrides stored on the demo instance |

Never present template-owned photos as “photos of your restaurant”.

## License

Images sourced from [Unsplash](https://unsplash.com/license) (Unsplash License — free to use commercially).

## Files

| File | Role |
|------|------|
| `hero.jpg` | Immersive hero (LCP candidate — prefer Next Image / responsive) |
| `interior.jpg` | Editorial intro / split |
| `food-detail.jpg` | Experience / detail crop |
| `table.jpg` | Storytelling / booking mood |
| `atmosphere.jpg` | Final CTA backdrop |
| `gallery-1.jpg` … `gallery-3.jpg` | Asymmetric gallery fallbacks |

## Future packs

Ship coherent packs as named folders (e.g. `packs/fine-casual-warm/`) and point `RESTAURANT_PREMIUM_V3_ASSETS` at one pack key. Keep lead-owned overrides outside the pack.
