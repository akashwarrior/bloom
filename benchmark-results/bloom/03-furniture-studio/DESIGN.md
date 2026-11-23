# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

An architect or homeowner choosing a maker for a decades-long object needs proof of hands, timber and joints. They should feel the calm of a well-swept shop: everything measured, nothing for styling only. What is true of furniture and nothing else is that it is drawn full-scale against the body — seat height, table span, shelf load — cut from once-living stock that still moves. The page reads as a shop drawing come to life: numbered pieces, stated species and finishes, visible joinery.

**Signature.** Shop-drawing measurement drawn live on the page: every piece carries hairline dimension leaders with mono W x D x H, species and finish, plus a stamped oak piece number (No.04) that follows the work from gallery to detail drawer to commission form.

## Composition

12-column grid, 1320px max centered with 32px gutters; paper fills full viewport width, content held inside. First viewport at 1440x900: 72px header with wordmark left, mono index center, commission button right on 1px rule. Below, split hero: left 5 cols holds maker identity — small mono shop line, 76px headline, 18px standfirst, two buttons, location/est. strip; right 7 cols holds full-height chair portrait edge-to-edge to viewport edge with code-drawn dimension leaders and spec chip. Scroll order: A selected works cut-list (8 pieces, alternating 7-col image / 5-col spec rows with stamped No.01-08), B dark walnut process band (4 numbered steps in 4 cols with small process photos), C materials board (6 swatches in 6 cols with grain images), D studio split (5-col shop portrait + 7-col bio and principles), E commission split (7-col inquiry form + 5-col visit card with hours and directions), F walnut footer with large wordmark. Signature lives on every work image as dimension leaders.

**Narrow screens.** Split hero stacks: headline and CTAs first, hero image full-bleed 390px wide with simplified single dimension line, spec chip below. Works rows become single column image over spec. Process 4 cols become vertical numbered list. Materials 6 cols become 2-col swipeable grid. Form and visit stack with visit card first on tap-to-call.

## Imagery

Generated raster photography only, no illustration. Subjects: finished chairs, tables, shelving and small lighting-adjacent objects in daylight rooms plus close hands, shavings, chisels, half-built frames. Light: soft north daylight, matte, true timber color against paper, no studio gloss. Framing: objects at three-quarter full view with breathing room for leader lines; details at 1:1 crop of joints and grain. First screen needs two images: hero portrait of signature lounge chair in oak (about 720x860px, right-bleed) and small inset detail of arm joint (about 220x160px, bottom-left of hero).

## Motion

Almost still, like timber. Dimension leaders draw once when a work enters view (400ms line grow). Images fade in with 8px rise on scroll. Project detail slides as right drawer, not modal pop. No parallax, no carousel autoplay, no hover theatrics; focus rings and button fills are the only instant feedback.

## Voice

Plain shop talk. Short measured sentences, stated facts: species, size, finish, years. Names trees and joints correctly. Never says passion, bespoke luxury, curated, story, or exclamation-led sales copy.

## What this design refuses

- Featherweight white gallery with tiny centered chairs and endless whitespace and no materials or dimensions
- Pinterest masonry of unsized images with hover-only titles and filter pills
- Faux-rustic distressed wood backgrounds, script lettering, or crafted-with-passion copy
- Invented testimonials, star ratings, stockist logo rows or press quotes to fill space

## Color

Warm sawdust paper dominates; walnut ink carries text. Page alternates paper and one deep walnut band for process so contrast comes from density, not color. Stone holds cards and inputs. Oak is rare and strong: stamps, numbers, joinery marks. Work blue is reserved for measurement lines, links and actions only, never decoration. No color sits behind long passages except walnut band with cream text.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #EDE8DB | #201A14 | The page background. |
| `ink` | #201A14 | #EDE8DB | Default text on the canvas. |
| `walnut` | #2A211A | #F5F0E6 | Footer, process band, and project detail drawer background. Occupies about 20% of page as deep contrast bands. |
| `oak` | #C68A3D | #201A14 | Small marks only: piece numbers, rules, active states, form focus, stamps. Never large fills, max 5% of page. |
| `workblue` | #243D68 | #FFFFFF | Links, dimension leaders, buttons on light, and inquiry accents. The only cool color, used sparingly for measurement. |
| `stone` | #DDD5C3 | #201A14 | Secondary surfaces: work cards, material swatches, dividers, input fills, spec chips. About 25% of page. |

## Type

- Display: Vollkorn, weights 400/500/600.
- Body: Karla, weights 400/500/700.
- Utility: Space Mono, weights 400/700.

Display Vollkorn 500 for headlines: hero 76px/0.95 tight, section titles 44px/1.0, work names 28px/1.05; italic used only for timber names. Body Karla 400/500: 18px/1.6 standfirst max 34ch, 16px/1.6 running max 62ch. Utility Space Mono 400/700: 11px uppercase tracking 0.08em for labels, dimensions, piece numbers and buttons; smallest 11px, largest 76px, steps 11/13/16/18/28/44/76. Weight contrast carries hierarchy, never all-caps paragraphs.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Vollkorn, Karla, Space_Mono } from "next/font/google";

const display = Vollkorn({ subsets: ["latin"], variable: "--display-font", display: "swap" });
const body = Karla({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = Space_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","700"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: no single radius; follow the treatment below.
- Controls: a standard button, field and select is 40px tall.

Cut-timber edges: 3px radius on cards, inputs and buttons; 1px walnut rules separate every region, no shadows or blur. Work cards sit on stone with 1px border and flush image. Detail drawer is solid walnut with cream text. Controls are rectangular workwear style: 48px high fields and buttons, 1px border, solid fill on primary, mono uppercase labels. Texture is flat paper, no grain overlay.

## Visual study

/api/assets/7f88f2a2-d062-4c3b-8772-32c8c1588185

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `104` — /api/assets/377193c5-bd09-4a02-ad39-d2fc930b9842
- Frame 2: image `099` — /api/assets/7b0aab11-d7b7-4d18-9a2a-25d7e5cff159 — Hairline leader-line annotation over full-bleed object photography with small mono spec labels pinned to features.
- Frame 3: image `066` — /api/assets/6544448d-fcf5-412e-9cd1-b70d3b75c9e9 — Split first viewport: calm statement and actions left, working instrument view right.
