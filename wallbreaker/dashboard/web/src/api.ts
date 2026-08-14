import type {
  ApiResult,
  ArsenalItem,
  BookmarkRecord,
  Capability,
  ComposePayload,
  ComposeResult,
  ConsoleConversation,
  EventEnvelope,
  ExecutionStatus,
  ExecutionMode,
  ExecutionSummary,
  FindingRecord,
  HistoryEvent,
  ProviderRecord,
  RunSummary,
  SettingsRecord,
  JEFBehavior,
} from "./dashboard/types";
import type {
  AgentProfile,
  AgentProfilesResponse,
  AgentRole,
  ModelCatalog,
  Preset,
  ProviderTestResult,
  RoleAssignments,
  RoleChoice,
  Settings,
  Tool,
  Transform,
} from "./types";
import { inferEventActor } from "./dashboard/eventProjection";

export type {
  AgentProfile,
  AgentProfilesResponse,
  AgentRole,
  ModelCatalog,
  Preset,
  ProviderRecord,
  ProviderTestResult,
  RoleAssignments,
  RoleChoice,
  Settings,
  TargetOptions,
  Tool,
  Transform,
} from "./types";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, signal: init?.signal || controller.signal });
    if (!response.ok) {
      let message = response.statusText || `Request failed (${response.status})`;
      try {
        const body = await response.json() as { detail?: string; message?: string };
        message = body.detail || body.message || message;
      } catch {
        // The endpoint may return an empty or plain-text error.
      }
      throw new HttpError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timeout);
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function executionStatus(value: unknown): ExecutionStatus {
  const candidate = text(value).toLowerCase();
  if (["queued", "running", "pausing", "paused", "succeeded", "failed", "cancelled"].includes(candidate)) {
    return candidate as ExecutionStatus;
  }
  if (candidate === "completed" || candidate === "done") return "succeeded";
  if (candidate === "error") return "failed";
  return "queued";
}

function normalizeExecution(value: unknown, source: "execution" | "history" = "execution"): ExecutionSummary {
  const row = object(value);
  return {
    ...row,
    id: text(row.id || row.execution_id || row.run_id || row.name),
    run_id: text(row.run_id || row.name) || undefined,
    title: text(row.title || row.objective || row.capability_id) || undefined,
    objective: text(row.objective) || undefined,
    status: executionStatus(row.status),
    current_round: number(row.current_round || row.round),
    max_rounds: number(row.max_rounds || row.rounds),
    elapsed_ms: number(row.elapsed_ms || row.duration_ms),
    input_tokens: number(row.input_tokens),
    output_tokens: number(row.output_tokens),
    source,
  };
}

function normalizeEvent(value: unknown, executionId: string, index: number): EventEnvelope {
  const row = object(value);
  const nestedData = object(row.data);
  // Live execution events use a `data` envelope; retained JSONL events keep
  // their meaningful fields at the top level. Preserve both shapes so the
  // inspector can render complete historical evidence (not just its kind).
  const data = Object.keys(nestedData).length ? nestedData : row;
  const request = object(row.request);
  const endpoint = object(request.endpoint);
  const kind = text(row.kind || row.type || row.event || "system").toLowerCase();
  const explicitActor = text(row.actor || data.actor || row.role || row.source || endpoint.provider) || undefined;
  const label = text(row.verdict || row.label || data.verdict) || undefined;
  const strategy = text(row.strategy || row.technique || data.strategy || data.technique) || undefined;
  const summary = text(row.summary || row.message || data.summary || data.message || row.detail || row.operation || row.tool || row.name || data.tool || data.state) || undefined;
  const response = text(row.text || row.response || row.content || data.text || data.response || data.content) || undefined;
  const sequence = number(row.sequence || row.seq) || index + 1;
  return {
    version: number(row.version) || 1,
    id: text(row.id || row.event_id) || `${executionId}:${sequence}`,
    sequence,
    execution_id: text(row.execution_id) || executionId,
    run_id: text(row.run_id) || undefined,
    timestamp: text(row.timestamp || row.ts || row.time) || new Date(0).toISOString(),
    kind,
    actor: inferEventActor({ actor: explicitActor, kind, data, summary }),
    strategy,
    round: number(row.round || data.round || data.current_round),
    verdict: label,
    summary,
    text: response,
    latency_ms: number(row.latency_ms || row.duration_ms || data.latency_ms),
    input_tokens: number(row.input_tokens ?? data.input_tokens ?? data.input),
    output_tokens: number(row.output_tokens ?? data.output_tokens ?? data.output),
    data: Object.keys(data).length ? data : undefined,
    raw: value,
  };
}

