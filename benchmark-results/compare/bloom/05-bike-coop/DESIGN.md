# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A neighbor with a wobbly wheel or a kid's too-small frame walks into a shared garage, not a store. They need to know in 10 seconds: are you open, where, can I just show up, what will it cost if I'm broke. They should feel capable and welcome — grease is normal, no question is dumb, winter riders belong. What is true of a co-op and nothing else is that the customer is the mechanic: stands and tools are shared, volunteers teach, money is sliding, ownership is collective.

**Signature.** The Stand Board: every section is a perforated shop ticket stamped STAND 01-06 in huge condensed numerals on stand-yellow, with mono time and price lines and chain-dash tear edges. Hero grease-black status card flips OPEN NOW / STANDBY / CLOSED with pulsing dot, today's hours, address and stand count — the thing visitors photograph and describe as the site with the yellow repair tickets.

## Composition

12-column grid, 1280px max centered, 24px gutters, 20px page inset at 1440 growing to 32px at 1920. Body measure capped at 64ch; headlines break to grid edge. First viewport at 1440x900: 34px mono ticker (today hours + address + open/closed), 68px header with wordmark left, anchor links center, yellow Get stand time button right on 2px ink rule. Below, split hero: left 7 cols with 112px condensed uppercase headline in 3 stacked lines, 18px intro, 3-step open-shop strip with oversized numerals; right 5 cols with 460px-wide grease-black status card holding yellow OPEN panel, address/transit lines, shop photo, sliding-scale teaser and two buttons. Scroll: full-width chain-dash divider, co-op model 3-ticket row, how-open-shop 3 steps, pricing/membership two-column ledger table plus member card, teal class calendar with 4 cards, volunteer two-path split, donated-bikes request/give split on red, location/hours ledger plus winter note, grease-black footer. Signature repeats as section headers down page.

**Narrow screens.** At 390px ticker truncates to open dot plus hours plus arrow; header collapses to wordmark plus menu button. Hero stacks: black status card first full-width with 16:10 photo, then 56px headline, then steps vertical. Ticket rows, class cards and volunteer/donate splits stack single column; ledger tables become labeled rows; stand numerals shrink 96px to 48px; footer map becomes full-width block. Yellow Get stand time CTA stays sticky at bottom. No horizontal scroll.

## Imagery

Medium: direct-flash documentary raster photos of real shop nights — neighbors of different ages in winter layers, hands on chains, crowded stand rows under fluorescents; no lone sunset road cyclist. Light: bright, slightly hard, grease and concrete visible. Color: lightly desaturated with warm cast to sit on shop concrete, yellow tags pop. Cropping: hard rectangles with 2px ink frame, photos themselves square corners. First screen needs one image: 460x340 shop interior with three occupied repair stands and tool wall, placed mid-status-card under hours block. Down page: 3:2 class circle photo, donated-bike row photo, winter storefront for location.

## Motion

Mostly still like a posted shop sign for daylight phone lookup. Only motion: open-dot pulses on 2s loop, chain-dash divider marches slowly on scroll, ticket cards lift 2px on hover, class filters fade 150ms. No hero video, parallax or scroll-jacking; respects reduced-motion with all animation off.

## Voice

Plainspoken neighbor-mechanic: short second-person sentences, verbs first, prices and hours stated plainly. Warm, practical, never precious or salesy. Never says curated, premium, hassle-free, passion, or talks down about cheap bikes; never hides cost behind contact us.

## What this design refuses

- Lone-cyclist sunset hero and boutique bike-shop gloss that sells bikes instead of teaching fixes.
- Generic rounded SaaS card grid with identical icons for hours, pricing, classes and volunteering.
- Hidden sliding-scale pricing or membership behind contact us — show numbers on page one.
- Testimonial carousel, partner logos or eco-slogan stock standing in for volunteer faces and stand time.

## Color

Warm shop-concrete off-white dominates 70% for daylight legibility. Grease-black anchors top and bottom and one hero status card to signal open/closed. Stand-yellow is rare and functional only: status, stand numerals, primary buttons. Lake-teal marks the teaching/volunteer middle of the page. Shop-red appears only for closed or donate urgency. Never color body text except ink; never gradients or tints behind type.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #EDEAE0 | #1E2321 | The page background. |
| `ink` | #1E2321 | #EDEAE0 | Default text on the canvas. |
| `stand-yellow` | #FFC400 | #1E2321 | Open-shop status fills, stand numbers and primary actions; about 15% of page, never body text. |
| `grease-ink` | #222825 | #EDEAE0 | Header, operational status panel, footer and heavy dividers; holds light text and yellow accents. |
| `lake-teal` | #0D5C5F | #FFFFFF | Learn-to-fix and volunteer bands, links and icons; mid-page rhythm change. |
| `shop-red` | #A9321F | #FFFFFF | Only for closed status, donated-bikes callout and urgent notes; under 5% of page. |
| `concrete` | #D9D9CC | #1E2321 | Ticket cards, table rules and dividers, image frames; structural gray behind photos. |

## Type

- Display: Barlow Condensed, weights 600/700.
- Body: Work Sans, weights 400/500/600.
- Utility: DM Mono, weights 400/500.

Display Barlow Condensed 600-700 uppercase, 0.9 line-height, -0.01em tracking; hero 112px desktop / 56px mobile, section heads 48-64px, stand numerals 96px. Body Work Sans 400/500 at 17px/1.6 max 64ch, 15px on cards. Utility DM Mono 12px uppercase +0.08em tracking for tickets, hours, prices, labels; 13px tabular figures for tables. Hierarchy by scale plus weight plus color, never by pale gray text; smallest type 12px mono at full ink opacity.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Barlow_Condensed, Work_Sans, DM_Mono } from "next/font/google";

const display = Barlow_Condensed({ subsets: ["latin"], variable: "--display-font", display: "swap", weight: ["600","700"] });
const body = Work_Sans({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = DM_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","500"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), sans-serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 10px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

2px ink rules everywhere; tickets and cards are flat paper with 10px radius and perforated tear edge of 12px dashes plus half-circle notches. No shadows or gradients; separation by rule weight and color blocks, not elevation. Photos get 2px ink frames with square corners. Controls are 48px high pill-rects with 10px radius and 2px ink outline; primary is yellow fill with ink text, secondary is outline only.

## Visual study

/api/assets/533278af-9a71-43e1-854f-16d813a17b84

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `027` — /api/assets/73df85d6-1ab2-4a88-9082-0ee796e75bcc — Use oversized cropped mechanical fragments — tube ends, ticket corners — as background texture at viewport scale, not small icons.
- Frame 2: image `039` — /api/assets/9c858785-d2e3-445c-9af5-188616b59e18
- Frame 3: image `007` — /api/assets/c38df565-82fa-487e-8bd1-c36aca49c976 — Split hero logic: quiet editorial headline column beside a saturated operational panel that carries live status, hours and action.
