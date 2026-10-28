import { Check } from "lucide-react";
import { BloomLogo } from "@/components/bloom-logo";
import { EditorialCard, KineticCard, MidnightCard, NoirCard, OrganicCard, PopCard, SwissCard } from "./fan-cards";

export type Site = {
  id: string;
  name: string;
  kind: string;
  direction: string;
  prompt: string;
  bg: string;
  Card: () => React.ReactNode;
};

export const SITES: Site[] = [
  { id: "hart", name: "Hart & Wills", kind: "Family office", direction: "Editorial paper", prompt: "A hundred-year-old family office that should feel discreet, not dusty.", bg: "#c4b5ff", Card: EditorialCard },
  { id: "tally", name: "Tally", kind: "Fintech app", direction: "Midnight product", prompt: "Invoicing for freelancers. Fast, calm, a little bit premium.", bg: "#9fdcff", Card: MidnightCard },
  { id: "nocturne", name: "Nocturne", kind: "Jazz festival", direction: "Kinetic contrast", prompt: "A late-night jazz festival in Lisbon. Loud posters, sold-out energy.", bg: "#121110", Card: KineticCard },
  { id: "kiln", name: "Kiln", kind: "Ceramics studio", direction: "Warm organic", prompt: "A ceramics studio in Kyoto. Quiet, warm, handmade.", bg: "#d6f36b", Card: OrganicCard },
  { id: "pantry", name: "Pantry", kind: "Recipe app", direction: "Playful pop", prompt: "Weeknight recipes for people who hate meal planning. Make it fun.", bg: "#ffb8e0", Card: PopCard },
  { id: "oriel", name: "Maison Oriel", kind: "Watchmaker", direction: "Luxe noir", prompt: "An independent watchmaker. Dark, precise, very expensive.", bg: "#e8c872", Card: NoirCard },
  { id: "relay", name: "Relay", kind: "Developer platform", direction: "Swiss precision", prompt: "Edge infrastructure for developers. Swiss, exact, no fluff.", bg: "#ececea", Card: SwissCard },
] as const;

export function Cursor({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <div className={`pointer-events-none absolute z-10 flex items-start gap-0.5 ${className}`}>
      <svg viewBox="0 0 16 16" className="size-[18px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.2)]">
        <path d="M2 1.5 14 7.2 8.4 8.6 6 14.4Z" fill={color} stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className="mt-3.5 rounded-full px-2 py-[3px] text-[12px] font-medium leading-none text-white" style={{ background: color }}>
        {name}
      </span>
    </div>
  );
}

export function SiteTile({ site, prompt = false, cursor }: { site: Site; prompt?: boolean; cursor?: string }) {
  const { Card } = site;
  return (
    <div className="relative flex h-full w-full items-end justify-center overflow-hidden px-[9%]" style={{ background: site.bg }}>
      {prompt && (
        <p className="absolute left-5 top-5 z-10 max-w-[min(230px,80%)] rounded-[14px] rounded-tl-[4px] bg-white px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-[0_12px_24px_-12px_rgba(0,0,0,0.25)]">
          {site.prompt}
        </p>
      )}
      {cursor && <Cursor name="Bloom" color={cursor} className="right-[12%] top-[38%]" />}
      <div className="aspect-[3/4] w-full translate-y-[14%] overflow-hidden rounded-t-[10px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)] [container-type:inline-size]">
        <Card />
      </div>
    </div>
  );
}

