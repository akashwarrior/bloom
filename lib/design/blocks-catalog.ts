/** Section blocks and mockup primitives Bloom writes into every guided build (components/blocks/). */
export const BLOCK_FILES = [
  "section.tsx",
  "site-header.tsx",
  "hero.tsx",
  "feature-cards.tsx",
  "bento.tsx",
  "feature-split.tsx",
  "more.tsx",
  "mockups.tsx",
  "art.tsx",
  "vignette.tsx",
  "index.ts",
] as const;

export const BLOCK_DIRECTORY = "components/blocks";

/** Block kinds a brief section can use, with their allowed variants. */
export const BLOCK_KINDS = {
  hero: ["centered", "split", "panel"],
  "logo-strip": ["row", "marquee"],
  ribbon: ["tilted", "straight"],
  "feature-cards": ["tall", "numbered", "icon", "media"],
  bento: [],
  "feature-split": [],
  steps: [],
  statement: [],
  faq: ["split", "center"],
  pricing: [],
  cta: ["panel", "centered"],
  footer: [],
  custom: [],
} as const satisfies Record<string, readonly string[]>;

export type BlockKind = keyof typeof BLOCK_KINDS;

export const BLOCK_KIND_NAMES = Object.keys(BLOCK_KINDS) as BlockKind[];

/** One line per block kind for the brief step. */
export function blockKindsForPrompt() {
  return [
    "hero (centered | split | panel): first section. centered = giant centered headline with a large product visual below; split = copy left, visual right; panel = the hero sits inside a big rounded colored panel (optionally over a text-free image).",
    "logo-strip (row | marquee): networks, integrations, or platforms as text wordmarks.",
    "ribbon (tilted | straight): a full-bleed moving band of short uppercase brand phrases on a bold surface, usually right after the hero.",
    "feature-cards (tall | numbered | icon | media): a row of cards. tall = tall color-blocked cards with a title on top and a visual bleeding off the bottom; numbered = big 01/02/03 numerals in the accent over a title and text; icon = icon + title + text; media = visual on top, text below.",
    "bento: grid of tiles in mixed sizes, each with a title, text, and a visual.",
    "feature-split: alternating rows of copy + bullets and a large visual.",
    "steps: numbered how-it-works steps.",
    "statement: one large positioning or mission statement (size lg sets it at headline scale).",
    "faq (split | center): accordion of questions.",
    "pricing: plan tiers.",
    "cta (panel | centered): closing call to action; panel = inside a big rounded colored panel.",
    "footer: brand, link columns, optional newsletter.",
    "custom: only when no block fits; you write the section from scratch with the same tokens.",
  ].join("\n");
}

