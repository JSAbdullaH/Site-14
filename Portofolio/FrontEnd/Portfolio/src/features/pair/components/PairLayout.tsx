import type { ReactNode } from "react";

export default function PairLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-bone">
      <header className="flex h-14 items-center justify-center border-b bg-background">
        <span className="text-base font-semibold tracking-tight">SITE14</span>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
