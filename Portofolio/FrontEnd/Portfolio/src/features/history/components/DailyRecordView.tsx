import type { ReactNode } from "react";
import StatusBadge from "@/shared/components/StatusBadge";
import type { AttendanceValue, DailyRecord } from "../types";
import { ALERT_LABELS, FIELD_LABELS, clock, formatMinutes } from "../format";

type Props = { record: DailyRecord };

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Stat<T>({ label, item, show }: { label: string; item: AttendanceValue<T>; show: (v: T) => string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{show(item.value)}</p>
      {item.corrected && (
        <p className="mt-1 text-xs text-muted-foreground">
          Recorded <span className="line-through">{show(item.original)}</span>
          <span className="ml-1.5 font-medium text-signal">corrected</span>
        </p>
      )}
    </div>
  );
}

const time = (v: string | null) => v ?? "—";
const hours = (v: number) => formatMinutes(v);

export default function DailyRecordView({ record }: Props) {
  const zoneTotal = record.minutes_by_zone.reduce((sum, z) => sum + z.minutes, 0);
  const done = record.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {record.status === "present" ? (
          <StatusBadge tone="ok">Present</StatusBadge>
        ) : (
          <StatusBadge tone="warn">Absent</StatusBadge>
        )}
        {record.is_provisional && <StatusBadge tone="info">Provisional, day still in progress</StatusBadge>}
        {record.has_corrections && <StatusBadge tone="neutral">Corrected</StatusBadge>}
        {record.sites.map((s) => (
          <span key={s.id} className="text-sm text-muted-foreground">
            {s.name}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="First seen" item={record.attendance.first_seen} show={time} />
        <Stat label="Last seen" item={record.attendance.last_seen} show={time} />
        <Stat label="Hours worked" item={record.attendance.worked_minutes} show={hours} />
        <div className="rounded-lg border bg-background px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Device offline</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {record.offline_minutes ? formatMinutes(record.offline_minutes) : "None"}
          </p>
        </div>
      </div>

      {record.status === "absent" && (
        <p className="rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {record.is_provisional
            ? "No readings from this worker yet today."
            : "No readings from this worker on this day, so the day is recorded as absent."}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Time per zone">
          {record.minutes_by_zone.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time recorded.</p>
          ) : (
            <ul className="space-y-3">
              {record.minutes_by_zone.map((z) => (
                <li key={z.zone?.id ?? "none"}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {z.zone ? z.zone.name : "On site, outside any zone"}
                      {z.zone?.is_outdoor && <span className="ml-2 text-xs text-muted-foreground">Outdoor</span>}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{formatMinutes(z.minutes)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
                    <div
                      className={`h-1.5 rounded-full ${z.zone ? "bg-signal" : "bg-steel"}`}
                      style={{ width: `${Math.max(2, (z.minutes / zoneTotal) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Alerts" aside={<span className="text-xs text-muted-foreground">{record.alerts.length}</span>}>
          {record.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts.</p>
          ) : (
            <ul className="divide-y">
              {record.alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="text-sm">
                    <p className="font-medium">{ALERT_LABELS[a.type] ?? a.type}</p>
                    <p className="text-muted-foreground">
                      {a.zone ? `${a.zone.name}, ` : ""}
                      {a.observed_minutes != null && `${formatMinutes(a.observed_minutes)} of ${formatMinutes(a.limit_minutes ?? 0)}`}
                      {a.observed_bpm != null && `${a.observed_bpm} bpm (limit ${a.limit_bpm})`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">{clock(a.triggered_at)}</p>
                    <StatusBadge tone={a.resolved_at ? "neutral" : "danger"}>{a.resolved_at ? "Resolved" : "Open"}</StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Tasks"
          aside={record.tasks.length > 0 && <span className="text-xs text-muted-foreground">{done} of {record.tasks.length} done</span>}
        >
          {record.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
          ) : (
            <ul className="divide-y">
              {record.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
                  <span className={t.status === "done" ? "" : "text-muted-foreground"}>{t.title}</span>
                  {t.status === "done" ? (
                    <StatusBadge tone="ok">Done {t.completed_at ? clock(t.completed_at) : ""}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">{t.status === "in_progress" ? "In progress" : "To do"}</StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Corrections">
          {record.corrections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has been corrected on this day.</p>
          ) : (
            <ol className="space-y-3">
              {record.corrections.map((c) => (
                <li key={c.id} className="rounded-md bg-sand px-3 py-2 text-sm">
                  <p className="font-medium">
                    {FIELD_LABELS[c.field] ?? c.field}:{" "}
                    <span className="text-muted-foreground line-through">
                      {c.field === "worked_minutes" && c.original_value ? formatMinutes(Number(c.original_value)) : c.original_value || "—"}
                    </span>{" "}
                    → {c.field === "worked_minutes" ? formatMinutes(Number(c.corrected_value)) : c.corrected_value}
                  </p>
                  <p className="mt-0.5">{c.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.corrected_by.full_name}, {new Date(c.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}
