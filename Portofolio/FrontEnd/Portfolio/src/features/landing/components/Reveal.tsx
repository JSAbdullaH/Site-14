import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type Props = { children: ReactNode; className?: string; style?: CSSProperties };

export function Reveal({ children, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal className={[className, shown && "in"].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}
