import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-secondary text-muted-foreground",
};

type Props = {
  tone?: Tone;
  children: ReactNode;
};

export default function StatusBadge({ tone = "neutral", children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium ${TONES[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}