function listPayload(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const row = object(value);
  for (const key of keys) if (Array.isArray(row[key])) return row[key] as unknown[];
  return [];
}

export const api = {
  models: (profile: string) => request<ModelCatalog>(`/api/models?profile=${encodeURIComponent(profile)}`),
  providers: () => request<ProviderRecord[]>("/api/providers"),
  saveProvider: (name: string, body: Record<string, unknown>) => request<ProviderRecord>(
    `/api/providers/${encodeURIComponent(name)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  ),
  deleteProvider: (name: string) => request<{ ok: boolean }>(
    `/api/providers/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  ),
  enableProvider: (name: string) => request<ProviderRecord>(
    `/api/providers/${encodeURIComponent(name)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) },
  ),
  disableProvider: (name: string) => request<ProviderRecord>(
    `/api/providers/${encodeURIComponent(name)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) },
  ),
  testProvider: (name: string) => request<ProviderTestResult>(
    `/api/providers/${encodeURIComponent(name)}/test`,
    { method: "POST" },
  ),
  refreshModels: (name: string) => request<ModelCatalog>(
    `/api/providers/${encodeURIComponent(name)}/models/refresh`,
    { method: "POST" },
  ),
  addModel: (name: string, model: string) => request(
    `/api/providers/${encodeURIComponent(name)}/models`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) },
  ),
  roles: () => request<RoleAssignments>("/api/roles"),
  saveRole: (role: keyof RoleAssignments, body: { profile?: string; provider?: string; model?: string }) => request<RoleChoice>(
    `/api/roles/${role}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  ),
  agentProfiles: () => request<AgentProfilesResponse>("/api/agent-profiles"),
  saveAgentProfile: (role: AgentRole, name: string, body: Omit<AgentProfile, "name" | "role">) => request<AgentProfile>(
    `/api/agent-profiles/${role}/${encodeURIComponent(name)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  ),
  deleteAgentProfile: (role: AgentRole, name: string) => request<{ ok: boolean }>(
    `/api/agent-profiles/${role}/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  ),
  jefBehaviors: async (): Promise<JEFBehavior[]> => {
    const body = await request<{ behaviors?: JEFBehavior[] }>("/api/jef/behaviors");
    return Array.isArray(body.behaviors) ? body.behaviors : [];
  },
  async capabilities(): Promise<ApiResult<Capability[]>> {
    const body = await request<unknown>("/api/capabilities");
    const capabilities = listPayload(body, ["capabilities", "items"]).map((item) => {
      const row = object(item);
      const schema = object(row.input_schema || row.argument_schema);
      return {
        ...row,
        id: text(row.id || row.name),
        title: text(row.title || row.name || row.id),
        category: text(row.category || "Other"),
        input_schema: Object.keys(schema).length ? schema : undefined,
      } as Capability;
    }).filter((item) => item.id);
    return { data: capabilities, source: "dashboard" };
  },

  async executions(): Promise<ApiResult<ExecutionSummary[]>> {
    const body = await request<unknown>("/api/executions");
    return {
      data: listPayload(body, ["executions", "items"]).map((item) => normalizeExecution(item)),
      source: "dashboard",
    };
  },

  execution: async (id: string) => normalizeExecution(
    await request<unknown>(`/api/executions/${encodeURIComponent(id)}`),
  ),

  async storedRunEvents(run: string): Promise<EventEnvelope[]> {
    const body = await request<Record<string, unknown>>(`/api/runs/${encodeURIComponent(run)}`);
    const records = Array.isArray(body.records) ? body.records : [];
    return records.map((record, index) => normalizeEvent(record, run, index));
  },

  async streamEvents(
    executionId: string,
    after: number,
    onEvent: (event: EventEnvelope) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const url = `/api/executions/${encodeURIComponent(executionId)}/events?after=${after}`;
    const response = await fetch(url, { signal, headers: { Accept: "text/event-stream" } });
    if (!response.ok || !response.body) throw new HttpError(response.status, response.statusText);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) {
          try { onEvent(normalizeEvent(JSON.parse(data), executionId, after)); } catch { /* ignore malformed frames */ }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  },

  createExecution: (capabilityId: string, args: Record<string, unknown>, mode: ExecutionMode) =>
    request<ExecutionSummary>("/api/executions", json({ capability_id: capabilityId, args, mode })).then((value) => normalizeExecution(value)),

  pause: async (execution: ExecutionSummary) => request<ExecutionSummary>(`/api/executions/${encodeURIComponent(execution.id)}/pause`, { method: "POST" }).then((value) => normalizeExecution(value)),

  resume: async (execution: ExecutionSummary) => request<ExecutionSummary>(`/api/executions/${encodeURIComponent(execution.id)}/resume`, { method: "POST" }).then((value) => normalizeExecution(value)),

  cancel: async (execution: ExecutionSummary) => {
    return request<ExecutionSummary>(`/api/executions/${encodeURIComponent(execution.id)}/cancel`, { method: "POST" }).then((value) => normalizeExecution(value));
  },

  switchAttacker: (execution: ExecutionSummary, body: { provider?: string; model?: string; profile?: string }) =>
    request<ExecutionSummary>(`/api/executions/${encodeURIComponent(execution.id)}/attacker`, json(body)).then((value) => normalizeExecution(value)),

  steer: async (execution: ExecutionSummary, message: string) => {
    const result = await request<{ ok: boolean; continued?: boolean; execution?: unknown }>(`/api/executions/${encodeURIComponent(execution.id)}/steer`, json({ message }));
    return {
      ...result,
      execution: result.execution ? normalizeExecution(result.execution) : undefined,
    };
  },

  compose: (body: ComposePayload) => request<ComposeResult>("/api/compose", json(body)),
  fire: (body: ComposePayload & { source?: string }) => request<ComposeResult>("/api/fire", json(body)),
  consoleConversation: () => request<ConsoleConversation>("/api/console/conversation"),
  resetConsoleConversation: () => request<ConsoleConversation & { ok: boolean }>("/api/console/conversation/reset", { method: "POST" }),
  presets: () => request<Preset[]>("/api/presets"),
  transforms: () => request<Transform[]>("/api/transforms"),
  tools: () => request<Tool[]>("/api/tools"),
  runs: () => request<RunSummary[]>("/api/runs"),
  run: (name: string) => request<Record<string, unknown>>(`/api/runs/${encodeURIComponent(name)}`),
  findings: (runs?: string[]) => request<FindingRecord[]>(`/api/findings${runs?.length ? `?runs=${encodeURIComponent(runs.join(","))}` : ""}`),
  findingRuns: () => request<RunSummary[]>("/api/findings/runs"),
  settings: () => request<SettingsRecord>("/api/settings"),
  saveSettings: (body: Partial<Settings> | Record<string, unknown>) => request<SettingsRecord>("/api/settings", json(body)),
  historyRuns: (limit = 100) => request<{ items: Array<Record<string, unknown>>; total: number }>(`/api/history/runs?limit=${limit}`),
  historyEvents: (filters: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
    return request<{ items: HistoryEvent[]; total: number; limit: number; offset: number }>(`/api/history/events?${query.toString()}`);
  },
  rebuildHistory: () => request<Record<string, unknown>>("/api/history/rebuild", { method: "POST" }),
  bookmarks: () => request<{ items: BookmarkRecord[] }>("/api/bookmarks"),
  toggleBookmark: (bookmark: BookmarkRecord) => request<{ bookmarked: boolean; item: BookmarkRecord; items: BookmarkRecord[] }>("/api/bookmarks/toggle", json(bookmark)),
  report: (runName: string) => request<Record<string, unknown>>(`/api/reports/${encodeURIComponent(runName)}`),
  odinCampaign: (campaignId: string) => request<Record<string, unknown>>(
    `/api/reports/odin/${encodeURIComponent(campaignId)}`,
  ),
};

export function arsenalItems(
  presets: Array<{ name: string; description?: string }>,
  transforms: Array<{ name: string; description?: string }>,
  tools: Array<{ name: string; description?: string }>,
): ArsenalItem[] {
  const map = (kind: ArsenalItem["kind"], rows: Array<Record<string, unknown>>) => rows.map((row) => ({
    name: text(row.name),
    description: text(row.description),
    kind,
    detail: row,
  }));
  return [...map("preset", presets), ...map("transform", transforms), ...map("tool", tools)];
}

export function eventFromUnknown(value: unknown, executionId: string, index: number): EventEnvelope {
  return normalizeEvent(value, executionId, index);
}
