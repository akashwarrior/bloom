import Image from "next/image";

const condensed = { fontVariationSettings: '"wdth" 75, "opsz" 96' };

export function EditorialCard() {
  return (
    <div className="flex h-full flex-col bg-[#F3EFE6] p-[7cqw] text-[#1A1814]">
      <div className="flex items-baseline justify-between border-b border-[#1A1814]/25 pb-[3cqw]">
        <span className="font-serif text-[6cqw] tracking-[-0.02em]">Hart & Wills</span>
        <span className="text-[3.2cqw] uppercase tracking-[0.16em] opacity-60">Est. 1921</span>
      </div>
      <div className="relative mt-[6cqw] h-[52cqw] overflow-hidden bg-[#9A7F5E]">
        <Image src="/landing/work/hart.webp" alt="" fill sizes="360px" className="object-cover object-[30%_50%] sepia-[0.25]" />
      </div>
      <p className="mt-auto font-serif text-[11.5cqw] font-light leading-[0.98] tracking-[-0.03em]">
        The quiet art of <em className="text-[#7A1F2B]">keeping</em> well.
      </p>
      <div className="mt-[5cqw] grid grid-cols-3 border-t border-[#1A1814]/25 pt-[2.5cqw] text-[3cqw] opacity-70">
        <span>Wealth</span>
        <span>Estates</span>
        <span>Family office</span>
      </div>
    </div>
  );
}

