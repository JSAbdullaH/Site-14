import AppShell from "@/shared/components/AppShell";

export default function Home() {
  return (
    <AppShell title="Live map" subtitle="Riyadh North Â· shift 06:00â€“15:00">
      <div className="h-full min-h-[480px] rounded-card bg-sand flex flex-col items-center justify-center text-center px-6">
        <p className="text-[56px] leading-tight font-bold">welcome!</p>
        <p className="text-[40px] leading-tight font-bold text-muted-foreground-foreground">butâ€¦</p>
        <p className="mt-6 text-[44px] leading-tight font-bold text-signal">
          developers at work :&#41;
        </p>
      </div>
    </AppShell>
  );
}