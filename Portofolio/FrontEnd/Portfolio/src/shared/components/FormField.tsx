import type { InputHTMLAttributes } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export default function FormField({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: Props) {
  return (
    <div className="mb-5 grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      <Input
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(className)}
        {...rest}
      />

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}