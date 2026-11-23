# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

Someone comparing boards in ten minutes who will type on it eight hours a day needs to see size, feel and sound without jargon. They should feel the confidence of picking up a machined instrument: exact, tactile, unhyped. What is true of this subject and nothing else is that 65 separate mechanical assemblies each have travel, force and sound; the page treats the board as 65 instruments and an audited layer stack, not a slab photo.

**Signature.** The pulled-apart board: keyboard rendered floating over its own exploded ghosts — case, plate, switches, keycaps — with mono callouts and a thin rust 0-4.0mm key-travel ruler. That ruler recurs as the divider for every section, so the act of pressing becomes the wayfinding.

## Composition

12-column grid, 1320px max centered, 24px gutters, 24px side inset at 1440px growing to 48px at 1920px. Body measure capped at 58ch; mono spec values never wrap. First viewport at 1440x900: 28px mono utility strip, 68px nav with wordmark left, anchors center, price plus Buy right, then hero split 7/5. Left 7 cols is product stage 760x560px on dotted engineering grid with large three-quarter board render, floating exploded-layer ghosts beneath and vertical 0-4.0mm travel ruler at right edge. Right 5 cols is 400px buy card with eyebrow, large product name, price row, 4 key-spec mini rows, switch selector dots, 48px rust Buy plus secondary link and mono stock line. Below in order: 4-cell keycap spec strip, 3-column switch options with force curves, bento gallery one large 8-col detail plus two 4-col macros plus one wide side-profile, horizontal whats-in-box tray with 5 cells, full-bleed graphite inverted tech-spec table in 2-column mono rows, split FAQ accordion left plus reviews container right populated only from real data with write-a-review CTA, footer. Density alternates airy choosing zones and dense verifying zones. Signature lives in hero stage exploded stack and repeats as thin rust travel rule dividing every section.

**Narrow screens.** At 390px grid becomes 4 columns. Hero stacks: 340px tall product stage on top with condensed travel ruler, buy card below full-width with sticky price row. Key-spec strip becomes 2x2 keycap grid. Switch cards become horizontal snap-scroll, one card per view. Bento stacks large then smalls, wide profile becomes 16:9 crop. Spec table collapses to single-column definition rows. Sticky 64px buy bar docks bottom with price left and rust CTA right.

## Imagery

Generated raster with studio precision, no people, no lifestyle desks. Light is soft top-left softbox with crisp short shadows to read keycap sculpt. Colors stay desaturated stone grey with single rust accent key to match palette. Hero first screen: one three-quarter overhead of 65% board in light stone with rust Escape, 760x520px on dotted grid, plus code-drawn exploded ghosts beneath, not photos. Gallery below: macro switch stem side-light 640x480px, PBT keycap texture close-up 480x480px, anodized aluminium side profile showing gasket seam wide 1200x420px, coiled cable plus puller and caps tray 640x400px. All crops tight to material, no environment.

## Motion

Nearly still, like a bench tool. Hero exploded layers separate 12px on scroll-in once. Selecting a switch animates its force curve draw and actuation bar from 0 to 2.0mm in 400ms. Sticky buy bar slides up after hero passes. FAQ accordions expand 200ms ease. No autoplay, no parallax drift, full reduced-motion fallback to static.

## Voice

Workbench-confident and terse. Short declarative sentences, millimeters and grams over adjectives. Names the feel and the sound plainly. Never gamer hype, never wellness language, never superlatives without a number.

## What this design refuses

- Dark gamer room with neon RGB glow and floating keyboard on black
- Lifestyle desk-setup hero with plant, monitor and mug staging
- Generic SaaS pricing cards and star-rating testimonial carousel with invented quotes
- Switch selector as bare color dots with no force, travel or sound data
- Oversized lifestyle photography that hides layout size, plate and keycap detail

## Color

Cool machined mist dominates 65% with white cards; graphite inverts only where visitors verify numbers. Kestrel rust is the single strong color, reserved for the act of buying and the act of pressing: price, primary CTA, active switch and the thin actuation line. Dividers and dotted grids use ink at 12% opacity, never a separate tint. Nothing decorative gets color; body text never sits on rust except the 48px buy button and small pills.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #EDEFF2 | #14181D | The page background. |
| `ink` | #14181D | #EDEFF2 | Default text on the canvas. |
| `kestrel-rust` | #9C3608 | #FFFFFF | Buy CTA, price accent, active switch state and 0-4mm actuation line. Small areas only, never large fills. |
| `graphite-panel` | #1A1F26 | #F0F3F5 | Inverted band for tech spec table, box-tray footer and sticky detail. About 20% of page length. |
| `keycap-stone` | #D9DDE2 | #14181D | Secondary cards, spec chips and bento alternates. Matte keycap surface across gallery and switch cards. |
| `moss-ok` | #1F5C3D | #FFFFFF | In-stock dot, connectivity checks and small status pills only. Never for headlines or backgrounds. |

## Type

- Display: Chakra Petch, weights 600/700.
- Body: Archivo, weights 400/500/600.
- Utility: Fira Code, weights 400/500.

Display carries product name and section heads: Chakra Petch 600-700 uppercase, tight -0.02em, line-height 0.95. Largest hero name 76-84px, section heads 40-48px, card heads 22px. Body is Archivo 15-16px/1.6 regular, medium for labels, max 58ch. Utility is Fira Code for legends and data: 11px uppercase +0.14em tracking for eyebrows and key labels, 13px for spec values and table rows with 1.5 line-height. Hierarchy by scale and weight contrast, never by color alone.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Chakra_Petch, Archivo, Fira_Code } from "next/font/google";

const display = Chakra_Petch({ subsets: ["latin"], variable: "--display-font", display: "swap", weight: ["600","700"] });
const body = Archivo({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = Fira_Code({ subsets: ["latin"], variable: "--utility-font", display: "swap" });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), sans-serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 10px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Matte machined surfaces, no glass or glow. Regions separated by 1px ink-at-12% hairlines and dotted engineering grids, not shadows. Cards are white or keycap-stone with 1px border and 10px radius plus a 2px bottom edge to suggest keycap thickness. Buttons are solid rust 10px radius, 48px tall with white bold label; secondary is 1px outline. Keycap spec cells have 6px radius and bottom shadow. Inputs and accordions are square-cut 10px with hairline borders.

## Visual study

/api/assets/72b0191f-98d4-4b29-9be3-84fbd2fd647b

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `003` — /api/assets/887dc0a8-e23c-4c70-a47c-47d126d9fdfa
- Frame 2: image `125` — /api/assets/88fe9cdb-63db-4122-a2e4-039f31eeab0b — Surround a central product with exploded axonometric layer callouts and fine measurement ticks, keeping hierarchy technical and centered.
- Frame 3: image `118` — /api/assets/0c30808a-1e56-4ba6-921f-a1eeabeda113 — Organize detail features as a bento of mixed-size matte cards with strict padding rhythm, one large visual plus smaller solids.
