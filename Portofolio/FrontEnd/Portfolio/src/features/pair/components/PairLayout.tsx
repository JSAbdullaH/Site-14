import type { ReactNode } from "react";
import { LogoMark } from "@/shared/components/Logo";

export default function PairLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-bone">
      <header className="flex h-14 items-center justify-center border-b bg-background">
        <LogoMark size={26} label="SITE14" className="text-foreground" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
