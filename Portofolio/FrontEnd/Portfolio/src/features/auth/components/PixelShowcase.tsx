import { useEffect, useMemo, useRef, useState } from "react";

type Frame = {
  title: string;
  subtitle: string;
  label: string;
  note: string;
  tone: string;
  art: string[];
  native?: boolean;
};

const COLORS: Record<string, string> = {
  "#": "#1A1A1A",
  o: "#DB4406",
  g: "#3F7A4F",
  w: "#F4F3EF",
  l: "#BDBAB4",
  "+": "#BDBAB4",
};

const SITE_TONES = [
  { mark: "#252525", mid: "#BDBAB4", text: "#B93A07" },
  { mark: "#B93A07", mid: "#E8C4B2", text: "#B93A07" },
  { mark: "#15607A", mid: "#BDBAB4", text: "#15607A" },
  { mark: "#2F7D4F", mid: "#BDBAB4", text: "#2F7D4F" },
];

const SITE_MARK = [
  "..###########################..",
  ".##+++++++++++++++++++++++++##.",
  "##++.+########+.....#####...+##",
  "#++.+###########....#####....+#",
  "#+..#####+.#####....#####....+#",
  "#+..#####+.+++++....#####....+#",
  "#+..########+.......#####....+#",
  "#+..+##########.....#####....+#",
  "#+...+##########....#####....+#",
  "#+......++######+...#####....+#",
  "#+..#####..#####+...#####....+#",
  "#+..#####++#####+...#####....+#",
  "#+..+###########....#####....+#",
  "#+...+########+.....#####....+#",
  "#+...........................+#",
  "#++++++++++++++..+++++++++++.+#",
  "#+#############.+###########.+#",
  "#+#############.+###########.+#",
  "#+++++#####++++.+####+.......+#",
  "#+....#####.....+####........+#",
  "#+....#####.....+##########..+#",
  "#+....#####.....+##########..+#",
  "#+....#####.....+##########..+#",
  "#+....#####.....+####........+#",
  "#+....#####.....+####........+#",
  "#++...#####.....+###########.+#",
  "##+...#####.....+###########+##",
  ".#############################.",
  "..###########################.."
,
];

const FRAMES: Frame[] = [
  {
    title: "SITE14",
    subtitle: "Field operations",
    label: "ORIGIN",
    note: "Riyadh 2026",
    tone: SITE_TONES[0].text,
    art: SITE_MARK,
    native: true,
  },
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

const COLS = 56;
const ROWS = 32;
const CELL = 8;
const HOLD_MS = 3800;
const LED_OFF = "#DCD9D3";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Shown = Frame & { mark?: string; mid?: string };

function frameAt(turn: number): Shown {
  const index = turn % FRAMES.length;
  const frame = FRAMES[index];
  if (index !== 0) return frame;
  const tone = SITE_TONES[Math.floor(turn / FRAMES.length) % SITE_TONES.length];
  return { ...frame, tone: tone.text, mark: tone.mark, mid: tone.mid };
}

function gridOf(frame: Shown) {
  if (!frame.native) return frame.art.flatMap((row) => [row, row]).map((row) => row.split("").map((ch) => ch + ch).join(""));
  const top = Math.floor((ROWS - frame.art.length) / 2);
  const left = Math.floor((COLS - frame.art[0].length) / 2);
  return Array.from({ length: ROWS }, (_, y) => ".".repeat(left) + (frame.art[y - top] ?? ""));
}

function colorsOf(frame: Shown) {
  const grid = gridOf(frame);
  const cells: (string | null)[] = [];
  for (let y = 0; y < ROWS; y++) {
    const row = (grid[y] ?? "").padEnd(COLS, ".");
    for (let x = 0; x < COLS; x++) {
      const ch = row[x];
      if (frame.mark && ch === "#") cells.push(frame.mark);
      else if (frame.mid && ch === "+") cells.push(frame.mid);
      else cells.push(COLORS[ch] ?? null);
    }
  }
  return cells;
}

const STEP_MS = 70;
const scanDelay = (i: number) => Math.floor(i / COLS) * 28 + (i % COLS) * 2;

function paint(led: HTMLElement, color: string | null, dim = false) {
  const fill = color && dim ? `color-mix(in srgb, ${color} 45%, ${LED_OFF})` : color ?? LED_OFF;
  led.style.backgroundColor = fill;
  led.style.boxShadow = color && !dim ? `0 0 3px color-mix(in srgb, ${color} 40%, transparent)` : "none";
}

export default function PixelShowcase() {
  const [turn, setTurn] = useState(0);
  const still = useMemo(prefersReducedMotion, []);
  const board = useRef<HTMLDivElement>(null);
  const shown = useRef<(string | null)[]>(Array.from({ length: COLS * ROWS }, () => null));

  useEffect(() => {
    const timer = setInterval(() => setTurn((t) => t + 1), HOLD_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = board.current;
    if (!root) return;
    const leds = Array.from(root.children) as HTMLElement[];
    const next = colorsOf(frameAt(turn));
    const before = shown.current;
    const changed: number[] = [];
    next.forEach((c, i) => {
      if (c !== before[i]) changed.push(i);
    });
    shown.current = next;

    if (still) {
      changed.forEach((i) => paint(leds[i], next[i]));
      return;
    }

    const phase = new Array<number>(changed.length).fill(-1);
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const t = performance.now() - start;
      let pending = false;
      changed.forEach((i, k) => {
        const local = t - scanDelay(i);
        if (local < 0) {
          pending = true;
          return;
        }
        const step = next[i] ? Math.min(Math.floor(local / STEP_MS), 4) : 4;
        if (step === phase[k]) {
          if (step < 4) pending = true;
          return;
        }
        phase[k] = step;
        if (step === 0) paint(leds[i], null);
        else if (step === 1) paint(leds[i], next[i]);
        else if (step === 2) paint(leds[i], next[i], true);
        else paint(leds[i], next[i]);
        if (step < 4) pending = true;
      });
      if (pending) frame = window.setTimeout(tick, 16);
    };
    tick();
    return () => {
      window.clearTimeout(frame);
      changed.forEach((i) => paint(leds[i], next[i]));
    };
  }, [turn, still]);

  const frame = frameAt(turn);

  return (
    <div aria-hidden="true" className="w-[520px] max-w-full motion-safe:animate-jitter bg-[radial-gradient(circle,transparent_7px,#EDEDEB_7.5px)] bg-[length:22px_22px] bg-[position:-11px_-11px] p-3">
      <div className="bg-[#EDEDEB] px-8 pt-9 pb-8">
        <p className="font-pixel text-5xl leading-none tracking-wide transition-colors duration-500" style={{ color: frame.tone }}>
          {frame.title}
        </p>
        <p className="mt-4 font-pixel text-2xl transition-colors duration-500" style={{ color: frame.tone }}>
          {frame.subtitle}
        </p>

        <div
          ref={board}
          className="mx-auto mt-8 grid gap-px"
          style={{ width: COLS * CELL, gridTemplateColumns: `repeat(${COLS}, ${CELL - 1}px)`, gridAutoRows: `${CELL - 1}px` }}
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <span key={i} className="rounded-[1px]" style={{ backgroundColor: LED_OFF }} />
          ))}
        </div>

        <p className="mt-8 font-pixel text-2xl tracking-widest transition-colors duration-500" style={{ color: frame.tone }}>
          {frame.label}
        </p>
      </div>
    </div>
  );
}
