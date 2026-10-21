import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export default function Input({ label, id, className = "", ...rest }: Props) {
  return (
    <div className="mb-6">
      <label
        htmlFor={id}
        className="block mb-2.5 text-[11px] font-bold tracking-[0.1em] text-mute2"
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full h-12 px-5 rounded-ctrl bg-sand text-ink text-[15px] font-semibold border border-transparent outline-none placeholder:text-mute2 focus:border-signal ${className}`}
        {...rest}
      />
    </div>
  );
}