export function MidnightCard() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#08090C] p-[7cqw] text-[#ECEEF2]">
      <div className="pointer-events-none absolute -top-[30cqw] left-1/2 h-[70cqw] w-[130cqw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(52,211,153,0.35),transparent)]" />
      <div className="relative flex items-center justify-between text-[3.6cqw]">
        <span className="flex items-center gap-[2cqw] text-[5.5cqw] font-semibold tracking-[-0.04em]">
          <span className="size-[4.5cqw] rounded-[1.2cqw] bg-[#34D399]" />
          tally
        </span>
        <span className="rounded-full bg-[#ECEEF2] px-[3.5cqw] py-[1.6cqw] text-[#08090C]">Open account</span>
      </div>
      <p className="relative mt-[14cqw] text-center text-[12cqw] font-medium leading-[0.95] tracking-[-0.055em]">
        Get paid.
        <br />
        <span className="text-[#ECEEF2]/40">Skip the spreadsheet.</span>
      </p>
      <div className="relative mt-auto rounded-[3cqw] border border-white/10 bg-white/[0.03] p-[5cqw]">
        <div className="flex justify-between text-[3cqw] text-[#ECEEF2]/50">
          <span>Balance</span>
          <span className="text-[#34D399]">+12.4%</span>
        </div>
        <div className="mt-[1.5cqw] font-mono text-[8cqw] tracking-[-0.05em]">$48,210</div>
        <div className="mt-[4cqw] flex h-[16cqw] items-end gap-[1.6cqw]">
          {[30, 46, 38, 58, 50, 66, 60, 92].map((h, i) => (
            <div key={i} className={i === 7 ? "flex-1 rounded-t-[1cqw] bg-[#34D399]" : "flex-1 rounded-t-[1cqw] bg-white/10"} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrganicCard() {
  return (
    <div className="flex h-full flex-col bg-[#F3F0E8] p-[7cqw] text-[#23271F]">
      <div className="flex items-center justify-between text-[3.6cqw]">
        <span className="font-serif text-[7cqw] italic tracking-[-0.02em]">Kiln</span>
        <span className="rounded-full bg-[#B5643C] px-[3.5cqw] py-[1.6cqw] text-[#F3F0E8]">Book a visit</span>
      </div>
      <div className="relative mt-[6cqw] h-[66cqw] overflow-hidden rounded-t-full bg-[#B5643C]">
        <Image src="/landing/work/kiln.webp" alt="" fill sizes="360px" className="object-cover object-[50%_72%]" />
      </div>
      <p className="mt-auto font-serif text-[11cqw] font-light leading-[0.98] tracking-[-0.035em]">
        Slow-fired for the <em className="text-[#B5643C]">everyday</em> table.
      </p>
    </div>
  );
}

export function KineticCard() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0A0A0B] text-[#F4F4F0]">
      <div className="flex items-center justify-between px-[7cqw] pt-[7cqw] text-[3.4cqw] uppercase tracking-[0.12em]">
        <span className="font-semibold">Nocturne®</span>
        <span className="bg-[#FF5A1F] px-[3cqw] py-[1.4cqw] font-semibold text-[#0A0A0B]">Tickets</span>
      </div>
      <div className="relative mt-[8cqw] px-[5cqw]">
        <div className="absolute right-[2cqw] top-[12cqw] size-[52cqw] overflow-hidden rounded-full bg-[#FF5A1F]">
          <Image src="/landing/work/sax.webp" alt="" fill sizes="240px" className="object-cover object-[50%_20%] mix-blend-multiply contrast-[1.25] grayscale" />
        </div>
        <p className="relative font-poster text-[33cqw] font-extrabold uppercase leading-[0.8] tracking-[-0.05em]" style={condensed}>
          After
          <br />
          Dark
        </p>
      </div>
      <div className="relative -mx-[4cqw] mt-[9cqw] -rotate-[4deg] bg-[#FF5A1F] py-[2cqw] text-[#0A0A0B]">
        <p className="whitespace-nowrap font-poster text-[5.6cqw] font-extrabold uppercase" style={condensed}>
          Jazz on the Rio Tejo · 14—16 Aug · Until 4am · Jazz on the Rio Tejo
        </p>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-[3cqw] px-[7cqw] pb-[7cqw] text-[3cqw]">
        {["Fri 14", "Sat 15", "Sun 16"].map((day) => (
          <div key={day} className="border-t border-[#F4F4F0]/25 pt-[2cqw]">
            <span className="uppercase tracking-[0.1em] text-[#FF5A1F]">{day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PopCard() {
  return (
    <div className="flex h-full flex-col bg-[#FFF8EF] p-[7cqw] text-[#1D1631]">
      <div className="flex items-center justify-between text-[3.6cqw]">
        <span className="font-poster text-[7cqw] font-extrabold tracking-[-0.05em]">pantry</span>
        <span className="rounded-full bg-[#1D1631] px-[3.5cqw] py-[1.6cqw] text-[#FFF8EF]">Get the app</span>
      </div>
      <p className="mt-[9cqw] font-poster text-[14cqw] font-extrabold leading-[0.9] tracking-[-0.055em]">
        Dinner,{" "}
        <span className="relative inline-block">
          <span className="absolute inset-x-[-3%] bottom-[6%] top-[50%] -rotate-2 rounded-[1cqw] bg-[#FFC22E]" />
          <span className="relative">sorted</span>
        </span>{" "}
        by six.
      </p>
      <div className="mt-auto grid grid-cols-[1.25fr_1fr] gap-[3.5cqw]">
        <div className="relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[7cqw] bg-[#FFC22E] p-[4cqw] text-[3.4cqw]">
          <Image src="/landing/work/orzo.webp" alt="" fill sizes="200px" className="object-cover" />
          <span className="relative w-fit whitespace-nowrap rounded-full bg-white px-[2.6cqw] py-[1.3cqw] text-[3cqw] font-semibold">Tomato orzo · 25m</span>
        </div>
        <div className="grid grid-rows-[1fr_auto] gap-[3.5cqw]">
          <div className="relative overflow-hidden rounded-full bg-[#C9A2F0]">
            <Image src="/landing/work/pesto.webp" alt="" fill sizes="160px" className="object-cover" />
          </div>
          <div className="rounded-[7cqw] bg-[#7B5CFF] px-[4cqw] py-[3.5cqw] text-[3.4cqw] font-semibold leading-tight text-white">
            240 more,
            <br />
            all under 30 min
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoirCard() {
  return (
    <div className="flex h-full flex-col items-center bg-[#0B0A09] p-[7cqw] text-center text-[#EEE8DD]">
      <span className="text-[3.2cqw] uppercase tracking-[0.45em] text-[#C9A96E]">Maison Oriel</span>
      <div className="relative -mx-[7cqw] mt-[2cqw] h-[92cqw] w-[calc(100%+14cqw)] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_68%,transparent)]">
        <Image src="/landing/work/watch.webp" alt="" fill sizes="360px" className="object-cover object-[50%_55%]" />
      </div>
      <p className="-mt-[10cqw] font-serif text-[11cqw] font-light leading-[1] tracking-[-0.02em]">
        Hours, <em>kept</em>
        <br />
        beautifully.
      </p>
      <span className="mt-[6cqw] h-px w-[16cqw] bg-[#C9A96E]" />
      <span className="mt-[3cqw] text-[2.8cqw] uppercase tracking-[0.32em] opacity-60">Calibre 9 collection</span>
    </div>
  );
}

export function SwissCard() {
  return (
    <div className="relative flex h-full flex-col bg-[#F6F6F4] p-[7cqw] text-[#0D0D0D]">
      <div className="pointer-events-none absolute inset-0 grid grid-cols-4 px-[7cqw]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-l border-[#0D0D0D]/10 last:border-r" />
        ))}
      </div>
      <div className="relative flex items-center justify-between font-mono text-[3.2cqw] uppercase">
        <span className="font-sans text-[5.5cqw] font-bold normal-case tracking-[-0.05em]">Relay</span>
        <span>Docs / Pricing</span>
      </div>
      <span className="relative mt-[12cqw] font-mono text-[3.2cqw] uppercase">
        <span className="text-[#E5352B]">■</span> p99 latency 4.2ms
      </span>
      <p className="relative mt-[3cqw] font-sans text-[15cqw] font-bold leading-[0.88] tracking-[-0.07em]">
        Ship at
        <br />
        the edge.
      </p>
      <div className="relative mt-auto border-t-2 border-[#0D0D0D]">
        {[
          ["Regions", "38"],
          ["Uptime", "99.99%"],
          ["Cold start", "0ms"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-[#0D0D0D]/15 py-[2cqw] font-mono text-[3.2cqw] uppercase">
            <span>{k}</span>
            <span className={k === "Cold start" ? "text-[#E5352B]" : ""}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
