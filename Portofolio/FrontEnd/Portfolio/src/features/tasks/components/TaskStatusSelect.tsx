import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { updateTaskStatus } from "../api";
import { STATUS_LABEL } from "../types";
import type { Task, TaskStatus } from "../types";

type Props = {
  task: Task;
  onChanged: (task: Task) => void;
  onError: (message: string) => void;
};

const ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

const TONE: Record<TaskStatus, string> = {
  todo: "bg-secondary text-foreground/80",
  in_progress: "bg-info-bg text-info",
  done: "bg-ok-bg text-ok",
};

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

  // One control: the pill shows the status and opens the choice of the next one.
  return (
    <label className={`relative inline-flex h-7 items-center gap-1 rounded-full pr-2 pl-2.5 text-xs font-semibold ${TONE[task.status]} ${busy ? "opacity-60" : ""}`}>
      <span className="sr-only">Status of {task.title}</span>
      {STATUS_LABEL[task.status]}
      {busy ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3 opacity-70" />}
      <select
        value={task.status}
        disabled={busy}
        onChange={(e) => change(e.target.value as TaskStatus)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-default"
      >
        {ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
