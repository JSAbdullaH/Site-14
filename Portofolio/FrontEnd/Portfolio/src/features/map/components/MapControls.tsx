import type { ReactNode } from "react";
import { Layers, Maximize2, Minimize2, Minus, Plus, Scan } from "lucide-react";
import { GLASS } from "./format";

export type BaseLayer = "satellite" | "street";

type Props = {
  base: BaseLayer;
  fullscreen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleBase: () => void;
  onToggleFullscreen: () => void;
  className?: string;
};

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-10 items-center justify-center text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:outline-none active:bg-sand2"
    >
      {children}
    </button>
  );
}

export default function MapControls({
  base,
  fullscreen,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleBase,
  onToggleFullscreen,
  className = "",
}: Props) {
  const group = `flex flex-col overflow-hidden rounded-xl divide-y divide-black/5 ${GLASS}`;
  return (
    <div className={`pointer-events-auto flex flex-col gap-2 ${className}`}>
      <div className={group}>
        <Control label="Zoom in" onClick={onZoomIn}>
          <Plus className="size-4.5" />
        </Control>
        <Control label="Zoom out" onClick={onZoomOut}>
          <Minus className="size-4.5" />
        </Control>
      </div>
      <div className={group}>
        <Control label="Fit the site" onClick={onFit}>
          <Scan className="size-4.5" />
        </Control>
        <Control label={base === "satellite" ? "Switch to street map" : "Switch to satellite"} onClick={onToggleBase}>
          <Layers className="size-4.5" />
        </Control>
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <Control label={fullscreen ? "Exit full screen" : "Full screen"} onClick={onToggleFullscreen}>
            {fullscreen ? <Minimize2 className="size-4.5" /> : <Maximize2 className="size-4.5" />}
          </Control>
        )}
      </div>
    </div>
  );
}
