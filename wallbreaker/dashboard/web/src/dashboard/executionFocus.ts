import type { ExecutionSummary } from "./types";

export function mergeExecutionRefresh(
  remote: ExecutionSummary[],
  pendingFocus: ExecutionSummary | null,
): ExecutionSummary[] {
  if (!pendingFocus || remote.some((item) => item.id === pendingFocus.id)) return remote;
  return [pendingFocus, ...remote.filter((item) => item.id !== pendingFocus.id)];
}

export function selectionAfterExecutionRefresh(
  remote: ExecutionSummary[],
  currentId: string,
  pendingFocus: ExecutionSummary | null,
): string {
  if (pendingFocus) return pendingFocus.id;
  if (currentId && remote.some((item) => item.id === currentId)) return currentId;
  return remote.find((item) => ["queued", "running", "pausing", "paused"].includes(item.status))?.id
    || remote[0]?.id
    || "";
}
