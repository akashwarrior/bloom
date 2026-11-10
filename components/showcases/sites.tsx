import {
  EditorialCard,
  KineticCard,
  MidnightCard,
  NoirCard,
  OrganicCard,
  PopCard,
  SwissCard,
} from "./cards";

type Site = {
  id: string;
  name: string;
  kind: string;
  direction: string;
  bg: string;
  Card: () => React.ReactNode;
};

export const SITES: Site[] = [
  {
    id: "hart",
    name: "Hart & Wills",
    kind: "Family office",
    direction: "Editorial paper",
    bg: "#c4b5ff",
    Card: EditorialCard,
  },
  {
    id: "tally",
    name: "Tally",
    kind: "Fintech app",
    direction: "Midnight product",
    bg: "#9fdcff",
    Card: MidnightCard,
  },
  {
    id: "nocturne",
    name: "Nocturne",
    kind: "Jazz festival",
    direction: "Kinetic contrast",
    bg: "#121110",
    Card: KineticCard,
  },
  {
    id: "kiln",
    name: "Kiln",
    kind: "Ceramics studio",
    direction: "Warm organic",
    bg: "#d6f36b",
    Card: OrganicCard,
  },
  {
    id: "pantry",
    name: "Pantry",
    kind: "Recipe app",
    direction: "Playful pop",
    bg: "#ffb8e0",
    Card: PopCard,
  },
  {
    id: "oriel",
    name: "Maison Oriel",
    kind: "Watchmaker",
    direction: "Luxe noir",
    bg: "#e8c872",
    Card: NoirCard,
  },
  {
    id: "relay",
    name: "Relay",
    kind: "Developer platform",
    direction: "Swiss precision",
    bg: "#ececea",
    Card: SwissCard,
  },
];

export function SiteTile({ site }: { site: Site }) {
  const { Card } = site;
  return (
    <div
      className="relative flex h-full w-full items-end justify-center overflow-hidden px-[9%]"
      style={{ background: site.bg }}
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-t-[10px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)] [container-type:inline-size]">
        <Card />
      </div>
    </div>
  );
}
