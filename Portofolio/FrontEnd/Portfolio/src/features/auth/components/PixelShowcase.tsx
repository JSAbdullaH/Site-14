import { useEffect, useMemo, useState } from "react";

type Frame = {
  title: string;
  subtitle: string;
  label: string;
  note: string;
  tone: string;
  art: string[];
};

const COLORS: Record<string, string> = {
  "#": "#1A1A1A",
  o: "#DB4406",
  g: "#3F7A4F",
  w: "#F4F3EF",
  l: "#D6D3CD",
};

const FRAMES: Frame[] = [
  {
    title: "EVERY 5 SEC",
    subtitle: "Location on the map",
    label: "LIVE",
    note: "Zones and alerts in real time",
    tone: "#DB4406",
    art: [
      "...#####################....",
      "..#.....................#...",
      ".#...o..........#######..#..",
      ".#..ooo.........#.....#..#..",
      ".#.ooooo........#.ooo.#..#..",
      ".#..ooo.........#.ooo.#..#..",
      ".#...o..........#######..#..",
      ".#.......................#..",
      ".#....#######............#..",
      ".#....#.....#.......o....#..",
      ".#....#.ooo.#......ooo...#..",
      ".#....#.ooo.#.....ooooo..#..",
      ".#....#######......ooo...#..",
      ".#...................o...#..",
      "..#.....................#...",
      "...#####################....",
    ],
  },
  {
    title: "1 SCAN",
    subtitle: "To connect a device",
    label: "DEVICES",
    note: "Phones, watches and badges",
    tone: "#15607A",
    art: [
      "..........######............",
      "..........######............",
      ".........########...........",
      "........##########..........",
      ".......##llllllll##.........",
      ".......##llllllll##.........",
      ".......##llllolll##.........",
      ".......##llloooll###........",
      ".......##llloooll###........",
      ".......##llllolll##.........",
      ".......##llllllll##.........",
      ".......##llllllll##.........",
      "........##########..........",
      ".........########...........",
      "..........######............",
      "..........######............",
    ],
  },
  {
    title: "SHA-256",
    subtitle: "On every report",
    label: "REPORTS",
    note: "Check any PDF in seconds",
    tone: "#3F7A4F",
    art: [
      ".......############.........",
      ".......#wwwwwwwwww##........",
      ".......#wwwwwwwwww#w#.......",
      ".......#wwwwwwwwww####......",
      ".......#ww#########ww#......",
      ".......#wwwwwwwwwwwww#......",
      ".......#ww########www#......",
      ".......#wwwwwwwwwwwww#......",
      ".......#ww#######wwww#......",
      ".......#wwwwwwwwwwwww#......",
      ".......#wwwwwwwww.ggggg.....",
      ".......#wwwwwwww.gggggwg....",
      ".......#wwwwwwww.ggggwgg....",
      ".......#wwwwwwww.gwgwggg....",
      ".......#wwwwwwww.ggwgggg....",
      ".......##########.ggggg.....",
    ],
  },
];

const COLS = 28;
const ROWS = 16;
const CELL = 16;
const HOLD_MS = 3800;

type Pixel = { x: number; y: number; color: string };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pixelsOf(art: string[], seed: number): Pixel[] {
  const list: Pixel[] = [];
  art.forEach((row, y) => {
    row.padEnd(COLS, ".").split("").forEach((ch, x) => {
      if (COLORS[ch]) list.push({ x, y, color: COLORS[ch] });
    });
  });
  const rand = seeded(seed);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function PixelShowcase() {
  const [index, setIndex] = useState(0);
  const still = useMemo(prefersReducedMotion, []);
  const frames = useMemo(() => FRAMES.map((f, i) => pixelsOf(f.art, i + 7)), []);
  const count = Math.max(...frames.map((f) => f.length));
  const delays = useMemo(() => {
    const rand = seeded(42);
    return Array.from({ length: count }, () => Math.round(rand() * 350));
  }, [count]);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % FRAMES.length), HOLD_MS);
    return () => clearInterval(timer);
  }, []);

  const frame = FRAMES[index];
  const pixels = frames[index];

  return (
    <div aria-hidden="true" className="w-[520px] max-w-full motion-safe:animate-jitter bg-[radial-gradient(circle,transparent_7px,#EDEDEB_7.5px)] bg-[length:22px_22px] bg-[position:-11px_-11px] p-3">
      <div className="bg-[#EDEDEB] px-8 pt-9 pb-8">
        <p className="font-pixel text-5xl leading-none tracking-wide transition-colors duration-700" style={{ color: frame.tone }}>
          {frame.title}
        </p>
        <p className="mt-4 font-pixel text-2xl transition-colors duration-700" style={{ color: frame.tone }}>
          {frame.subtitle}
        </p>

        <div
          className="relative mx-auto mt-8 bg-[radial-gradient(#C9C6C0_1px,transparent_1.5px)]"
          style={{ width: COLS * CELL, height: ROWS * CELL, backgroundSize: `${CELL}px ${CELL}px` }}
        >
          {Array.from({ length: count }, (_, i) => {
            const shown = i < pixels.length;
            const p = shown ? pixels[i] : pixels[i % pixels.length];
            return (
              <span
                key={i}
                className="absolute top-0 left-0"
                style={{
                  width: CELL - 1,
                  height: CELL - 1,
                  backgroundColor: p.color,
                  opacity: shown ? 1 : 0,
                  transform: `translate(${p.x * CELL}px, ${p.y * CELL}px)`,
                  transition: still
                    ? "none"
                    : `transform 900ms cubic-bezier(0.65,0,0.35,1) ${delays[i]}ms, background-color 600ms ease ${delays[i]}ms, opacity 400ms ease ${delays[i]}ms`,
                }}
              />
            );
          })}
        </div>

        <div className="mt-8 flex items-end justify-between gap-4">
          <span className="font-pixel text-2xl tracking-widest transition-colors duration-700" style={{ color: frame.tone }}>
            {frame.label}
          </span>
          <span className="text-right text-base text-muted-foreground">{frame.note}</span>
        </div>
      </div>
    </div>
  );
}
