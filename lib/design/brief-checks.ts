import type { BuildSession, ReferenceCapture } from "../../ai/build-session.ts";
import { plannedImageSections, type DesignBrief } from "./brief.ts";
import { contrastRatio, deltaE, hslToRgb, hueName, isLightColor, parseColor, relativeLuminance, rgbToHsl, toHex, type Rgb } from "./color.ts";
import { lintSourceChange } from "./lint.ts";

function rgb(hex: string): Rgb {
  return parseColor(hex) ?? { r: 0, g: 0, b: 0 };
}

/**
 * An original site transforms one measured primary reference: brand, accent,
 * copy and artwork change; theme family, display scale and the hero's kind of
 * visual are kept, because those carry the reference's quality.
 */
export function primaryReferenceProblems(brief: DesignBrief, session: BuildSession, anchor: ReferenceCapture) {
  const problems: string[] = [];
  const dna = anchor.dna;
  const studied = session.designStudy?.references.some((source) => session.findReference(source.url) === anchor);
  if (!studied) {
    problems.push(`anchor.url must be the primary reference you analysed in the design study (${session.designStudy?.references.map((source) => source.url).join(", ") ?? "none"}).`);
  }
  const requested = session.requestedTheme;
  if (dna.theme !== "mixed" && requested === null && isLightColor(rgb(brief.colors.background)) !== (dna.theme === "light")) {
    problems.push(`The primary reference ${anchor.host} is measured as a ${dna.theme} page (${Math.round(dna.lightShare * 100)}% light surfaces, ${dna.surfaceColors.slice(0, 3).map((entry) => entry.color).join(", ")}). Keep its theme family: a ${dna.theme} background and the same light/dark rhythm. Make the brand your own with accent hue, type and artwork, or choose a reference with the theme you want as anchor.`);
  }
  const anchorDisplay = dna.type.display?.size ?? null;
  if (anchorDisplay && brief.typography.display.sizePx < Math.round(anchorDisplay * 0.75)) {
    problems.push(`${anchor.host}'s display headline is ${anchorDisplay}px; ${brief.typography.display.sizePx}px loses its scale. Use at least ${Math.round(anchorDisplay * 0.75)}px.`);
  }
  const hero = brief.sections[0]!;
  if (hero.anchorFrame === null) {
    problems.push(`Set the hero's anchorFrame to the ${anchor.host} frame whose composition it adapts (frame 1 shows its hero). The builder sees that frame beside the hero code.`);
  }
  if (anchor.heroImagery >= 0.35 && !plannedImageSections({ sections: [hero] }).length) {
    problems.push(`${anchor.host}'s hero is led by artwork or photography (${Math.round(anchor.heroImagery * 100)}% of its first screen is imagery), but the hero's media is "${hero.media ?? "none"}". Plan a text-free generated image as the dominant hero visual (name it as artwork, photography, render or illustration with its subject); at most one product card may rest on it.`);
  }
  if (anchor.largeMedia >= 3 && plannedImageSections(brief).length < 2) {
    problems.push(`${anchor.host} uses ${anchor.largeMedia} large images or illustrations. Plan generated artwork, photography or illustration for at least 2 sections.`);
  }
  return problems;
}

const GENERIC_STYLE = /\b(glass(?:morphi\w*|y)?|glow(?:s|ing)?|neon|luminous|aurora|mesh[- ]gradients?|gradient borders?|blobs?)\b/gi;
const OVERUSED_DISPLAY = new Set(["inter", "inter tight", "space grotesk", "geist", "roboto", "poppins", "montserrat"]);

