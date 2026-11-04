import { useState } from "react";
import StatusBadge from "@/shared/components/StatusBadge";
import { updateTaskStatus } from "../api";
import { STATUS_LABEL, STATUS_TONE } from "../types";
import type { Task, TaskStatus } from "../types";

type Props = {
  task: Task;
  onChanged: (task: Task) => void;
  onError: (message: string) => void;
};

const ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export default function TaskStatusSelect({ task, onChanged, onError }: Props) {
  const [busy, setBusy] = useState(false);

  async function change(status: TaskStatus) {
    if (status === task.status) return;
    setBusy(true);
    try {
      onChanged(await updateTaskStatus(task.id, status));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</StatusBadge>
      <select
        aria-label={`Change status of ${task.title}`}
        value={task.status}
        disabled={busy}
        onChange={(e) => change(e.target.value as TaskStatus)}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
