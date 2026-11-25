type Props = { height?: number; className?: string; label?: string; near?: string; far?: string };

const GLYPHS = "M2 0h6v1h-6zM13 0h3v1h-3zM18 0h11v1h-11zM31 0h10v1h-10zM48 0h2v1h-2zM57 0h3v1h-3zM1 1h9v1h-9zM13 1h3v1h-3zM18 1h12v1h-12zM31 1h10v1h-10zM46 1h4v1h-4zM56 1h4v1h-4zM61 1h1v1h-1zM0 2h10v1h-10zM13 2h3v1h-3zM18 2h12v1h-12zM31 2h10v1h-10zM44 2h6v1h-6zM56 2h3v1h-3zM60 2h2v1h-2zM0 3h4v1h-4zM7 3h3v1h-3zM13 3h3v1h-3zM22 3h4v1h-4zM31 3h4v1h-4zM44 3h6v1h-6zM56 3h3v1h-3zM60 3h2v1h-2zM0 4h7v1h-7zM13 4h3v1h-3zM22 4h4v1h-4zM31 4h4v1h-4zM47 4h3v1h-3zM55 4h3v1h-3zM59 4h3v1h-3zM1 5h8v1h-8zM13 5h3v1h-3zM22 5h4v1h-4zM31 5h9v1h-9zM47 5h3v1h-3zM54 5h3v1h-3zM59 5h3v1h-3zM2 6h8v1h-8zM13 6h3v1h-3zM22 6h4v1h-4zM31 6h9v1h-9zM47 6h3v1h-3zM54 6h2v1h-2zM59 6h4v1h-4zM5 7h6v1h-6zM13 7h3v1h-3zM22 7h4v1h-4zM31 7h4v1h-4zM47 7h3v1h-3zM54 7h10v1h-10zM0 8h4v1h-4zM7 8h4v1h-4zM13 8h3v1h-3zM22 8h4v1h-4zM31 8h4v1h-4zM47 8h3v1h-3zM54 8h10v1h-10zM0 9h10v1h-10zM13 9h3v1h-3zM22 9h4v1h-4zM31 9h10v1h-10zM44 9h8v1h-8zM59 9h4v1h-4zM1 10h9v1h-9zM13 10h3v1h-3zM22 10h4v1h-4zM31 10h10v1h-10zM44 10h9v1h-9zM59 10h3v1h-3zM3 11h5v1h-5zM13 11h3v1h-3zM22 11h4v1h-4zM31 11h10v1h-10zM44 11h8v1h-8zM59 11h3v1h-3z";

export function Wordmark({ height = 24, className, label = "SITE14", near = "#E15829", far = "#15607A" }: Props) {
  return (
    <svg
      height={height}
      width={height * 5}
      viewBox="0 0 65 13"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={label}
    >
      <path transform="translate(1 1)" fill={far} d={GLYPHS} />
      <path transform="translate(0.5 0.5)" fill={near} d={GLYPHS} />
      <path fill="currentColor" d={GLYPHS} />
    </svg>
  );
}

export default Wordmark;
