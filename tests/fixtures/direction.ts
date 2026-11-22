import type { DesignDirectionInput } from "../../lib/design/direction.ts";

/** A complete, valid direction used across the design tests. Its content is arbitrary test data. */
export const directionInput: DesignDirectionInput = {
  explored: [
    { direction: "A ledger laid out as a single ruled table that runs the full height of the page, every entry a row.", whyNot: "It explains the records but hides the people who keep them." },
    { direction: "A field notebook with loose photographs pinned at angles over handwritten margins and no grid.", whyNot: "It is warm but makes the archive hard to scan for someone looking something up." },
  ],
  concept: "A tide archive read like a night chart: the page is a dark instrument panel where the only bright things are the measurements that matter, so a visitor feels they are standing at the gauge.",
  signature: "A single tide curve drawn edge to edge across the first viewport, with the headline set on its crest.",
  composition: "A twelve-column grid with a fixed two-column rail on the left that carries the station index. The first viewport is the curve and a three-line headline occupying columns three to ten. Below it, a wide reading column alternates with full-bleed chart bands; no two neighboring regions share the same column split, and the page ends on a dense four-column index.",
  mobile: "The rail becomes a horizontally scrolling strip of stations pinned under the header, and the curve is redrawn taller than it is wide.",
  color: {
    mode: "dark",
    tokens: {
      background: "#10231C",
      foreground: "#F2EDE3",
      card: "#16302A",
      "card-foreground": "#F2EDE3",
      primary: "#E8B04A",
      "primary-foreground": "#10231C",
      secondary: "#1E3B33",
      "secondary-foreground": "#F2EDE3",
      muted: "#16302A",
      "muted-foreground": "#B7C4BC",
      accent: "#1E3B33",
      "accent-foreground": "#F2EDE3",
      border: "#2C4A41",
    },
    extra: [{ name: "signal", value: "#FF5A36", on: "#10231C", use: "The current reading only; never more than one element per viewport." }],
    strategy: "The dark canvas covers nearly everything. The warm primary marks actions and the curve; the signal color appears once per viewport on the live reading and nowhere else.",
  },
  typography: {
    display: { family: "Fraunces", italic: true, fallback: "serif" },
    body: { family: "Hanken Grotesk", fallback: "sans-serif" },
    utility: { family: "DM Mono", weights: [400, 500], fallback: "monospace" },
    treatment: "Headline at clamp(3.5rem, 9vw, 8.5rem), weight 400, line-height 0.95, letter-spacing -0.03em. Body at 1.0625rem with line-height 1.6 and a 62ch measure. Labels in the utility face at 0.75rem, uppercase, letter-spacing 0.08em.",
  },
  shape: {
    radiusPx: 2,
    treatment: "Nearly square corners. Regions are separated by one-pixel rules in the border color, never by shadows; nothing floats.",
  },
  imagery: "No photographs. Every visual is a chart or diagram drawn in code with one-pixel strokes in the foreground color and the primary for the active series.",
  motion: "The curve draws itself once on load over 900ms; nothing else moves, and reduced motion shows it already drawn.",
  voice: "Plain and exact, like a harbor notice: short declarative sentences and no exclamation.",
  avoid: [
    "A centered headline over a stock photograph of waves.",
    "Three equal cards explaining features under the first screen.",
  ],
  references: [{ frame: 1, borrow: "The ratio between one very large line of type and very small labels around it." }],
};
