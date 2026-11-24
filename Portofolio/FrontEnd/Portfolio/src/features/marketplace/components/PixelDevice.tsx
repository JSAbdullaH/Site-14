import type { DeviceType } from "@/shared/lib/deviceTypes";

const PALETTE: Record<string, string> = { "#": "#252525", o: "#D4D2CF", r: "#DB4406" };

const SPRITES: Record<DeviceType, { rows: string[]; size: number }> = {
  watch: {
    size: 7,
    rows: [
      "....######....",
      "....######....",
      "....######....",
      "...########...",
      "..##########..",
      ".############.",
      ".##oooooooo##.",
      ".##ooorrooo##.",
      ".##oorrrroo###",
      ".##oorrrroo###",
      ".##ooorrooo##.",
      ".##ooooroooo#.",
      ".##oooooooo##.",
      ".##oooooooo##.",
      ".############.",
      "..##########..",
      "...########...",
      "....######....",
      "....######....",
      "....######....",
    ],
  },
  tracker: {
    size: 8,
    rows: [
      "...######...",
      "..########..",
      ".##########.",
      "##oooooooo##",
      "##oooooooo##",
      "##ooorrooo##",
      "##oorrrroo##",
      "##ooorrooo##",
      "##oooroooo##",
      "##oooooooo##",
      "##oooooooo##",
      ".##########.",
      "..########..",
      "...######...",
    ],
  },
  phone: {
    size: 7,
    rows: [
      "############",
      "#oooooooooo#",
      "#oooooooooo#",
      "#oooooooooo#",
      "#ooooorrooo#",
      "#oooorrrroo#",
      "#oooorrrroo#",
      "#ooooorrooo#",
      "#oooooroooo#",
      "#oooooooooo#",
      "#oooooooooo#",
      "#oooooooooo#",
      "#oooooooooo#",
      "#oooooooooo#",
      "############",
      "####....####",
      "############",
    ],
  },
  tablet: {
    size: 7,
    rows: [
      "##################",
      "#oooooooooooooooo#",
      "#oooooooooooooooo#",
      "#oooooooooooooooo#",
      "#oooooooorroooooo#",
      "#ooooooorrrrooooo#",
      "#ooooooorrrrooooo#",
      "#oooooooorroooooo#",
      "#oooooooorooooooo#",
      "#oooooooooooooooo#",
      "#oooooooooooooooo#",
      "#oooooooooooooooo#",
      "##################",
      "#######....#######",
      "##################",
    ],
  },
  laptop: {
    size: 7,
    rows: [
      "..################..",
      "..#oooooooooooooo#..",
      "..#oooooooooooooo#..",
      "..#ooooooorrooooo#..",
      "..#oooooorrrroooo#..",
      "..#oooooorrrroooo#..",
      "..#ooooooorrooooo#..",
      "..#oooooooroooooo#..",
      "..#oooooooooooooo#..",
      "..#oooooooooooooo#..",
      "..################..",
      "####################",
      "########....########",
      ".##################.",
    ],
  },
  desktop: {
    size: 7,
    rows: [
      "##################",
      "#oooooooooooooooo#",
      "#oooooooooooooooo#",
      "#oooooooorroooooo#",
      "#ooooooorrrrooooo#",
      "#ooooooorrrrooooo#",
      "#oooooooorroooooo#",
      "#oooooooorooooooo#",
      "#oooooooooooooooo#",
      "##################",
      ".......####.......",
      ".......####.......",
      ".....########.....",
    ],
  },
};

export const PIXEL_COLOR: Record<DeviceType, string> = {
  watch: "#2F7D4F",
  tracker: "#1A1A1A",
  phone: "#B93A07",
  tablet: "#15607A",
  laptop: "#15607A",
  desktop: "#1A1A1A",
};

export default function PixelDevice({ type, label }: { type: DeviceType; label: string }) {
  const sprite = SPRITES[type] ?? SPRITES.tracker;
  const cols = Math.max(...sprite.rows.map((r) => r.length));
  const cells = sprite.rows.flatMap((r) => r.padEnd(cols, ".").slice(0, cols).split(""));
  return (
    <div
      role="img"
      aria-label={label}
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${cols}, ${sprite.size}px)`, gridAutoRows: `${sprite.size}px` }}
    >
      {cells.map((c, i) => (
        <span key={i} style={{ background: PALETTE[c] ?? "transparent" }} />
      ))}
    </div>
  );
}
