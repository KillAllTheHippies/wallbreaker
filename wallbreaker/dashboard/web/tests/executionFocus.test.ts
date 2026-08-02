import assert from "node:assert/strict";
import test from "node:test";

import { mergeExecutionRefresh, selectionAfterExecutionRefresh } from "../src/v2/executionFocus.ts";
import type { ExecutionSummary } from "../src/v2/types.ts";

const execution = (id: string, status: ExecutionSummary["status"]): ExecutionSummary => ({
  id,
  capability_id: "agent.run",
  status,
});

test("new agent run stays focused while refresh still contains the older run", () => {
  const older = execution("old-run", "succeeded");
  const created = execution("new-run", "queued");

  const merged = mergeExecutionRefresh([older], created);
  const selected = selectionAfterExecutionRefresh([older], older.id, created);

  assert.deepEqual(merged.map((item) => item.id), [created.id, older.id]);
  assert.equal(selected, created.id);
});

test("new agent focus remains selected once the server list confirms it", () => {
  const older = execution("old-run", "succeeded");
  const created = execution("new-run", "running");
  const remote = [created, older];

  assert.deepEqual(mergeExecutionRefresh(remote, created), remote);
  assert.equal(selectionAfterExecutionRefresh(remote, older.id, created), created.id);
});
