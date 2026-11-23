# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A Portland small-batch roastery at night: wet street outside, ember heat inside. The visitor is choosing beans to taste and a place to visit, not reading a manual. They should feel awake, hungry and let in on something working. What is true of roasting and nothing else is transformation by timed heat — green to gold to brown — and that flavor can be coded like heat levels. The page is a surface to buy from: loud poster type, color-coded slabs for each lot, and a working roast board, not a document to study.

**Signature.** The flavor board: four towering solid-color slabs — parchment, marigold, berry and pale sage — each with a giant condensed coffee name, pill tasting chips and a five-dot roast meter, sitting under a full-width ember-night poster headline and a live roast-date ticker.

## Composition

Full-bleed dark page, inner max 1360px centered, 12 columns, 24px gutters, 24px side inset at 1440 growing to 48px at 1920. Body copy never exceeds 62ch; headlines bleed to grid edge. First viewport 1440x900: 30px mono ticker bar (roast date / Portland address / three lot names, marquee). 72px nav row: condensed wordmark left, four text links center, ember pill Order Beans right. Hero headline in three stacked uppercase lines spanning all 12 cols, 132px at 1440 up to 168px at 1920, line-height 0.86. Below it a 3-part row: left 4 cols intro paragraph plus two pill CTAs stacked; center 4 cols hero roaster photo 520x640 hard-cropped; right 4 cols Roast Board list with three rows (lot name, roast dots, price). Region 2 lineup: four equal solid slabs in one row, each 320x520, each a flat field (parchment, marigold, berry, forest-light variant) with name, origin, chip row, dot meter, price and pill button. Region 3 philosophy: parchment band, left 5 cols sticky statement 48px, right 7 cols three sourcing steps plus farm table. Region 4 sourcing: forest band with four farm rows and two images. Region 5 visit: parchment band with hours/address timetable left and storefront photo right. Region 6 ember subscribe band 320px tall with plan toggle. Footer dark 240px. Signature lives in hero headline + ticker and the four color slabs.

**Narrow screens.** At 390px ticker stays 30px single-line marquee. Nav collapses to wordmark plus Order pill; links move to footer. Headline stacks three lines at 22vw, 0.88 leading. Hero 3-col row becomes: intro plus CTAs, then hero image full-width 343x420, then roast board as horizontal snap-scroll cards. Four slabs stack full-bleed vertical, each 343x440. Timetable rows become 2-line blocks; storefront photo full-width. Subscribe toggle becomes stacked radio cards.

## Imagery

Flash-lit raster photography only, warm high-contrast, light grain, no illustration and no latte-art cliches. Hero: Probat drum roaster with orange glow and operator silhouette in dark roast room, portrait 520x640 hard edge, fills center hero column. Sourcing: hands holding green coffee in burlap tray and misty farm rows, two images 640x420 side by side. Visit: rainy Portland storefront at dusk with lit windows, landscape 680x460. All photos sit in square 6px frames with no overlay; type never sits on photos except a small mono caption chip in a corner. Page carries itself otherwise with poster type and solid color slabs.

## Motion

Ticker marquee loops 24s linear, pauses on hover. Hero headline lines rise 24px and fade in staggered 90ms on load. Slabs lift 4px and hard shadow grows on hover 160ms; roast dots fill with scale pop when scrolled into view. Subscribe toggle cross-fades plan detail 200ms. No parallax, no text covered by motion, full reduced-motion fallback to static.

## Voice

Direct and working, short declarative sentences. Names farms, altitudes, processes and roast dates; describes flavor as food, not adjectives. Warm but not folksy. Never says artisan, curated, premium, third-wave, or world-class.

## What this design refuses

- Kraft-paper, burlap, chalkboard and circular badge logos with hand-drawn beans
- Beige minimal cafe grid with latte-art hero and centered serif tagline
- Dense tasting-wheel jargon and roast-curve charts as the way to choose a bag
- Generic white e-commerce product grid with tiny thumbnails and star ratings
- Script accents, faux stamps and promises like artisan or curated without specifics

## Color

Dark roast ground dominates 65%: charcoal-brown canvas holds hero, lineup and footer. Two inverted fields do the heavy lifting: warm parchment for reading (story, visit) and deep forest for sourcing. Strongest color is rationed: ember appears only on two pill CTAs, prices and filled roast dots; marigold and berry appear only as solid fills for two of four coffee slabs to code flavor difference. No gradients, no brown-on-brown text, no color behind body copy except the declared light/dark bands. Dividers are 1px cream at 16% on dark, dark at 14% on light.

The page is designed for dark mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #171310 | #FFF6E6 | The page background. |
| `ink` | #FFF6E6 | #171310 | Default text on the canvas. |
| `ember` | #FF5A1F | #171310 | Primary actions only: order and subscribe buttons, price tags, roast-dot fills. Never as page background, under 5% of page. |
| `parchment` | #EFE6D2 | #171310 | Inverted bands for story excerpt and visit/hours section; one full-bleed light band mid-page and one near footer. |
| `forest` | #243B26 | #FFF6E6 | Sourcing band background full-bleed, farm list rows and footer base. Dark field with cream text only. |
| `marigold` | #FFC62E | #171310 | One single-origin slab fill and ticker highlights. Dark text only on this field. |
| `berry` | #FFB9D0 | #171310 | One single-origin slab fill and small flavor chips. Dark text only on this field. |

## Type

- Display: Anton, weights 400.
- Body: Karla, weights 400/500/700.
- Utility: Space Mono, weights 400/700.

Display Anton uppercase only, -0.01em tracking, 0.86 leading: hero 132-168px, section titles 56-72px, slab names 40-48px. Body Karla 16px/1.65 regular, 18px/1.6 for ledes, max 62ch, left aligned. Largest to smallest steps: 168 / 64 / 40 / 18 / 16 / 11px. Utility Space Mono 11-12px uppercase +0.14em tracking for ticker, chips, hours, roast labels and prices. Headlines tight and stacked; never set body in display face and never set paragraphs in all caps.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Anton, Karla, Space_Mono } from "next/font/google";

const display = Anton({ subsets: ["latin"], variable: "--display-font", display: "swap", weight: ["400"] });
const body = Karla({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = Space_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","700"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), sans-serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: no single radius; follow the treatment below.
- Controls: a standard button, field and select is 48px tall.

Surfaces are flat and hard-edged: photo and slab corners square at 6px, no blur or glass. Controls are fully pill at 999px with 1.5px solid borders: ember pills with dark text, ghost pills with 1.5px cream border on dark and dark border on light. Flavor chips are 28px pills with 1px border. Dividers are 1px rules, no elevation except a 10px hard offset shadow in dark brown on slab buttons. Subtle 6% film grain overlay on dark ground only.

## Visual study

/api/assets/6b065933-4b04-49ec-901a-6e01b3466c7d

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `087` — /api/assets/176b6238-4c0c-46ed-8e5c-3ace30d1555f — Full-bleed saturated panels where each panel owns its type role and fill color as information.
- Frame 2: image `051` — /api/assets/826c7ca7-6b50-43b5-95a0-02bf2bcefcf3 — Oversized left-aligned grotesk headline above a horizontal product-card strip with generous whitespace around a single pill CTA.
- Frame 3: image `063` — /api/assets/8ec178a1-3972-473a-b663-251583f8621c
