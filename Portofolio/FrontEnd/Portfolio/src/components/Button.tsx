import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export default function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "h-12 px-6 rounded-ctrl font-bold text-base inline-flex items-center justify-center transition-colors disabled:opacity-55 disabled:cursor-default";

  const look =
    variant === "primary"
      ? "bg-signal text-white hover:bg-signal-dark"
      : "bg-transparent text-ink hover:text-signal";

  return <button className={`${base} ${look} ${className}`} {...rest} />;
}