# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A freelancer juggling lumpy client payouts needs to see in one minute that chaos can become a steady paycheck with taxes set aside and runway visible. They should feel the relief of a tidy desk after a messy month: warm, capable, unhurried. What is true only here: money arrives in irregular lumps while bills and taxes drain steadily. Point of view: a bookkeeper's ledger that plots the jagged income then draws one calm pay-yourself line through it.

**Signature.** The steady-pay line: jagged ember income bars for six irregular months overlaid by a thick pine line that smooths them into one flat paycheck, starting in the hero dashboard and continuing as a threaded divider that straightens section to section, ending flat in the runway chart.

## Composition

12-column grid, 1280px max centered, 24px gutters, 32px side inset at 1440px growing to 64px at 1920px. Reading measure capped at 60ch; dashboard, tables and pricing may span full grid. First viewport at 1440x900: 72px header with wordmark left, four links center, ghost plus solid CTA right; centered 12px mono eyebrow, 76px two-line headline, 20px subcopy at 52ch, two-button row, then 880px dashboard preview centered with top 320px visible above fold overlapping an offset butter block shifted 24px down-right with corner ticks; four 180-240px artifact cards float at left/right margins over faint dotted field. Down page: 88px smoothing-line divider; features as 3 cards on row one and 2 wide cards row two with 1px borders and 24px padding; how-it-works as three numbered steps on full-bleed butter wash joined by a horizontal rule; pricing as three 360px tiers with middle pine 8px taller; final band as full-width pine with signup left and FAQ accordion right. Density: airy hero, denser ledger features, airy wash steps, heavy closing band. Signature line threads all sections as divider.

**Narrow screens.** On 390px: header collapses to wordmark plus menu plus single CTA; headline drops to 44px left-aligned; peripheral artifact cards reduce to two stacked above dashboard; dashboard preview restacks vertical: balance on top, income chart, then tax jar and runway; dotted field removed; how-it-works rule turns vertical left rail; pricing stacks with pine tier first; final band stacks signup above FAQ; smoothing divider shortens to 48px and stays horizontal.

## Imagery

No photography; story told by code-drawn product UI and charts in palette colors. Light is flat daylight on paper, no shadows except dashboard lift. First screen needs: 880x540 dashboard preview with six jagged income bars, smoothing salary line, expense list and tax-jar meter; four artifact minis 180-240px wide: paid invoice slip, overdue tag, categorized receipt, quarterly estimate chip. Crops are tight, edges show 1px borders, numbers set in mono. Lower page reuses same chart language for runway timeline.

## Motion

Hero loads with jagged bars growing staggered 80ms apart then pine smoothing line drawing left-to-right over 1.2s; artifact cards float 8px on 6s loop; counters tick up on dashboard; section dividers draw on scroll; cards rise 12px fade on entry; buttons darken 8% on hover. No parallax, no autoplay video. All motion disabled under reduced-motion.

## Voice

Plain-spoken bookkeeper, not guru. Short declarative sentences, numbers first, second person. Names months, dollars and deadlines concretely. Encouraging about lean months, blunt about taxes. Never says passive income, hustle, crush it, or freedom; never vague promises.

## What this design refuses

- Purple-blue gradient fintech hero with glass dashboard and glow
- Piggy banks, rockets or beach-laptop stock photos for freelance freedom
- Three identical white SaaS cards with checklists and generic icons
- Dark neon trading charts and crypto tickers for everyday money

## Color

Warm paper dominates at 60% with white ledger cards for proof; pine provides weight in dashboard chrome, footer and closing band; mist fills secondary panels; butter marks tax and learning zones; ember is rare at under 8% — only jagged income bars, primary CTA and overdue flags. Strongest orange never fills a section; body text never takes color, only ink. Charts use pine for steady, ember for irregular, leaf for positive deltas on white.

The page is designed for light mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #FFF9EC | #1E2A22 | The page background. |
| `ink` | #1E2A22 | #FFF9EC | Default text on the canvas. |
| `pine` | #12372A | #FFFFFF | Dashboard shell, footer, closing CTA band and primary buttons. About 20% of page. |
| `leaf` | #1E6B3A | #FFFFFF | Positive deltas, smoothing salary line and small paid badges. Never large fills. |
| `ember` | #FF7A29 | #1E2A22 | Jagged irregular income bars, primary highlight and overdue flags. Under 8% of page. |
| `butter` | #FFE9A8 | #1E2A22 | Tax-jar fill and full-bleed wash behind how-it-works and offset block under hero UI. |
| `mist` | #DCE8DF | #1E2A22 | Secondary panel fills, expense rows and dashboard inner cards. About 20% of page. |

## Type

- Display: Fraunces, weights 500/600, with italics.
- Body: Instrument Sans, weights 400/500/600.
- Utility: IBM Plex Mono, weights 400/500.

Largest 76px Fraunces 600, line-height 0.95, letter-spacing -0.02em for hero; section heads 48px Fraunces 600, -0.015em; card titles 24px Fraunces 600; body 16-18px Instrument Sans 400-500, line-height 1.6, measure 52-60ch; UI labels 14px Instrument Sans 600; smallest 12px IBM Plex Mono 500 uppercase, tracking +0.08em, line-height 1.4 for eyebrows, numbers and captions. Display carries headlines and chart numerals; body carries explanation and pricing; mono carries eyebrows, tags, invoice states and tax figures. One italic accent word allowed in hero only.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--display-font", display: "swap", style: ["normal","italic"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = IBM_Plex_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap", weight: ["400","500"] });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 16px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Ledger-paper system: 1px solid ink at 14% for card borders and dividers; 16px radius on feature and pricing cards, 24px on dashboard window, 12px on inputs, full-pill on tags; primary buttons 48px solid pine with white text, secondary white with 1px ink border; dashboard casts 0 16px 40px ink 12% plus 24px offset butter block behind; dotted 1px field at 8% in hero only; no glass, no gradients, matte paper with subtle grain.

## Visual study

/api/assets/89c17e1d-0d98-4b18-8cd5-1483e5aa10f3

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `012` — /api/assets/620c26fb-af64-4108-93a4-f59da1a98c7c
- Frame 2: image `061` — /api/assets/978e3259-de37-4379-a446-784ed333629a — Center a large statement headline with small work artifacts floating at the margins at different depths over a faint dotted field.
- Frame 3: image `095` — /api/assets/4ed0989e-981a-4e63-b465-451146aa542c — Lift the product window off the page by layering it over an offset solid block with small corner registration marks.
