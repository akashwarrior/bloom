# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and `.bloom/design.json`; a different look needs a redesign, not a hand edit. Everything else, including `app/globals.css` and `app/layout.tsx`, is yours to write from it.

## The idea

A person leaving back-to-back calls needs one answer without rewatching anything. They should feel control-room calm: slippery talk captured as signal you can scrub. What is true of meetings and nothing else is that speech vanishes in overlapping voices and timestamps; this design treats sound as material that resolves into lines you can find, with waveform, speaker dots and timecode as its native vocabulary.

**Signature.** Signal-to-sentence console: a 96-bar waveform where only bars containing the query light lime; typing instantly collapses the transcript to matching timestamped lines with speaker dots, while the side pane shows summary and actions for that moment.

## Composition

Full-bleed control-room field, content max 1120px centered with 24px gutters and no outer card. First viewport at 1440x900: 72px top nav with wordmark left, mono links center, lime Get started pill right, 1px sage rule below; centered hero stack with REC eyebrow, 88px two-line headline max 28ch, 20px sub max 56ch, centered CTA row, then console top edge peeking at 640px so value and proof share one screen. Region 2 is live searchable notes console 1120x560 with waveform strip on top plus search bar plus 3 meeting tabs plus split transcript left and summary right. Region 3 is how it works as horizontal tape with sage time-ruler line and 3 columns 01 connect 02 record 03 search. Region 4 is feature grid as 2x2 modules divided by hairlines with mini UI sketches. Region 5 is final CTA as full-bleed 340px lime band with dark button. Footer 72px mono row. Density airy hero, dense console, breathing tape, tight grid. Signature lives in waveform plus transcript console.

**Narrow screens.** At 390px nav keeps wordmark plus Get started, links hide. Hero headline drops to 44px, sub 17px, CTA full-width stacked. Console stacks with search sticky, meeting tabs horizontal scroll, waveform 48 bars, transcript full width then summary below. Tape becomes vertical with left time rail, grid 1 column with dividers, final lime band stacked text above button.

## Imagery

No photography and no generated raster scenes. Design carries itself with type and code-drawn product UI. First screen needs 1120x84px 96-bar waveform strip drawn in code with lime peaks, and 1120x520px searchable notes console with speaker initials, timestamps and summary pane. All visuals flat, 3px bars, no shadows, palette strictly canvas, console, sage, lime and ember.

## Motion

Restrained console motion only. Search demo loops a 6s type-query then filter to matching lines with 150ms fade and waveform peaks lighting lime; waveform idles with subtle pulse only in view. Sections reveal once with 12px rise and 200ms ease. No parallax, no hero animation. Honors reduced-motion by showing final filtered state static.

## Voice

Direct and verb-led, short sentences, calm confidence. Names what happens: connect, record, find. Never hypes AI magic, never claims ratings, counts or customer proof.

## What this design refuses

- Purple-blue AI gradient hero with glass cards and floating chat bubbles
- Paper-notebook metaphor with yellow highlighter marks for search hits
- Invented logos, star ratings, usage counts or testimonial quotes
- Three pastel feature cards with generic line icons
- Stock photo grid of smiling video-call faces behind headline text

## Color

Dark field dominates: 70 percent near-black canvas, 20 percent console surfaces divided by sage hairlines. Saturated color is scarce and means live: lime only for CTA, active query and waveform peaks that contain the search word; ember only for REC and time markers. Ink sits on canvas and console; dark text sits on lime and ember. Never gradients, glows, photo washes or color behind body copy.

The page is designed for dark mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
| `canvas` | #0D1310 | #E8EFEA | The page background. |
| `ink` | #E8EFEA | #0D1310 | Default text on the canvas. |
| `live-lime` | #D2F34C | #172000 | Primary Get started buttons, active meeting tab, matching query pill and waveform peaks only. Under 8 percent of page. |
| `rec-ember` | #FF5A2E | #1E0D06 | Recording dot, step numerals 01-03 and flagged timestamp only. Small marks, never large fills. |
| `console` | #18211C | #E8EFEA | Demo console, transcript rows and feature module backgrounds in mid-page bands. |
| `hair-sage` | #2C3B32 | #E8EFEA | 1px dividers, table rules, input borders and inactive rails throughout. |

## Type

- Display: Space Grotesk, weights 500/700.
- Body: Inter, weights 400/500/600.
- Utility: JetBrains Mono, weights 400/500/700.

Display Space Grotesk 700 for headline 88px line-height 0.95 letter-spacing minus 0.02em, H2 40px with 1.05 line-height. Body Inter 17px with 1.6 line-height max 56ch, 16px for UI. Utility JetBrains Mono 12px uppercase plus 0.08em tracking for eyebrow, tabs and footer, 13px for timecodes. Hierarchy by scale and weight, never italic display.

The families, weights and subsets below are checked against Google Fonts. Load them this way in `app/layout.tsx`:

```tsx
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--display-font", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--body-font", display: "swap" });
const utility = JetBrains_Mono({ subsets: ["latin"], variable: "--utility-font", display: "swap" });

// On <html>: className={`${display.variable} ${body.variable} ${utility.variable}`}
```

In `@theme inline` these lines make them `font-display`, `font-body` and `font-utility`: `--font-display: var(--display-font), sans-serif;` `--font-body: var(--body-font), sans-serif;` `--font-utility: var(--utility-font), monospace;`

## Shape and controls

- Corners: 12px on a standard control and card.
- Controls: a standard button, field and select is 48px tall.

Flat surfaces, no shadows, no gradients. Regions separated by 1px sage hairlines, not elevation. Cards and inputs 12px radius; primary Get started and final CTA buttons are 999px pills, solid lime with dark text. Ghost button is transparent with 1px sage border. Waveform bars 3px with 2px rounding. Focus ring 2px lime offset 2px.

## Visual study

/api/assets/becb4888-7730-4dc9-9ce9-bd6bf54324bd

A rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.

## Inspiration

References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.
- Frame 1: image `113` — /api/assets/57e3be25-a446-4f4b-99a8-d108829c3f2d
- Frame 2: image `053` — /api/assets/a40009b8-5007-4fa0-94b4-c24be137f8dc — Present transcript as a dense operational table with timestamp gutter and status rail rather than chat bubbles.
- Frame 3: image `010` — /api/assets/847d215d-84a1-470e-96a7-e54b1dbc6629 — Place one working console centered on a dark field and reserve saturated color for live active state only.
