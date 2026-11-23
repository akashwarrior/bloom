# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

The weekend bake as a numbered counter ticket that sells out. The page behaves like the bake list pinned by the till: what is baking, how many are left, when the list closes Friday, when you collect. Visitors should feel welcomed like regulars but nudged to decide, because once the number is gone it is gone. The visual point of view is standing at the counter reading tomorrow's card, not browsing a catalogue.

**Signature.** The weekend bake presented as a numbered list with living loaf counts: five tilted loaf tickets orbiting the headline, each stamped No.1 to No.5, repeated as a ledger where dotted leaders join each bread name to its price and a mono loaves-left badge counts down.

## Composition

Desktop 1440: content column 1200px centered with 48px gutters; ticker and hearth bands bleed full width. First viewport 900px tall: 76px top bar with wordmark left, pickup window center, Reserve button right. Centered hero stack with utility deadline line, 2-line display headline, 2-sentence story hook, two-button row. Five small loaf vignettes orbit the type at page edges, two left and three right, 160-220px each, slightly rotated with mono captions. A 44px butter ticker pins the bottom of the viewport. Below: weekend lineup with section head plus 4-across ledger cards; hearth how-it-works band with 3 equal columns numbered 01-03 and hairline dividers; pickup split with address plus hours table left and 50 percent daylight shop counter photo right; reserve slip as 2-column form panel 880px wide centered, loaves with steppers left and contact plus pickup-day toggle plus submit right; compact footer. Density airy at top, densest in lineup and form, calm at pickup. Signature orbit plus numbered bake list lives in hero and lineup.

**Narrow screens.** At 390px the orbit collapses: headline and CTAs stay top, five vignettes become a horizontal snap-scroll strip of 132px thumbs below the buttons. Lineup 4-across becomes single stacked ledger cards with sticky price and stepper rows. Hearth steps stack vertically with larger numerals. Pickup split stacks map-text above photo. Reserve slip becomes single column with pickup-day toggle full width and submit pinned reachable. Ticker stays but shortens.

## Imagery

Generated raster food photography only, no illustration. Style: daylight, linen and light wood, tight top-down or 45-degree crops, visible crust texture and flour dust, backgrounds tinted to dough and butter tones so photos sit in the palette. First screen needs five small vignettes, each 160-220px square with 12px radius: country sourdough boule, baguette pair tied in paper, dark rye loaf sliced, rosemary focaccia slab, morning bun tray. Each carries a mono caption like No.1. Lineup reuses larger 4:3 versions of the same loaves. Pickup section uses one wide 640x480px shop counter with bread shelves in morning light. No people close-ups, no wheat fields.

## Motion

Quiet and useful. Butter ticker marquees slowly at 20s per loop. Vignettes drift 6px on a 7s ease loop with staggered delays, pausing on hover. Cards lift 4px and shadow deepens on hover. Quantity steppers pop the loaves-left number. Sections fade-up 16px once on entry. Respects prefers-reduced-motion with all loops off. Nothing ever covers or crosses readable text.

## Voice

Plainspoken neighbour, warm and exact. Short sentences, real numbers and real times: what is baked, how many, by when, where to collect. Helpful urgency without hype. Never says artisanal, curated, elevated, journey, or community as a buzzword.

## What this design refuses

- Kraft-paper background with script logo and wheat icon
- Chalkboard menu texture with hand-drawn dividers everywhere
- Full-bleed wheat-field hero with white text over it
- Generic bakery grid of identical cards with no counts or deadline
- Invented reviews, press logos or star ratings near the order button

## Color

Warm paper dominates 70 percent so the page feels like flour-dusted counter paper. Dough card fills add a second light layer for things you can order. Hearth dark appears once in the middle to mark the process step and again in the footer, giving rhythm. Crust burnt-orange is rare and always means action or urgency: reserve buttons, prices, Friday cutoff. Butter yellow is rarest, used as highlighter and ticker ground. No other color is allowed; photography carries all other hue.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #FFF6E9 | #2B1A10 | The page background. |
| `ink` | #2B1A10 | #FFF6E9 | Default text on the canvas. |
| `crust` | #A83A0C | #FFFFFF | Primary reserve buttons, price figures, Friday deadline flags and loaves-left warnings. Small areas only, never a page background. |
| `hearth` | #2A1A0F | #FFF6E9 | Dark how-it-works band, pickup hours table header and footer. One full-bleed band plus footer, about a quarter of page length. |
| `butter` | #F4C84B | #2B1A10 | Marquee ticker strip, highlight swashes under key words and small quantity badges. Thin lines and chips only. |
| `dough` | #EADDC6 | #2B1A10 | Lineup cards and order-slip form surface to lift them off the canvas. Card fills and form panels. |

## Type

- Display: Fraunces, weights 600/700, with italics.
- Body: Public Sans, weights 400/500/700.
- Utility: Space Mono, weights 400/700.

Display Fraunces 600 carries headlines and bread names: hero 80px line-height 0.95 letter-spacing -0.02em, section heads 40px/1.0, bread names 22px/1.1. Italic used only for one accent word per headline. Body Public Sans 17px/1.6, max 58ch, 400 regular with 700 for emphasis. Utility Space Mono 11-12px uppercase tracking 0.14em for deadline line, captions, prices in small contexts, buttons 13px/700 uppercase; large prices set in Fraunces 24px. Hierarchy comes from size and weight contrast, never from color alone.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Fraunces, Public_Sans, Space_Mono } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--display-font", display: "swap", style: ["normal","italic"] });
const body = Public_Sans({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = Space_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","700"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 14px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Soft neighbourhood utility: 14px radius on cards, images and inputs; pill 999px on primary Reserve buttons and pickup-day toggle. Cards have 1px solid ink at 14 percent plus a soft 0 12px 28px rgba(42,26,15,0.10) shadow, no hard borders. Sections separated by dashed order-slip dividers and generous whitespace, not boxes. Buttons are solid crust with white mono-uppercase labels; inputs are white with 1.5px ink-border that turns crust on focus.

## Visual study

/api/assets/33ed0d96-ba3f-4d65-b365-97192e30ada5

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `061` — /api/assets/bcac8d88-7711-4e60-a639-cc1cd3d28aca — Centered headline ringed by small peripheral vignette images on a dotted field; borrow the orbit of small annotated visuals around one central message.
- Frame 2: image `089` — /api/assets/165ddb8c-2c1b-4176-8fdf-e16dbfd070a0
- Frame 3: image `046` — /api/assets/aabb9592-0feb-4a0e-8acb-61f2a9cc7dfa
