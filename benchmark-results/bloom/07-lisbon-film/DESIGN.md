# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A pocket programme pasted on a sun-warmed tile wall that drops into a dark auditorium. The visitor is a Lisbon local or visiting cinephile deciding in 30 seconds if they can go, where, and what it costs, then planning nights film by film. They should feel limestone sun by day and projector dust by night: welcomed, not gatekept. True of nothing else: an independent festival in Lisbon is city-as-cinema, where films spill across Alfama courtyards, a 1930s palace cinema and open-air miradouros, and the city light itself is part of the projection.

**Signature.** The day-for-night programme: a sunlit paper broadsheet whose film tiles wear sprocket-hole edging like both film stock and azulejos, then the page plunges into a night-screen schedule where dashed cobalt tram-lines link venues dot to dot across days, with times set in glowing yellow mono.

## Composition

12-column grid, max 1280px centered, 24px gutters, 24px side inset at 1440px growing to 72px at 1920px. Body measure capped at 64ch; schedule and venue ledger may span full grid. First viewport at 1440x900: 32px mono utility rail with dates left and venues plus pass link right; 72px header with wordmark left, five links center, 48px yellow pass button right; broadsheet hero split 7/5. Left holds edition eyebrow, 88px display headline across 3 lines, 2-line lede, When/Where/How strip with three mono facts divided by 1px rules, and two buttons. Right holds 2x2 tile-stack of featured stills with sprocket edging and yellow date tabs, hard offset shadow. 30px marquee ticker with strand names divides hero from body. Down the page: strands as four tiled panels with 4px top rules, night-screen full-bleed schedule with day tabs and dashed venue routes, passes as three perforated ticket cards on sand, venues as address ledger plus practical grid in two columns, dark footer. Density moves from airy paper hero to tiled medium strands to densest luminous night schedule, then opens again for practical. Signature lives in hero sprocket edging and the dashed routes across the night schedule.

**Narrow screens.** At 390px the utility rail collapses to dates plus pass link. Hero stacks: headline 44px, When/Where/How becomes three full-width rows, tile-stack becomes horizontal swipe with snap, one tile visible plus peek. Strands stack to single column. Night schedule switches from wide rows to compact cards grouped by day with sticky day select. Ticket cards stack with perforation turned horizontal. Venue ledger becomes accordion by venue.

## Imagery

Generated raster only, 35mm stills with visible grain, natural Lisbon light, no glossy stock or posed audiences. Color: sun-bleached days and tungsten nights, graded to sit on paper and glow on night-screen. Crops are hard-edged tiles with sprocket-hole borders, never soft rounded photos. First screen needs four portrait stills, each about 260x360px desktop forming the 2x2 hero stack: open-air courtyard screen at blue hour, Alfama rooftop projection beam, palace cinema balcony detail, close portrait from a featured film. Further down: one 16:9 miradouro dusk panorama above venues, and small 4:3 venue portraits. No text over images except small yellow date tabs.

## Motion

Almost still, like paper. Only motion: 24s slow marquee ticker of strand names, hover lift of 4px with hard shadow on tiles and passes, instant switch of schedule day tabs with a 150ms fade, and dashed route lines draw once on scroll into view. No parallax, no autoplay video, no hero animation. Respects reduced motion by freezing ticker.

## Voice

Warm usher, not critic. Short sentences, plain words, specific about place and price. Names the courtyard, the hour, the cost. Welcomes first-timers and never says sold out without saying what else is on, never uses hype like unmissable, curated journey, or cineaste gatekeeping.

## What this design refuses

- Dark Netflix-style hero with a play button and floating poster carousel that hides dates, venues and prices
- Identical grid of glossy poster cards with star ratings that could be any streaming store
- Corporate conference schedule as a grey spreadsheet table with tiny type and no sense of place
- Full-bleed stock photo of a tram or miradouro washed with a dark overlay and centered white headline
- Generic three-tier pricing with a highlighted Most Popular badge and checklist bullets

## Color

Warm festival paper dominates 70% of the page for daylight readability. One deep night-screen plunge holds the full schedule so times glow like a marquee. Marquee-yellow is reserved for what to do next: dates, times, tabs and ticket buttons. Festival-red marks strands and urgency only. Cobalt draws routes and links. Tile-sand never carries long text blocks, only address cards. No color ever sits behind body copy except ink on paper and paper on night.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #FFF7E8 | #17141F | The page background. |
| `ink` | #17141F | #FFF7E8 | Default text on the canvas. |
| `night-screen` | #1A1836 | #FFF7E8 | Full-bleed schedule section, footer and film-tile backs. Only dark surface on the page. |
| `marquee-yellow` | #FFD422 | #17141F | Dates, times, day tabs, ticket buttons and route dots. Never for body text, max 10% of page. |
| `festival-red` | #B42318 | #FFFFFF | Strand tags, urgent labels, one CTA and small tile accents. Rarest color. |
| `cobalt-route` | #2338C4 | #FFFFFF | Links, venue route lines, map markers and info icons on paper. |
| `tile-sand` | #E8DCC0 | #17141F | Venue cards, practical-info panels and pass-card backs. Secondary paper tone. |

## Type

- Display: Fraunces, weights 400/600/700.
- Body: Instrument Sans, weights 400/500/700.
- Utility: IBM Plex Mono, weights 400/500.

Display Fraunces for headlines with tight 0.95 line-height and -0.02em tracking: hero 88px/0.95, section titles 48px, strand titles 32px. Body Instrument Sans 16px/1.6, max 64ch; venue and practical text 15px. Utility IBM Plex Mono for all time, date, venue and label data: 12px uppercase with 0.08em tracking for eyebrows and tags, 13-14px for schedule times and addresses. Hierarchy by scale and weight, not color: 88 down to 12 in five steps. Fraunces never used for UI or times; mono never used for paragraphs.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--display-font", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = IBM_Plex_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","500"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 10px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Poster-wall construction: 2px ink borders on cards, 6px hard offset shadows in ink at 12% on paper and in black on night. Ticket pass cards have a vertical perforated edge rendered as 2px dashed divider with punched semicircle notches. Schedule rows divided by 1px light rules on dark; paper sections divided by 1px ink rules. Controls are rectangular with 10px radius, solid yellow fill for primary, 2px ink outline for secondary, no glass or gradients.

## Visual study

/api/assets/075d8666-55a5-46e6-824a-50a014b54da9

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `120` — /api/assets/06f0c8ad-1f40-4a22-b8ae-278f1daf5f11 — Crisp white content cards floating with hard edge over a saturated textured color field to lift the key action sections from the surrounding page.
- Frame 2: image `096` — /api/assets/aab4d2cf-9e83-4100-9c43-508ae1388a48
- Frame 3: image `018` — /api/assets/c3d62bb7-07bd-4d07-b7dc-c02ec12233a0 — Dark ground used as a wayfinding map: dashed itinerary lines connecting points with block-tile clusters at edges, plus extreme scale contrast between tiny mono labels and huge display type.