/** The stock AI-landing-page look, rejected unless the user or a reference asks for it. */
export function genericLookProblems(brief: DesignBrief, session: BuildSession) {
  const problems: string[] = [];
  const request = session.requestText.toLowerCase();
  const described = [brief.signature, brief.imagery, brief.anchor.keep, ...brief.sections.map((section) => section.composition)].join(" ");
  const terms = [...new Set([...described.matchAll(GENERIC_STYLE)].map((match) => match[1]!.toLowerCase()))]
    .filter((term) => !request.includes(term));
  if (terms.length > 0) {
    problems.push(`The plan relies on stock AI-page effects (${terms.join(", ")}). Remove them from the signature, imagery and compositions; express the idea through layout, scale, type and real imagery.`);
  }
  const reference = session.referenceCopy();
  if (reference) {
    const copied = lintSourceChange({
      path: "components/brand.tsx",
      before: null,
      after: [brief.brand.name, brief.brand.tagline].map((text) => JSON.stringify(text)).join("\n"),
      reference: { ...reference, ownBrand: null },
    }).filter((violation) => violation.kind === "copied-copy" || violation.kind === "reference-brand");
    if (copied.length > 0) problems.push(`The brand name or tagline repeats a reference site's words (${copied.map((violation) => violation.excerpt).join("; ")}). Write an original tagline.`);
  }
  if (OVERUSED_DISPLAY.has(brief.typography.display.family.trim().toLowerCase()) && brief.typography.display.weight > 500) {
    problems.push(`"${brief.typography.display.family}" at weight ${brief.typography.display.weight} is the default display of generated pages. Set it at a regular weight (400-500) with tight tracking, or choose a display family with more character (for a shadcn theme, a different fontHeading).`);
  }
  const background = rgb(brief.colors.background);
  if (!isLightColor(background) && relativeLuminance(background) < 0.02) {
    const anchorColors = (session.anchor?.dna.palette ?? []).map((entry) => rgb(entry.color));
    for (const [role, hex] of [["primary", brief.colors.primary], ["accent", brief.colors.accent]] as const) {
      const color = rgb(hex);
      const { h, s } = rgbToHsl(color);
      const cliché = s >= 0.45 && ((h >= 235 && h <= 300) || (h >= 65 && h <= 100));
      const fromReference = anchorColors.some((candidate) => deltaE(candidate, color) < 30);
      if (cliché && !fromReference && !/\b(purple|violet|indigo|lime|neon)\b/.test(request)) {
        problems.push(`A near-black page with a ${hueName(color)} ${role} (${hex}) is the stock AI look. Pick an accent from the primary reference's palette or one specific to this brand (for a shadcn theme, a different theme or chartColor, or mode light).`);
        break;
      }
    }
  }
  return problems;
}

/**
 * Fills fields the primary reference fully determines (hero frame, display
 * floor, art-led hero and section media) so a weak model is not rejected for
 * omissions Bloom can make itself. Returns the notes to report back.
 */
export function applyPrimaryReferenceDefaults(brief: DesignBrief, session: BuildSession): { brief: DesignBrief; notes: string[] } {
  const anchor = session.original && brief.anchor.url ? session.findReference(brief.anchor.url) : null;
  if (!anchor) return { brief, notes: [] };
  const notes: string[] = [];
  const sections = brief.sections.map((section) => ({ ...section }));
  const hero = sections[0]!;
  const art = `generated text-free artwork: ${brief.imagery}`.slice(0, 200);
  if (hero.anchorFrame === null && anchor.frames.some((frame) => frame.number === 1)) {
    hero.anchorFrame = 1;
    notes.push(`Hero adapts ${anchor.host} frame 1.`);
  }
  if (anchor.heroImagery >= 0.35 && plannedImageSections({ sections: [hero] }).length === 0) {
    hero.media = art;
    notes.push(`${anchor.host}'s hero is art-led, so the hero's media is a dominant generated image: ${art}`);
  }
  if (anchor.largeMedia >= 3) {
    for (const section of sections.slice(1, -1)) {
      if (plannedImageSections({ sections }).length >= 2) break;
      if (section.media === null) {
        section.media = art;
        notes.push(`Section "${section.id}" also gets a generated image, as ${anchor.host} is image-rich.`);
      }
    }
  }
  const floor = anchor.dna.type.display?.size ? Math.round(anchor.dna.type.display.size * 0.75) : null;
  const typography = floor && brief.typography.display.sizePx < floor
    ? { ...brief.typography, display: { ...brief.typography.display, sizePx: Math.min(240, floor) } }
    : brief.typography;
  if (typography !== brief.typography) notes.push(`Display size raised to ${typography.display.sizePx}px to keep ${anchor.host}'s type scale.`);
  return { brief: { ...brief, sections, typography }, notes };
}

/** Template filler sections, each allowed only when the primary reference itself has one. */
const FILLER = [
  { name: "logo or network ticker", plan: /\b(ticker|marquee|ribbon|logo[- ]?(?:strip|row|wall|cloud)|(?:network|chain|partner|integration)s? (?:strip|row|grid|badges|pills|marquee)|supported (?:chains|networks))\b/i, frame: /\b(marquee|ticker|scrolling|logos?|logo row)\b/i },
  { name: "FAQ", plan: /\b(faq|frequently asked|questions|accordion)\b/i, frame: /\b(faq|accordion|questions|expandable)\b/i },
  { name: "numbered steps / how it works", plan: /\b(how[- ]it[- ]works|three steps|3 steps|step[- ]by[- ]step|onboarding steps|numbered steps|get started in)\b/i, frame: /\b(steps?|numbered|01|sequence of three)\b/i },
  { name: "row of three or four feature cards", plan: /\b(three|four|3|4)\b[^.]{0,40}\b(feature |icon )?(cards?|tiles|columns)\b/i, frame: /\b(three|four|five|3|4|5)\b[^.]{0,40}\b(cards?|tiles|columns)\b/i },
];
const FILLER_BLOCKS: Record<string, string> = { "logo-strip": "logo or network ticker", ribbon: "logo or network ticker", faq: "FAQ", steps: "numbered steps / how it works" };