export function TypeTile() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between bg-[#2f5bff] p-5 text-white">
      <div className="flex items-center justify-between rounded-[10px] bg-white/15 px-3 py-2 text-[12.5px] backdrop-blur">
        <span>Instrument Serif</span>
        <span className="opacity-70">Italic</span>
      </div>
      <p className="pl-2 font-accent text-[clamp(8rem,13vw,11rem)] italic leading-none tracking-[-0.03em]">Aa</p>
      <div className="space-y-3 rounded-[10px] bg-white p-3.5 text-[12px] text-ink">
        {[
          ["Size", "96", 72],
          ["Leading", "0.95", 40],
        ].map(([label, value, fill]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-14 text-ink/55">{label}</span>
            <span className="relative h-1 flex-1 rounded-full bg-ink/10">
              <span className="absolute inset-y-0 left-0 rounded-full bg-[#2f5bff]" style={{ width: `${fill}%` }} />
              <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#2f5bff] bg-white" style={{ left: `${fill}%` }} />
            </span>
            <span className="w-8 text-right font-mono text-[11px]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaletteTile() {
  const swatches = ["#F3F0E8", "#B5643C", "#6F8F6A", "#23271F"];
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-4 bg-[#ffd43b] p-5">
      <div className="rounded-[12px] bg-white p-4 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.3)]">
        <p className="text-[12px] font-medium text-ink">Palette · Warm organic</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {swatches.map((color) => (
            <div key={color}>
              <div className="aspect-square rounded-[8px] ring-1 ring-black/10" style={{ background: color }} />
              <p className="mt-1.5 font-mono text-[9.5px] text-ink/55">{color}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-[12px] bg-ink p-4 text-white">
        <span className="grid size-8 place-items-center rounded-full bg-[#19c37d]">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div className="text-[12px] leading-snug">
          <p className="font-medium">Contrast 7.4 : 1</p>
          <p className="text-white/55">Passes AA on every pair</p>
        </div>
      </div>
      <Cursor name="Bloom" color="#f0461e" className="bottom-[22%] right-8" />
    </div>
  );
}

export function ChatTile() {
  return (
    <div className="relative flex h-full w-full flex-col justify-end gap-3 bg-[#f0461e] p-5">
      <p className="ml-auto max-w-[220px] rounded-[16px] rounded-br-[4px] bg-ink px-3.5 py-2.5 text-[13.5px] leading-snug text-white">
        Make it feel like evening.
      </p>
      <div className="max-w-[240px] rounded-[16px] rounded-bl-[4px] bg-white p-3.5 text-[13px] leading-snug text-ink">
        <p className="flex items-center gap-1.5 text-[12px] text-ink/50">
          <BloomLogo className="size-3.5 text-ink" /> Bloom
        </p>
        <p className="mt-1.5">Switched to a night palette. Roasted umber, and contrast still passes AA.</p>
        <div className="mt-3 flex gap-1.5">
          {["#1C1712", "#8A4B2A", "#D9A066", "#F2E6D3"].map((color) => (
            <span key={color} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: color }} />
          ))}
        </div>
      </div>
      <p className="absolute left-5 top-5 font-display text-[44px] font-medium leading-[0.95] tracking-[-0.04em] text-white">
        Edit in
        <br />
        plain words.
      </p>
    </div>
  );
}

export function LayoutTile() {
  return (
    <div className="relative flex h-full w-full flex-col bg-[#19c37d] p-5">
      <div className="flex flex-1 flex-col gap-2 rounded-[12px] bg-white/95 p-3">
        <div className="flex items-center justify-between">
          <span className="h-2 w-10 rounded-full bg-ink/80" />
          <span className="flex gap-1.5">
            <span className="h-2 w-6 rounded-full bg-ink/15" />
            <span className="h-2 w-6 rounded-full bg-ink/15" />
            <span className="h-2 w-8 rounded-full bg-[#19c37d]" />
          </span>
        </div>
        <div className="mt-2 grid flex-[1.4] grid-cols-[1.2fr_1fr] gap-2">
          <div className="flex flex-col justify-end gap-1.5 rounded-[6px] border border-dashed border-ink/25 p-2">
            <span className="h-3 w-[90%] rounded-sm bg-ink/80" />
            <span className="h-3 w-[70%] rounded-sm bg-ink/80" />
            <span className="mt-1 h-1.5 w-[80%] rounded-full bg-ink/15" />
          </div>
          <div className="rounded-[6px] border border-dashed border-ink/25 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(0,0,0,0.05)_6px_7px)]" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[6px] border border-dashed border-ink/25" />
          ))}
        </div>
      </div>
      <p className="mt-4 flex items-center justify-between text-[13px] font-medium text-white">
        Composed 5 sections
        <span className="font-mono text-[11px] opacity-80">12-col grid</span>
      </p>
      <Cursor name="Bloom" color="#121110" className="left-[45%] top-[34%]" />
    </div>
  );
}

export const STRIP = [
  <SiteTile key="kiln" site={SITES[3]} prompt />,
  <TypeTile key="type" />,
  <SiteTile key="pantry" site={SITES[4]} cursor="#f0461e" />,
  <ChatTile key="chat" />,
  <SiteTile key="nocturne" site={SITES[2]} prompt />,
  <PaletteTile key="palette" />,
  <SiteTile key="hart" site={SITES[0]} cursor="#2f5bff" />,
  <LayoutTile key="layout" />,
  <SiteTile key="tally" site={SITES[1]} prompt />,
  <SiteTile key="relay" site={SITES[6]} cursor="#19c37d" />,
  <SiteTile key="oriel" site={SITES[5]} prompt />,
];
