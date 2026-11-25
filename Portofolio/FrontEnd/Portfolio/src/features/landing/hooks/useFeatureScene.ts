import { useEffect, useRef, useState } from "react";

const STEPS = 4;

export function useFeatureScene() {
  const sceneRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const update = () => {
      const rect = scene.getBoundingClientRect();
      const travel = scene.offsetHeight - window.innerHeight;
      if (travel <= 0) return;
      const progress = Math.min(Math.max(-rect.top / travel, 0), 0.9999);
      setActive(Math.floor(progress * STEPS));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const featureState = (n: number) => (n === active ? "is-active" : n < active ? "is-before" : "is-after");
  return { sceneRef, active, featureState };
}
