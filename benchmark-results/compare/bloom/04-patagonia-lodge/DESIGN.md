# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A survey sheet pinned against Patagonian wind. The visitor is a self-reliant traveler imagining a week at 51 degrees south and deciding whether to enquire. They should feel the calm of being far past the last town — held, guided, weather-aware. What is true of nothing else is the end-of-map condition: granite towers, lenga and guanaco, estancia Spanish, fjords west and steppe east, and wind that decides the day. The page reads like a field station log, not a resort brochure.

**Signature.** The south-line: a continuous mono coordinate rail and wind ledger — 51°14'S, km to Puerto Natales, live wind and condor notes — running from utility bar down the left edge and resurfacing as floating cards on every image. A visitor remembers being at the end of the map, not at a hotel.

## Composition

12-column grid, max 1320px centered, 24px gutters, 32px side inset at 1440 growing to 64px at 1920. Body never exceeds 62ch; data tables may span full grid. First viewport at 1440x900: 32px mono utility bar (coordinates / wind / open Oct-Apr) with 1px basalt rule, then 72px nav (wordmark left, mono links center, rust Enquire pill right). Below, split hero: left 5 cols holds eyebrow, 88px headline, 20px lede, CTA row, 3-item mono ledger (sleeps 16 / 51S / guided only). Right 7 cols holds one 700x520px framed panorama with two small floating field cards overlapping its lower edge (wind, condors). After hero: 1) lodge story split — sticky mono coordinate rail left (2 cols), narrative center (5 cols), vertical lenga-forest image right (4 cols). 2) rooms as three equal tall cards with image top, rate ledger bottom. 3) experiences as 2x2 ledger rows, each row image left, data right, separated by 1px stone rules. 4) inverted basalt seasons + getting-there band with season table left and vertical journey timeline right. 5) practicalities as dense 3-col field manual. 6) rust enquiry panel with form left, contact facts right. 7) minimal footer. Signature lives in utility bar, left rail and floating cards throughout.

**Narrow screens.** At 390px utility bar collapses to coordinates + wind only. Hero stacks: headline 44px, panorama full-bleed 390x280px with one floating card. Coordinate rail turns into horizontal mono scroll above story. Rooms trio becomes horizontal snap carousel, one card per view. Inverted seasons band stacks table above timeline. Rust enquiry panel stacks form above facts; inputs full width, 48px height retained.

## Imagery

All photography is matte raster, cool desaturated daylight, no golden-hour glow, sharp wind clarity. First screen needs one image: Torres del Paine granite towers under fast clouds with low sod-roof lodge in foreground, shot from ridge, 700x520px, hard 1px basalt edge, cropped to 4:3. Down page: 3 room interiors (stone, lenga wood, wool textile, window framing towers), 4 experience frames (ridge trek, condor on cliff, estancia horses, fjord boat), 1 vertical lenga forest. Line work is code-drawn: faint topographic contours on canvas, thin route line in journey timeline. Images never carry text over them; data floats in separate white cards with mono labels.

## Motion

Almost still, like held breath. Only: faint contour drift on scroll (8px parallax), floating field cards rise 12px on entry, journey timeline draws downward as it enters view, season tabs cross-fade. No hero video, no carousel autoplay, no hover theatrics. Respects reduced motion with zero movement.

## Voice

Spare, weather-worn, precise. Short declarative sentences, Spanish place names left as-is, distances and hours always given. Never says luxury, escape, paradise, hidden gem or bucket-list. Sounds like a guide who checks the wind before promising anything.

## What this design refuses

- Full-bleed mountain stock photo with centered white serif headline and gold luxury badge
- Generic adventure icons, star ratings, testimonial carousel or invented press logos
- Dark-green-and-gold estancia cliché with script type and endless parallax
- One endless white page where rooms, treks and bus times all look the same

## Color

Glacial mist dominates: pale cool canvas with faint contour lines. Basalt ink carries all reading text. One inverted basalt band mid-page holds seasons and route so the page feels like light field-sheet interrupted by night. Fjord teal marks wayfinding and data. Lichen marks what is open. Rust is rationed to the single decision: the coordinate dot and the Enquire action. No color sits behind long paragraphs; rust and fjord appear only as solids with their paired light text.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #ECEFE8 | #1A2521 | The page background. |
| `ink` | #1A2521 | #ECEFE8 | Default text on the canvas. |
| `basalt` | #1C2B25 | #ECEFE8 | Inverted seasons-and-route band, footer, and section rules. Occupies one full band only. |
| `fjord` | #234E4A | #FFFFFF | Map lines, experience difficulty tags, secondary buttons and links. About 10% of page. |
| `rust` | #8E3515 | #FFF6E8 | Only the coordinate dot, primary Enquire button and enquiry panel. Rare, under 8%, never body text. |
| `lichen` | #3C5230 | #EDEFE6 | Open-season and availability chips, trail-status labels. Small caps only. |
| `stone` | #CBD1C3 | #1A2521 | Hairline 1px rules, contour pattern, card borders and dividers across light areas. |

## Type

- Display: Marcellus, weights 400.
- Body: Public Sans, weights 400/500/700.
- Utility: DM Mono, weights 400/500.

Marcellus 400 only for headlines: hero 88px/0.95, sections 48px/1.0, card titles 28px/1.1, all sentence case, tight tracking -0.01em. Public Sans for reading: lede 20px/1.5, body 16px/1.65, max 62ch. DM Mono for all data: 12px uppercase, 0.12em tracking, 1.5 line-height for eyebrows, tags, coordinates, timelines and table heads. Hierarchy is scale + mono labels, never italics or all-caps serif.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Marcellus, Public_Sans, DM_Mono } from "next/font/google";

const display = Marcellus({ subsets: ["latin"], variable: "--display-font", display: "swap", weight: ["400"] });
const body = Public_Sans({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = DM_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","500"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 3px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Survey-sheet precision: square 3px radius everywhere, 1px basalt or stone borders on all cards, no drop shadows except 0 8px 24px rgba(26,37,33,0.10) under floating field cards. Regions separated by 1px stone rules, not whitespace alone. Inputs are white with 1px basalt border and square focus ring in fjord; primary button is solid rust with cream text; secondary is outline fjord.

## Visual study

/api/assets/b996285f-7799-4868-845e-74ea449ac602

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `014` — /api/assets/8a0bbdf3-d541-44f0-bb7c-8a6b504a6de5 — Mono annotations and dotted solid/hollow status timeline to show journey progress and conditions.
- Frame 2: image `016` — /api/assets/efe1cd06-e252-4cc7-99fd-7aa7d2f761b8 — Narrow centered headline over a trio of landscape panels with small data cards floating over the image edge.
- Frame 3: image `090` — /api/assets/61ffe275-0b2d-4a7a-a22c-96e8c2fbcb37
