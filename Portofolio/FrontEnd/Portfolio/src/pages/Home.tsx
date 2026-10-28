import AppShell from "../components/AppShell";
import { shiftLabel, useSites } from "../lib/sites";

export default function Home() {
  const { activeSite } = useSites();
  const subtitle = activeSite ? `${activeSite.name} · shift ${shiftLabel(activeSite)}` : undefined;

  return (
    <AppShell title="Live map" subtitle={subtitle}>
      <div className="h-full min-h-[480px] rounded-card bg-sand flex flex-col items-center justify-center text-center px-6">
        <p className="text-[56px] leading-tight font-bold">welcome!</p>
        <p className="text-[40px] leading-tight font-bold text-muted">but…</p>
        <p className="mt-6 text-[44px] leading-tight font-bold text-signal">
          developers at work :&#41;
        </p>
      </div>
    </AppShell>
  );
}