/** API reference for the build step. */
export function blockCatalog() {
  return `Import everything from "@/components/blocks". Every block takes surface={N} (1-based brief surface) and paints it; inside any surface, use the contextual tokens text-ink, text-ink-muted, bg-ink/5, ring-ink/10, border-ink/10, bg-action text-action-foreground, text-highlight, bg-canvas (they adapt to light and dark surfaces automatically, so contrast is always right). Icons are lucide-react elements, e.g. icon={<Zap />}. Actions: { label, href, variant?: "primary" | "secondary" | "ghost", icon?: <Download /> }.

Layout blocks are complete sections (they render their own <section>, page width, heading, and spacing): a section file returns exactly one block, never wraps it in <Section> or <Container>, and never nests one block in another. A card or tile surface must differ from its section's surface; omit it for the default tinted card.

Layout blocks (props):
- <SiteHeader variant="bar"|"floating" surface brand={{ name }} links={[{ label, href }]} cta={action} secondary?={action} /> - first element of app/page.tsx; 3 to 5 short links.
- <Hero variant="centered"|"split"|"panel" surface panelSurface? eyebrow? eyebrowIcon? title highlight? description actions note? visual? image? imageAlt? frame?="plain"|"tilt"|"arch"|"bleed" backdrop?="none"|"grid"|"glow" /> - image = a photo or render (panel: background; split/centered: the main visual when visual is omitted). frame styles that image: tilt = tilted inside an offset accent frame, arch = arched top, bleed (split) = runs to the page edge.
- <Ribbon surface bandSurface items={["SHORT PHRASE", ...]} tilt?="left"|"right"|"none" /> - full-bleed moving band of 4-6 short phrases (one to three words each) on bandSurface; place it between the hero and the next section.
- <LogoStrip surface label? items={[{ name, icon? }]} variant="row"|"marquee" /> - only things the product factually works with (networks, platforms, file formats); never auditors, investors, press, or customers.
- <FeatureCards id surface heading? variant="tall"|"numbered"|"icon"|"media" columns?={2|3|4} items={[{ title, description?, visual?, image?, icon?, surface?, label?, href? }]} /> - tall cards look best with each card on its own surface and a visual; numbered cards need only title and description (the numerals are automatic).
- <Bento id surface heading? tiles={[{ title, description?, visual?, image?, size?: "sm"|"md"|"lg"|"full"|"tall", surface?, textPosition?: "top"|"bottom" }]} /> - a row is 6 units: sm=2, md=3, lg=4, full=6 (e.g. lg+sm, md+md, sm+sm+sm).
- <FeatureSplit id surface heading? rows={[{ eyebrow?, title, description, bullets?, actions?, visual? or image?, visualSurface? }]} />
- <Steps id surface heading? steps={[{ title, description, visual? }]} />
- <Statement id surface size?="md"|"lg" eyebrow? text highlight? attribution? /> - the brand's own positioning in its own voice; attribution names the brand or team (e.g. "The Apex team"), never an invented customer, and carries no numbers.
- <Faq id surface heading layout="split"|"center" items={[{ question, answer }]} />
- <Pricing id surface heading? tiers={[{ name, price, period?, description, features, cta, featured?, badge? }]} />
- <Cta id variant="panel"|"centered" surface panelSurface? pattern?="glow"|"stripes"|"dots"|"grid"|"none" eyebrow? title highlight? description? actions visual? image? />
- <SiteFooter surface brand={{ name, tagline? }} columns={[{ title, links: [{ label, href }] }]} newsletter?={{ title, placeholder, button }} legal? />
- heading = { eyebrow?, eyebrowIcon?, eyebrowStyle?: "pill"|"label", title, highlight?, description?, align?: "left"|"center"|"split", actions? }
- Restraint: highlight picks out one phrase of a title (in the accent color, serif italic, or a marker, depending on the design system); use it in the hero and at most two other headings, never in every heading. Eyebrows (small labels above titles) on the hero and at most two other sections; a pill above every title is the generic AI-template look.
- Building your own section: <Section id surface spacing?="normal"|"compact"> + <SectionHeading {...heading} /> + your grid; <Container> gives the page width.

Visual primitives (compose these into the visual slots for software UI; they are crisp, on-brand, and fully editable, so app screens are always built from them rather than generated as an image. Physical products, food, places, people, objects, and illustration are generated images instead: write the placeholder image="asset:<kebab-name>" on a block (Hero, FeatureCards item, Bento tile, FeatureSplit row, Cta panel), which fills the frame edge to edge, or <Photo src="asset:<kebab-name>" /> in your own layout; Bloom generates them after the page is composed and swaps in the real files. Never put a photo inside a padded white box):
- <Stage surface? pattern?="none"|"dots"|"grid"|"rings" align?="center"|"bottom" className?> - rounded backdrop that frames a visual; align="bottom" lets a device bleed off the bottom edge.
- <PhoneFrame surface? tilt?="none"|"left"|"right"> screen content </PhoneFrame>, <BrowserFrame url? surface?> content </BrowserFrame>, <AppShell nav={[{ label, icon }]} active title actions?> content </AppShell> (desktop app chrome with sidebar).
- Screen content: <ScreenHeader title subtitle? trailing? />, <MetricCard label value delta? trend?="up"|"down">optional chart</MetricCard>, <ListRow leading? title subtitle? value? meta? trend? />, <AreaChart values={[...numbers]} tone?={1-5} />, <BarChart values highlight? tone? />, <Progress label? value={0-100} tone? />, <Toggle label on? />, <MockButton variant?>label</MockButton>, <Tag tone?>text</Tag>, <TokenIcon symbol tone? />, <Avatar name tone? />, <AvatarStack names />, <ChatBubble from="me"|"them">text</ChatBubble>, <CodeBlock title? lines={[...]} />, <IconTile icon />, <Orbit center items={[...]} />.
- <Floating className="-left-6 top-20"> small card </Floating> - absolutely positioned card that floats over a Stage for depth (hidden on mobile).
- A card or tile visual fills most of its slot: a panel (rounded-2xl bg-canvas p-4 shadow-xl ring-1 ring-ink/10, w-full max-w-sm) holding a ScreenHeader plus two or three ListRows, a MetricCard with a chart, a BrowserFrame, or a PhoneFrame. A single small pill, badge, or icon is not a visual.
- Numbers inside mockups are fictional product UI (balances, prices); keep them plausible and never repeat them as marketing claims.

Example section file (components/hero.tsx):
import { Download } from "lucide-react"
import { Hero, Stage, PhoneFrame, ScreenHeader, MetricCard, AreaChart, ListRow, TokenIcon, Floating } from "@/components/blocks"
export function HeroSection() {
  return (
    <Hero variant="centered" surface={1} title="Trade every chain from one calm place"
      description="..." actions={[{ label: "Download", href: "#download", icon: <Download /> }, { label: "How it works", href: "#features", variant: "secondary" }]}
      visual={
        <Stage surface={3} pattern="rings" align="bottom" className="min-h-[34rem]">
          <PhoneFrame className="translate-y-10">
            <ScreenHeader subtitle="Main wallet" title="Portfolio" />
            <MetricCard label="Balance" value="$12,480.22" delta="4.2%"><AreaChart values={[12, 14, 13, 17, 16, 19, 23]} className="h-16" /></MetricCard>
            <ListRow leading={<TokenIcon symbol="ETH" tone={4} />} title="Ethereum" subtitle="2.41 ETH" value="$7,812.04" meta="1.8%" trend="up" />
          </PhoneFrame>
          <Floating className="top-20 left-[12%]"><p className="text-xs text-ink-muted">Swap complete</p><p className="text-sm font-semibold">0.5 ETH to 9.8 SOL</p></Floating>
        </Stage>
      }
    />
  )
}`;
}