/**
 * Original pages take their section sequence from the primary reference's
 * frames instead of the generic landing-page skeleton. Filler sections need
 * an equivalent in the reference.
 */
export function structureProblems(brief: DesignBrief, session: BuildSession) {
  const anchor = session.original && brief.anchor.url ? session.findReference(brief.anchor.url) : null;
  if (!anchor) return [];
  const problems: string[] = [];
  const notes = Object.values(anchor.frameNotes).join(" ");
  const body = brief.sections.slice(1, -1);
  const unmapped = body.filter((section) => section.anchorFrame === null).map((section) => section.id);
  if (unmapped.length > Math.floor(body.length / 3)) {
    problems.push(`Sections ${unmapped.join(", ")} are not mapped to ${anchor.host} frames. Follow the primary reference's section sequence: give each section the anchorFrame it adapts and write its composition from that frame's note (layout, scale, media placement), with your own content.`);
  }
  for (const section of body) {
    const text = `${section.id} ${section.purpose} ${section.composition}`;
    const filler = FILLER.find((pattern) => FILLER_BLOCKS[section.block] === pattern.name || pattern.plan.test(text));
    if (!filler) continue;
    const frameNote = section.anchorFrame ? anchor.frameNotes[section.anchorFrame] ?? "" : "";
    if (notes && !filler.frame.test(frameNote || notes)) {
      problems.push(`Section "${section.id}" is a generic ${filler.name}, which ${anchor.host} does not have. Replace it with a section that adapts one of its frames.`);
    }
  }
  return problems;
}

const ratio = (foreground: string, background: string) => contrastRatio(rgb(foreground), rgb(background));

/** A text color for the background, or the background shifted in lightness until the best text color reads. */
function readablePair(foreground: string, background: string, minimum: number): [string, string] {
  const text = [foreground, "#FFFFFF", "#0A0A0A"].reduce((best, candidate) =>
    ratio(candidate, background) > ratio(best, background) ? candidate : best);
  if (ratio(text, background) >= minimum) return [text, background];
  const hsl = rgbToHsl(rgb(background));
  const direction = isLightColor(rgb(text)) ? -0.02 : 0.02;
  for (let step = 1; step <= 40; step += 1) {
    const shifted = toHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, hsl.l + direction * step)) }));
    if (ratio(text, shifted) >= minimum) return [text, shifted];
  }
  return [text, background];
}

/**
 * Fixes text/background pairs below WCAG contrast instead of rejecting the
 * brief: a lite model often fails to resubmit a large brief after a rejection.
 */
export function repairContrast(brief: DesignBrief) {
  const notes: string[] = [];
  const colors = structuredClone(brief.colors);
  const pair = (label: string, foreground: string, background: string, minimum: number) => {
    if (ratio(foreground, background) >= minimum) return [foreground, background] as const;
    const [text, fill] = readablePair(foreground, background, minimum);
    notes.push(`Bloom adjusted ${label} for ${minimum}:1 contrast: ${foreground} on ${background} became ${text} on ${fill}.`);
    return [text, fill] as const;
  };
  [colors.primaryForeground, colors.primary] = pair("primaryForeground on primary", colors.primaryForeground, colors.primary, 4.5);
  [colors.accentForeground, colors.accent] = pair("accentForeground on accent", colors.accentForeground, colors.accent, 4.5);
  colors.surfaces = colors.surfaces.map((surface, index) => {
    const [foreground, background] = pair(`surfaces[${index}] (${surface.name})`, surface.foreground, surface.background, 4.5);
    return { ...surface, foreground, background };
  });
  if (ratio(colors.foreground, colors.background) < 7) {
    const text = ["#0A0A0A", "#FAFAFA"].reduce((best, candidate) =>
      ratio(candidate, colors.background) > ratio(best, colors.background) ? candidate : best);
    if (ratio(text, colors.background) >= 7) {
      notes.push(`Bloom set foreground to ${text} for 7:1 contrast on ${colors.background}.`);
      colors.foreground = text;
    }
  }
  for (let amount = 0.1; ratio(colors.mutedForeground, colors.background) < 4.5 && amount <= 1; amount += 0.1) {
    const muted = rgb(colors.mutedForeground);
    const ink = rgb(colors.foreground);
    const next = toHex({ r: muted.r + (ink.r - muted.r) * amount, g: muted.g + (ink.g - muted.g) * amount, b: muted.b + (ink.b - muted.b) * amount });
    if (ratio(next, colors.background) >= 4.5) {
      notes.push(`Bloom darkened mutedForeground from ${colors.mutedForeground} to ${next} for 4.5:1 contrast.`);
      colors.mutedForeground = next;
    }
  }
  return { brief: { ...brief, colors }, notes };
}
