type Props = {
  cells: { bg: string }[];
  cols: number;
  size: number;
  gap?: number;
  label: string;
  className?: string;
};

export function PixelGrid({ cells, cols, size, gap = 0, label, className }: Props) {
  return (
    <div
      role="img"
      aria-label={label}
      className={["grid", className].filter(Boolean).join(" ")}
      style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px`, gap }}
    >
      {cells.map((cell, i) => (
        <div key={i} style={{ background: cell.bg }} />
      ))}
    </div>
  );
}
