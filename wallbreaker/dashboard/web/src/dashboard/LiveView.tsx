import { useEffect, useMemo, useRef, useState } from "react";
import type { RoleAssignments } from "../api";
import { api } from "../api";
import { JEFBehaviorPicker } from "./JEFBehaviorPicker";
import { JEFResult } from "./JEFResult";
import {
  actorLabel,
  EmptyState,
  ErrorBanner,
  formatDuration,
  formatTime,
  formatTokens,
  JsonBlock,
  Panel,
  StatusBadge,
  VerdictBadge,
} from "./components";
import type { EventEnvelope, ExecutionSummary, JEFEvaluation } from "./types";
import { correlateRawEvents, projectActivityEvents } from "./eventProjection";

interface TechniqueChoice { name: string; description?: string; control?: boolean }

type InspectorTab = "overview" | "conversation" | "payload" | "evaluation" | "raw";

interface HistoricalRunOption {
  run_name: string;
  first_timestamp?: string;
  last_timestamp?: string;
  event_count?: number;
}

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "conversation", label: "Conversation" },
  { id: "payload", label: "Payload" },
  { id: "evaluation", label: "Evaluation" },
  { id: "raw", label: "Raw" },
];

function useExecutionEvents(
  execution: ExecutionSummary | null,
  enabled: boolean,
  onIncoming?: () => void,
) {
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [streamState, setStreamState] = useState("idle");
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;

  useEffect(() => {
    if (!enabled) return;
    setEvents([]);
    setStreamState("idle");
    if (!execution) return;
    if (execution.source === "history") {
      setStreamState("loading");
      api.storedRunEvents(execution.run_id || execution.id).then((loaded) => {
        setEvents(loaded);
        setStreamState("complete");
      }).catch(() => setStreamState("unavailable"));
      return;
    }
    const controller = new AbortController();
    let reconnect = 0;
    let timer = 0;
    const connect = async () => {
      setStreamState("connected");
      try {
        await api.streamEvents(execution.id, reconnect, (event) => {
          reconnect = Math.max(reconnect, event.sequence);
          setEvents((current) => current.some((item) => item.id === event.id)
            ? current
            : [...current, event].sort((left, right) => left.sequence - right.sequence));
          incomingRef.current?.();
        }, controller.signal);
        if (!controller.signal.aborted && ["running", "pausing", "paused"].includes(execution.status)) {
          timer = window.setTimeout(connect, 1400);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStreamState("reconnecting");
          timer = window.setTimeout(connect, 1800);
        }
      }
    };
    connect();
    return () => { controller.abort(); window.clearTimeout(timer); };
  // A terminal status is an update to the same evidence stream, not a new stream.
  // Including it here cleared the transcript exactly when a run completed.
  }, [execution?.id, execution?.source, enabled]);

  return { events, streamState };
}

function historicalExecution(run: HistoricalRunOption): ExecutionSummary {
  return {
    id: `history:${run.run_name}`,
    run_id: run.run_name,
    title: run.run_name,
    status: "succeeded",
    source: "history",
    created_at: run.first_timestamp,
    finished_at: run.last_timestamp,
  };
}

function LiveRunSelector({
  execution,
  runs,
  selectedRun,
  onSelect,
}: {
  execution: ExecutionSummary | null;
  runs: HistoricalRunOption[];
  selectedRun: string;
  onSelect: (runName: string) => void;
}) {
  const currentValue = selectedRun || (execution ? "__current__" : "");
  return <section className="dashboard-live-selector" aria-label="Live run selection">
    <div><strong>Run to observe</strong><span>{selectedRun ? "Historical evidence" : execution ? "Current execution" : "Choose a retained run"}</span></div>
    <label><span className="dashboard-sr-only">Select current or historical run</span><select value={currentValue} onChange={(event) => onSelect(event.target.value === "__current__" ? "" : event.target.value)}>
      {!execution && <option value="">Select a historical run</option>}
      {execution && <option value="__current__">Current execution · {execution.title || execution.id}</option>}
      {runs.map((run) => <option key={run.run_name} value={run.run_name}>{run.run_name} · {run.event_count || 0} events</option>)}
    </select></label>
    <span className="dashboard-live-selector-meta">{runs.length} retained runs</span>
  </section>;
}

function eventStatus(event: EventEnvelope): "pass" | "fail" | "bypass" | "inconclusive" {
  const value = `${event.verdict || ""} ${event.kind}`.toLowerCase();
  if (value.includes("bypass") || value.includes("complied")) return "bypass";
  if (value.includes("partial") || value.includes("inconclusive")) return "inconclusive";
  if (value.includes("error") || value.includes("fail")) return "fail";
  return "pass";
}

function eventTitle(event: EventEnvelope): string {
  if (isJEFEvent(event)) {
    const title = String(valueAt(event, "title") || valueAt(event, "behavior") || "JEF test");
    const percentage = valueAt(event, "percentage");
    const threshold = valueAt(event, "threshold");
    if (percentage != null && threshold != null) return `${title} · ${percentage}% / ${threshold}%`;
    return title;
  }
  return event.summary || event.text || event.kind.replace(/_/g, " ");
}

function eventMeta(event: EventEnvelope): string {
  const values = [];
  if (event.round) values.push(`Round ${event.round}`);
  if (event.input_tokens != null || event.output_tokens != null) values.push(`${formatTokens(event.input_tokens, event.output_tokens)} tokens`);
  if (event.latency_ms != null) values.push(formatDuration(event.latency_ms));
  return values.join(" · ");
}

function valueAt(event: EventEnvelope, key: string): unknown {
  return event.data?.[key] ?? (event.raw && typeof event.raw === "object" ? (event.raw as Record<string, unknown>)[key] : undefined);
}

function hasValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function Conversation({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return <EmptyState title="No conversation yet" detail="Conversation context appears as the run exchanges messages and tool results." />;
  return <ol className="dashboard-event-conversation">{value.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : { content: String(raw) };
    const role = String(item.role || "system");
    const type = String(item.type || "message");
    return <li key={`${index}-${role}-${type}`} className={`dashboard-conversation-${role.toLowerCase()}`}>
      <header><strong>{role}</strong><span>{type.replace(/_/g, " ")}{item.name ? ` · ${String(item.name)}` : ""}</span></header>
      {hasValue(item.content) && <p>{String(item.content)}</p>}
      {hasValue(item.arguments) && <details><summary>Arguments</summary><JsonBlock value={item.arguments} /></details>}
    </li>;
  })}</ol>;
}

function Inspector({ event }: { event: EventEnvelope | null }) {
  const [tab, setTab] = useState<InspectorTab>("overview");

  if (!event) return <aside className="dashboard-inspector"><EmptyState title="Select an event" detail="Matrix cells and timeline rows open synchronized evidence here." /></aside>;
  const jef = jefEvaluation(event);
  const jefMetadata = jef ? {
    behavior: jef.behavior,
    title: jef.title,
    status: jef.status,
    passed: jef.passed ?? jef.triggered ?? false,
    triggered: jef.triggered ?? false,
    conversation_id: jef.conversation_id,
    output_id: jef.output_id,
    output_ids: jef.output_ids,
    output_count: jef.output_count,
  } : {};
  const content = (() => {
    if (tab === "raw") return <JsonBlock value={event.raw ?? event} />;
    if (tab === "conversation") return <Conversation value={valueAt(event, "conversation") || valueAt(event, "messages")} />;
    if (tab === "payload") {
      const payload = {
        request: valueAt(event, "request"),
        arguments: valueAt(event, "args") || valueAt(event, "arguments"),
        response: event.text,
        artifacts: valueAt(event, "artifacts") || valueAt(event, "artifact"),
      };
      return <JsonBlock value={Object.fromEntries(Object.entries(payload).filter(([, value]) => hasValue(value)))} empty="No request, response, or artifact payload was recorded." />;
    }
    if (tab === "evaluation") {
      if (jef) return <div className="dashboard-inspector-summary"><JEFResult evaluation={jef} /><div className="dashboard-inspector-section"><h4>JEF metadata</h4><JsonBlock value={jefMetadata} /></div></div>;
      const evaluation = {
        verdict: event.verdict,
        evidence: valueAt(event, "evidence") || valueAt(event, "key_evidence"),
        judge: valueAt(event, "judging") || valueAt(event, "judge"),
      };
      return <JsonBlock value={Object.fromEntries(Object.entries(evaluation).filter(([, value]) => hasValue(value)))} empty="This activity has not been evaluated." />;
    }
    return (
      <div className="dashboard-inspector-summary">
        <div className="dashboard-inspector-heading">
          <div><span>Selected event</span><h3>{eventTitle(event)}</h3></div>
          <VerdictBadge verdict={event.verdict} />
        </div>
        <dl className="dashboard-kv">
          <div><dt>Actor</dt><dd>{actorLabel(event)}</dd></div>
          <div><dt>Round</dt><dd>{event.round ?? "--"}</dd></div>
          <div><dt>Strategy</dt><dd>{event.strategy || "Unclassified"}</dd></div>
          <div><dt>Time</dt><dd>{formatTime(event.timestamp)}</dd></div>
          <div><dt>Latency</dt><dd>{formatDuration(event.latency_ms)}</dd></div>
          <div><dt>Tokens in / out</dt><dd>{formatTokens(event.input_tokens, event.output_tokens)}</dd></div>
        </dl>
        {jef ? <><JEFResult evaluation={jef} /><div className="dashboard-inspector-section"><h4>JEF metadata</h4><JsonBlock value={jefMetadata} /></div></> : <div className="dashboard-inspector-section"><h4>Content</h4><JsonBlock value={event.text || event.summary} empty="No text content recorded." /></div>}
        {event.verdict && <div className="dashboard-inspector-section"><h4>Verdict</h4><VerdictBadge verdict={event.verdict} /></div>}
      </div>
    );
  })();

  return (
    <aside className="dashboard-inspector" aria-label="Evidence inspector">
      <header><div><h2>Event detail</h2><span className="dashboard-mono">#{event.sequence} · {event.id}</span></div></header>
      <div className="dashboard-inspector-tabs" role="tablist" aria-label="Evidence detail">
        {INSPECTOR_TABS.map((item) => <button
          type="button"
          key={item.id}
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? "active" : ""}
          onClick={() => setTab(item.id)}
        >{item.label}</button>)}
      </div>
      <div className="dashboard-inspector-body">{content}</div>
    </aside>
  );
}

function StrategyMatrix({ events, selected, onSelect, maxRounds }: {
  events: EventEnvelope[];
  selected: EventEnvelope | null;
  onSelect: (event: EventEnvelope) => void;
  maxRounds?: number;
}) {
  const strategies = useMemo(() => {
    const rows = new Map<string, Map<number, EventEnvelope>>();
    events.forEach((event) => {
      if (!event.strategy || !event.round) return;
      if (!rows.has(event.strategy)) rows.set(event.strategy, new Map());
      const existing = rows.get(event.strategy)?.get(event.round);
      if (!existing || event.sequence > existing.sequence) rows.get(event.strategy)?.set(event.round, event);
    });
    return [...rows.entries()];
  }, [events]);
  const observedMax = Math.max(0, ...events.map((event) => event.round || 0));
  const rounds = Math.max(1, Math.min(20, maxRounds || observedMax || 8));

  if (!strategies.length) return <EmptyState title="No strategy rounds recorded" detail="The matrix will populate as strategy and round events arrive." />;
  return (
    <div className="dashboard-matrix-scroll">
      <table className="dashboard-matrix">
        <thead><tr><th>Strategy</th>{Array.from({ length: rounds }, (_, index) => <th key={index}>{index + 1}</th>)}<th>Bypass</th></tr></thead>
        <tbody>{strategies.map(([strategy, row], rowIndex) => {
          const bypasses = [...row.values()].filter((event) => eventStatus(event) === "bypass").length;
          return <tr key={strategy}>
            <th><span>{String(rowIndex + 1).padStart(2, "0")}</span>{strategy}</th>
            {Array.from({ length: rounds }, (_, index) => {
              const event = row.get(index + 1);
              const status = event ? eventStatus(event) : "not-run";
              const label = event ? `${status}, round ${index + 1}` : `Not run, round ${index + 1}`;
              return <td key={index}>
                {event ? <button
                  type="button"
                  className={`dashboard-matrix-cell ${status} ${selected?.id === event.id ? "selected" : ""}`}
                  aria-label={`${strategy}: ${label}`}
                  title={label}
                  onClick={() => onSelect(event)}
                >{status === "inconclusive" ? "I" : status.charAt(0).toUpperCase()}</button> : <span className="dashboard-matrix-empty">-</span>}
              </td>;
            })}
            <td className="dashboard-mono">{bypasses}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function RunOverview({ events, selected, onSelect, execution, streamState }: {
  events: EventEnvelope[];
  selected: EventEnvelope | null;
  onSelect: (event: EventEnvelope) => void;
  execution: ExecutionSummary | null;
  streamState: string;
}) {
  const observedRound = Math.max(0, ...events.map((event) => event.round || 0));
  const messages = events.filter((event) => event.kind === "message").length;
  const actions = events.filter((event) => event.kind === "tool_call").length;
  const outcomes = events.filter((event) => ["tool_result", "result"].includes(event.kind)).length;
  const usage = [...events].reverse().find((event) => event.input_tokens != null || event.output_tokens != null);
  const hasStrategies = events.some((event) => event.strategy && event.round);
  return <Panel
    title="Run overview"
    meta={`Holistic status · stream ${streamState}`}
    className="dashboard-overview-panel"
    actions={execution ? <StatusBadge status={execution.status} /> : undefined}
  >
    <div className="dashboard-live-metrics">
      <article><span>Round</span><strong>{observedRound || execution?.current_round || 0}<small> / {execution?.max_rounds || "—"}</small></strong></article>
      <article><span>Messages</span><strong>{messages}</strong></article>
      <article><span>Actions</span><strong>{actions}</strong></article>
      <article><span>Results</span><strong>{outcomes}</strong></article>
      <article><span>Tokens in / out</span><strong>{formatTokens(usage?.input_tokens ?? execution?.input_tokens, usage?.output_tokens ?? execution?.output_tokens)}</strong></article>
    </div>
    {hasStrategies ? <details className="dashboard-overview-matrix" open>
      <summary><span>Strategy by round</span><span className="dashboard-legend"><i className="pass">P Pass</i><i className="fail">F Fail</i><i className="bypass">B Bypass</i><i className="inconclusive">I Inconclusive</i></span></summary>
      <StrategyMatrix events={events} selected={selected} onSelect={onSelect} maxRounds={execution?.max_rounds} />
    </details> : <p className="dashboard-overview-note">Strategy evidence will appear here when a run records classified techniques and rounds.</p>}
  </Panel>;
}

function Timeline({ events, rawEvents, selected, onSelect, liveTail, setLiveTail, unread, markRead }: {
  events: EventEnvelope[];
  rawEvents: EventEnvelope[];
  selected: EventEnvelope | null;
  onSelect: (event: EventEnvelope) => void;
  liveTail: boolean;
  setLiveTail: (value: boolean) => void;
  unread: number;
  markRead: () => void;
}) {
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("all");
  const [kind, setKind] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [view, setView] = useState<"activity" | "raw">("activity");
  const bodyRef = useRef<HTMLDivElement>(null);
  const source = view === "activity" ? events : rawEvents;
  const actors = useMemo(() => [...new Set(source.map(actorLabel))].sort(), [source]);
  const kinds = useMemo(() => [...new Set(source.map((event) => event.kind))].sort(), [source]);
  const verdicts = useMemo(() => [...new Set(source.map((event) => event.verdict).filter(Boolean) as string[])].sort(), [source]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return source.filter((event) => {
      if (actor !== "all" && actorLabel(event) !== actor) return false;
      if (kind !== "all" && event.kind !== kind) return false;
      if (verdict !== "all" && event.verdict !== verdict) return false;
      return !query || `${eventTitle(event)} ${event.text || ""} ${event.strategy || ""} ${actorLabel(event)} ${event.verdict || ""}`.toLowerCase().includes(query);
    });
  }, [source, search, actor, kind, verdict]);

  useEffect(() => {
    if (liveTail) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [filtered.length, liveTail]);

  return (
    <Panel
      title="Event timeline"
      meta={`${filtered.length} shown · ${events.length} activities · ${rawEvents.length} raw events`}
      className="dashboard-timeline-panel"
      actions={<>
        <div className="dashboard-view-toggle" role="group" aria-label="Timeline detail level">
          <button type="button" aria-pressed={view === "activity"} onClick={() => { setView("activity"); setActor("all"); setKind("all"); setVerdict("all"); }}>Activity</button>
          <button type="button" aria-pressed={view === "raw"} onClick={() => { setView("raw"); setActor("all"); setKind("all"); setVerdict("all"); }}>Raw</button>
        </div>
        <label className="dashboard-switch"><input type="checkbox" checked={liveTail} onChange={(event) => setLiveTail(event.target.checked)} /><span>Live tail</span></label>
        {unread > 0 && <button type="button" className="dashboard-button dashboard-button-small" onClick={markRead}>{unread} unread / mark read</button>}
      </>}
    >
      <div className="dashboard-filterbar">
        <label className="dashboard-search"><span className="dashboard-sr-only">Search events</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${view === "activity" ? "activity" : "raw events"}`} /></label>
        {actors.length > 1 && <label><span className="dashboard-sr-only">Actor</span><select value={actor} onChange={(event) => setActor(event.target.value)}><option value="all">All actors</option>{actors.map((value) => <option key={value}>{value}</option>)}</select></label>}
        {kinds.length > 1 && <label><span className="dashboard-sr-only">Event type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All event types</option>{kinds.map((value) => <option key={value}>{value.replace(/_/g, " ")}</option>)}</select></label>}
        {!!verdicts.length && <label><span className="dashboard-sr-only">Verdict</span><select value={verdict} onChange={(event) => setVerdict(event.target.value)}><option value="all">All verdicts</option>{verdicts.map((value) => <option key={value}>{value}</option>)}</select></label>}
        {(search || actor !== "all" || kind !== "all" || verdict !== "all") && <button type="button" className="dashboard-text-button" onClick={() => { setSearch(""); setActor("all"); setKind("all"); setVerdict("all"); }}>Clear</button>}
      </div>
      <div className="dashboard-timeline" ref={bodyRef} onScroll={(event) => {
        const node = event.currentTarget;
        if (node.scrollHeight - node.scrollTop - node.clientHeight > 24 && liveTail) setLiveTail(false);
      }}>
        {!filtered.length && <EmptyState title="No events match these filters" detail={source.length ? "Clear a filter to reveal recorded events." : "Events will appear here when a run starts or a historical run is selected."} />}
        {filtered.map((event) => <button
          type="button"
          key={event.id}
          className={`dashboard-event-row dashboard-actor-${actorLabel(event).toLowerCase()} ${selected?.id === event.id ? "selected" : ""}`}
          onClick={() => onSelect(event)}
        >
          <time className="dashboard-mono" dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
          <span className="dashboard-event-actor"><i aria-hidden="true">●</i>{actorLabel(event)}</span>
          <span className="dashboard-event-copy">
            <span><strong>{event.kind.replace(/_/g, " ")}</strong>{event.verdict && <VerdictBadge verdict={event.verdict} />}</span>
            <span title={event.text || eventTitle(event)}>{event.text || eventTitle(event)}</span>
            <small>{eventMeta(event)}<i>#{event.sequence}</i></small>
          </span>
        </button>)}
      </div>
    </Panel>
  );
}

function AttackerSwitcher({ execution, onRefresh }: { execution: ExecutionSummary; onRefresh: () => void }) {
  const [providers, setProviders] = useState<Array<{ name: string }>>([]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => { api.providers().then((items) => setProviders(items.map((item) => ({ name: item.name })))).catch(() => setProviders([])); }, []);
  const submit = async () => {
    if (!provider || !model.trim()) return;
    setWorking(true); setStatus("");
    try {
      await api.switchAttacker(execution, { provider, model: model.trim() });
      setStatus("Attacker switched; the conversation context is preserved.");
      onRefresh();
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : "Unable to switch attacker"); }
    finally { setWorking(false); }
  };
  return <section className="dashboard-attacker-switch" aria-label="Switch attacker while paused"><strong>Hot-switch attacker</strong><select aria-label="Attacker provider" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">Provider</option>{providers.map((item) => <option key={item.name}>{item.name}</option>)}</select><input aria-label="Attacker model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model ID" /><button type="button" className="dashboard-button dashboard-button-small" disabled={working || !provider || !model.trim()} onClick={submit}>{working ? "Switching" : "Switch"}</button>{status && <span role="status">{status}</span>}</section>;
}

function RunStrip({ execution, onRefresh }: { execution: ExecutionSummary | null; onRefresh: () => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const act = async (action: "pause" | "resume" | "cancel") => {
    if (!execution) return;
    if (action === "cancel" && !window.confirm("Hard stop this execution? In-flight work will be cancelled.")) return;
    setWorking(true);
    setError("");
    try {
      if (action === "pause") await api.pause(execution);
      if (action === "resume") await api.resume(execution);
      if (action === "cancel") await api.cancel(execution);
      onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Control action failed");
    } finally {
      setWorking(false);
    }
  };
  const progress = execution?.max_rounds ? Math.min(100, ((execution.current_round || 0) / execution.max_rounds) * 100) : 0;
  return <>
    <header className="dashboard-run-strip">
      <div className="dashboard-strip-field"><span>Target</span><strong>{execution?.target || "No active target"}</strong></div>
      <div className="dashboard-strip-field"><span>Attacker</span><strong>{execution?.attacker || "--"}</strong></div>
      <div className="dashboard-strip-field"><span>Judge</span><strong>{execution?.judge || "--"}</strong></div>
      <div className="dashboard-strip-progress"><span>Round {execution?.current_round ?? "--"} of {execution?.max_rounds ?? "--"}</span><div><i style={{ width: `${progress}%` }} /></div></div>
      <div className="dashboard-strip-field"><span>Elapsed</span><strong>{formatDuration(execution?.elapsed_ms)}</strong></div>
      <div className="dashboard-strip-field"><span>Tokens in / out</span><strong>{formatTokens(execution?.input_tokens, execution?.output_tokens)}</strong></div>
      <div className="dashboard-strip-state"><span>Connection</span>{execution ? <StatusBadge status={execution.status} /> : <span className="dashboard-muted">● Offline</span>}</div>
      <div className="dashboard-strip-actions">
        {execution?.status === "paused" ? <button type="button" className="dashboard-button" disabled={working} onClick={() => act("resume")}>Resume</button> : <button type="button" className="dashboard-button" disabled={working || !execution || execution.status !== "running"} onClick={() => act("pause")}>Pause</button>}
        <button type="button" className="dashboard-button dashboard-button-danger" disabled={working || !execution || !["running", "paused", "pausing", "queued"].includes(execution.status)} onClick={() => act("cancel")}>Stop run</button>
      </div>
    </header>
    {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
    {execution?.status === "paused" && <AttackerSwitcher execution={execution} onRefresh={onRefresh} />}
  </>;
}

function RunLauncher({ execution, onRefresh, onStarted }: { execution: ExecutionSummary | null; onRefresh: () => void; onStarted: (execution: ExecutionSummary) => void }) {
  const [objective, setObjective] = useState("");
  const [maxRounds, setMaxRounds] = useState(4);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [concurrency, setConcurrency] = useState(4);
  const [requestDelay, setRequestDelay] = useState(0);
  const [jefBehavior, setJefBehavior] = useState("");
  const [submissionProfile, setSubmissionProfile] = useState("");
  const [techniques, setTechniques] = useState<TechniqueChoice[]>([]);
  const [selected, setSelected] = useState<string[] | null>(() => {
    try { return JSON.parse(localStorage.getItem("wallbreaker:dashboard:techniques") || "null") as string[] | null; }
    catch { return null; }
  });
  const [techniqueSearch, setTechniqueSearch] = useState("");
  const [techniquePickerOpen, setTechniquePickerOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(!execution);
  useEffect(() => { if (execution) setMessage(""); }, [execution?.id]);
  useEffect(() => { setLauncherOpen(!execution); }, [execution?.id]);
  useEffect(() => { api.tools().then((items) => setTechniques(items.filter((item) => !item.control).map((item) => ({ name: String(item.name || ""), description: typeof item.description === "string" ? item.description : undefined, control: Boolean(item.control) })).filter((item) => item.name))).catch(() => setTechniques([])); }, []);
  useEffect(() => { localStorage.setItem("wallbreaker:dashboard:techniques", JSON.stringify(selected)); }, [selected]);
  const visibleTechniques = useMemo(() => {
    const query = techniqueSearch.trim().toLowerCase();
    return techniques.filter((item) => !query || `${item.name} ${item.description || ""}`.toLowerCase().includes(query));
  }, [techniques, techniqueSearch]);
  const active = execution && ["queued", "running", "pausing", "paused"].includes(execution.status);
  const start = async () => {
    if (!objective.trim() || active) return;
    setWorking(true); setMessage("");
    try {
      const created = await api.createExecution("agent.run", {
        objective: objective.trim(), max_rounds: maxRounds, max_tokens: maxTokens,
        concurrency, request_delay_ms: requestDelay,
        ...(jefBehavior ? { jef_behavior: jefBehavior } : {}),
        ...(submissionProfile ? { submission_profile: submissionProfile } : {}),
        ...(selected == null ? {} : { enabled_techniques: selected }),
      }, "interactive");
      onStarted(created);
      setMessage("Execution queued. Live events will attach automatically.");
      onRefresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to start execution"); }
    finally { setWorking(false); }
  };
  const techniqueSummary = selected == null ? `All ${techniques.length || ""} techniques`.trim() : `${selected.length} techniques`;
  return <details className="dashboard-agent-launch" open={launcherOpen} onToggle={(event) => setLauncherOpen(event.currentTarget.open)}>
    <summary><span><strong>{active ? "Current engagement" : "New engagement"}</strong><small>{active ? "Launch controls are available when this run ends" : "Set the objective, then start the agent loop"}</small></span><span>{active ? "In progress" : "Ready"}</span></summary>
    <div className="dashboard-agent-launch-body">
      <div className="dashboard-agent-launch-primary">
        <label className="dashboard-field dashboard-agent-objective"><span>Objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the authorized evaluation objective" /></label>
        <label className="dashboard-checkbox-field dashboard-field-wide"><input type="checkbox" checked={submissionProfile === "0din"} onChange={(event) => setSubmissionProfile(event.target.checked ? "0din" : "")} disabled={Boolean(active)} /><span>0DIN submission mode (two-category eligible evidence)</span></label>
        <JEFBehaviorPicker value={jefBehavior} onChange={setJefBehavior} disabled={Boolean(active)} />
        <button type="button" className="dashboard-button dashboard-button-primary" disabled={working || !objective.trim() || Boolean(active)} onClick={start}>{working ? "Starting" : "Start loop"}</button>
      </div>
      <details className="dashboard-agent-advanced">
        <summary><span><i aria-hidden="true">⌄</i><strong>Run settings</strong><small>Configure limits and technique access</small></span><span>{maxRounds} rounds · {maxTokens.toLocaleString()} tokens · {concurrency} concurrent · {requestDelay} ms · {techniqueSummary}</span></summary>
        <div className="dashboard-agent-advanced-body">
          <div className="dashboard-form-grid">
            <label className="dashboard-field"><span>Maximum rounds</span><input type="number" min={1} max={50} value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} /></label>
            <label className="dashboard-field"><span>Maximum tokens</span><input type="number" min={1} max={32000} value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
            <label className="dashboard-field"><span>Concurrency</span><input type="number" min={1} max={32} value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} /></label>
            <label className="dashboard-field"><span>Request delay (ms)</span><input type="number" min={0} max={60000} value={requestDelay} onChange={(event) => setRequestDelay(Number(event.target.value))} /></label>
          </div>
          <div className="dashboard-technique-picker">
        <button type="button" className={`dashboard-technique-trigger ${techniquePickerOpen ? "open" : ""}`} aria-haspopup="dialog" aria-expanded={techniquePickerOpen} onClick={() => setTechniquePickerOpen((open) => !open)}>
          <span>Technique access</span><strong>{selected == null ? `All ${techniques.length}` : `${selected.length} of ${techniques.length}`}</strong><i aria-hidden="true">⌄</i>
        </button>
        {selected != null && <div className="dashboard-technique-chips" aria-label="Selected techniques">{selected.slice(0, 5).map((name) => <button type="button" key={name} title={`Remove ${name}`} onClick={() => setSelected((current) => current?.filter((item) => item !== name) || [])}>{name}<span aria-hidden="true">×</span></button>)}{selected.length > 5 && <span>+{selected.length - 5}</span>}</div>}
        {techniquePickerOpen && <div className="dashboard-technique-popover" role="dialog" aria-label="Choose technique access" onKeyDown={(event) => { if (event.key === "Escape") setTechniquePickerOpen(false); }}>
          <header><div><strong>Technique access</strong><span>{selected == null ? "All capabilities enabled" : `${selected.length} selected`}</span></div><button type="button" aria-label="Close technique picker" onClick={() => setTechniquePickerOpen(false)}>×</button></header>
          <div className="dashboard-technique-search"><input autoFocus aria-label="Search techniques" value={techniqueSearch} onChange={(event) => setTechniqueSearch(event.target.value)} placeholder="Search tools and techniques" /><button type="button" onClick={() => setSelected(null)}>All</button><button type="button" onClick={() => setSelected([])}>None</button></div>
          <div className="dashboard-technique-list">{visibleTechniques.map((item) => <label key={item.name} title={item.description || "Registered capability"}><input type="checkbox" checked={selected == null || selected.includes(item.name)} onChange={(event) => setSelected((current) => { const base = current == null ? techniques.map((entry) => entry.name) : current; return event.target.checked ? [...new Set([...base, item.name])] : base.filter((name) => name !== item.name); })} /><span><strong>{item.name}</strong><small>{item.description || "Registered capability"}</small></span></label>)}</div>
          <footer><span>{visibleTechniques.length} shown</span><button type="button" className="dashboard-button dashboard-button-small" onClick={() => setTechniquePickerOpen(false)}>Done</button></footer>
        </div>}
          </div>
        </div>
      </details>
      {message && <span className="dashboard-inline-status" role="status">{message}</span>}
    </div>
  </details>;
}

function SteeringBar({ execution, onContinued }: { execution: ExecutionSummary | null; onContinued: (execution: ExecutionSummary) => void }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (!execution || !message.trim()) return;
    setSending(true);
    setStatus("");
    try {
      const result = await api.steer(execution, message.trim());
      setMessage("");
      if (result.execution && result.continued) {
        onContinued(result.execution);
        setStatus("Continuation started with your steering message.");
      } else {
        setStatus("Steering queued for the next safe boundary.");
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Unable to queue steering");
    } finally { setSending(false); }
  };
  return (
    <section className="dashboard-steer" aria-label="Steer the attacker">
      <div className="dashboard-steer-head"><strong>Steer the attacker</strong><span>{execution?.status === "succeeded" ? "Continue this completed engagement" : execution?.current_round ? `Round ${execution.current_round}` : execution ? "Waiting for the first round" : "Available when the loop starts"}</span>{status && <span role="status">{status}</span>}</div>
      <div className="dashboard-steer-row">
        <label><span className="dashboard-sr-only">Steering message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); submit(); }
        }} placeholder={execution?.status === "succeeded" ? "Continue this engagement with a new instruction. Ctrl Enter sends." : execution ? "Steer or command the attacker. Ctrl Enter sends." : "Draft steering guidance here; it can be sent after the loop starts."} /></label>
        <button type="button" className="dashboard-button dashboard-button-primary" disabled={!execution || !message.trim() || sending} onClick={submit}>{sending ? "Sending" : "Send"}</button>
      </div>
    </section>
  );
}

const LOOP_KINDS = new Set(["start", "round", "message", "tool_call", "tool_result", "result", "verdict", "judge_verdict", "jef_test", "jef_validate", "feedback", "operator", "error", "control", "done"]);

function isJEFEvent(event: EventEnvelope): boolean {
  return ["jef_test", "jef_validate"].includes(event.kind)
    || String(event.data?.evaluator || "").toLowerCase() === "jef";
}

function strings(value: unknown, samples?: number): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, count]) => Number(count) > 0)
    .map(([criterion, count]) => samples ? `${criterion} (${count}/${samples})` : criterion);
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jefEvaluation(event: EventEnvelope): JEFEvaluation | null {
  const candidate = isJEFEvent(event) ? event.data : event.data?.evaluation;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const evaluation = candidate as Record<string, unknown>;
  if (typeof evaluation.behavior !== "string") return null;
  const samples = numberValue(evaluation.samples);
  const percentages = Array.isArray(evaluation.percentages)
    ? evaluation.percentages.map(numberValue).filter((value): value is number => value !== undefined)
    : [];
  const percentage = numberValue(evaluation.percentage)
    ?? (percentages.length ? percentages.reduce((total, value) => total + value, 0) / percentages.length : undefined)
    ?? ((numberValue(evaluation.pass_rate) ?? 0) * 100);
  const passedValue = evaluation.passed;
  const passed = typeof passedValue === "boolean" ? passedValue : Number(passedValue || 0) > 0;
  return {
    behavior: evaluation.behavior,
    title: typeof evaluation.title === "string" ? evaluation.title : undefined,
    threshold: numberValue(evaluation.threshold) ?? 0,
    score: numberValue(evaluation.score) ?? numberValue(evaluation.pass_rate),
    percentage,
    triggered: Boolean(evaluation.triggered),
    passed,
    total_possible_score: numberValue(evaluation.total_possible_score),
    matches: strings(evaluation.matches, samples),
    missing: strings(evaluation.missing, samples),
    conversation_id: numberValue(evaluation.conversation_id),
    output_id: numberValue(evaluation.output_id),
    output_ids: Array.isArray(evaluation.output_ids) ? evaluation.output_ids.map(numberValue).filter((value): value is number => value !== undefined) : undefined,
    output_count: numberValue(evaluation.output_count),
    status: evaluation.status === "unavailable" ? "unavailable" : "scored",
    error: typeof evaluation.error === "string" ? evaluation.error : undefined,
  };
}

function AgentLoop({ execution, events, streamState, configuredRoles }: { execution: ExecutionSummary | null; events: EventEnvelope[]; streamState: string; configuredRoles?: RoleAssignments | null }) {
  const activity = useMemo(() => projectActivityEvents(events, execution?.objective || ""), [events, execution?.objective]);
  const loopEvents = useMemo(() => activity.filter((event) => LOOP_KINDS.has(event.kind)), [activity]);
  const active = Boolean(execution && ["queued", "running", "pausing", "paused"].includes(execution.status));
  const latest = loopEvents[loopEvents.length - 1];
  const roleModel = (role: "attacker" | "target" | "judge") => {
    const snapshot = execution?.[role];
    if (typeof snapshot === "string" && snapshot.trim()) return snapshot;
    return configuredRoles?.[role]?.model || "Not configured";
  };
  const roles = [
    { id: "attacker" as const, label: "Attack", model: roleModel("attacker"), detail: "Plans and adapts the next attempt" },
    { id: "target" as const, label: "Target", model: roleModel("target"), detail: "Receives the attack and responds" },
    { id: "judge" as const, label: "Judge", model: roleModel("judge"), detail: "Evaluates evidence and guides the loop" },
  ];
  const latestFor = (role: string) => [...loopEvents].reverse().find((event) => actorLabel(event).toLowerCase() === role);

  return <section className="dashboard-agent-loop" aria-label="Attack target judge loop">
    <div className="dashboard-loop-roles">
      {roles.map((role, index) => {
        const roleEvent = latestFor(role.id);
        const isCurrent = active && latest && actorLabel(latest).toLowerCase() === role.id;
        return <article key={role.id} className={`dashboard-loop-role dashboard-loop-role-${role.id} ${isCurrent ? "active" : ""}`}>
          <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{role.label}</strong><i>{isCurrent ? "Active" : roleEvent ? formatTime(roleEvent.timestamp) : "Waiting"}</i></header>
          <b title={role.model}>{role.model}</b>
          <p>{roleEvent ? eventTitle(roleEvent) : role.detail}</p>
        </article>;
      })}
    </div>
    <div className="dashboard-loop-exchange-head"><strong>Conversation stream</strong><span>{loopEvents.length} exchanges{execution?.current_round ? ` · round ${execution.current_round}` : ""}</span><i>{execution ? <StatusBadge status={execution.status} /> : <span className="dashboard-status">● Idle</span>}<small>{execution ? `stream ${streamState}` : "awaiting objective"}</small></i></div>
    <ol className="dashboard-loop-feed" aria-label="Agent conversation stream">
      {!execution && <li className="dashboard-loop-empty"><EmptyState title="No active agent loop" detail="Enter an objective above to begin an attack → target → judge engagement." /></li>}
      {execution && !loopEvents.length && <li className="dashboard-loop-empty"><EmptyState title="Waiting for the first exchange" detail="Messages, target responses, tool actions, and judge verdicts will appear here in order." /></li>}
      {loopEvents.map((event) => {
        const actor = actorLabel(event);
        const copy = event.text || eventTitle(event);
        const compactKind = ["start", "round", "lifecycle", "run_meta"].includes(event.kind.toLowerCase());
        const transcript = event.text?.trim() || "";
        const evaluation = jefEvaluation(event);
        const toolArgs = event.kind === "tool_call" ? event.data?.args ?? event.data?.arguments : undefined;
        return <li key={event.id} className={`dashboard-loop-event dashboard-loop-event-${actor.toLowerCase()}`}>
          <div className="dashboard-loop-event-summary">
            <span className="dashboard-loop-event-marker" aria-hidden="true">●</span>
            <span className="dashboard-loop-event-who"><strong>{actor}</strong><small>{event.round ? `Round ${event.round}` : formatTime(event.timestamp)}</small></span>
            <span className="dashboard-loop-event-copy"><strong>{event.kind.replace(/_/g, " ")}</strong>{compactKind && <span title={copy}>{copy}</span>}</span>
            {event.verdict ? <VerdictBadge verdict={event.verdict} /> : <span className="dashboard-loop-event-time">{formatTime(event.timestamp)}</span>}
          </div>
          {!compactKind && <div className="dashboard-loop-event-detail">
            {evaluation ? <JEFResult evaluation={evaluation} /> : event.kind === "tool_call" ? <div className="dashboard-loop-tool-call"><strong>{eventTitle(event)}</strong>{hasValue(toolArgs) && <JsonBlock value={toolArgs} empty="This tool call has no arguments." />}</div> : transcript ? <p>{transcript}</p> : <p>{copy}</p>}
            <span>{eventMeta(event) || `Event #${event.sequence}`}</span>
            {hasValue(event.data) && <details><summary>Raw event data</summary><JsonBlock value={event.data} /></details>}
          </div>}
        </li>;
      })}
    </ol>
  </section>;
}

export function AgentView({ execution, enabled = true, onRefresh, onStarted, configuredRoles }: { execution: ExecutionSummary | null; enabled?: boolean; onRefresh: () => void; onStarted: (execution: ExecutionSummary) => void; configuredRoles?: RoleAssignments | null }) {
  const { events, streamState } = useExecutionEvents(execution, enabled);
  return <div className="dashboard-agent">
    <RunStrip execution={execution} onRefresh={onRefresh} />
    <RunLauncher execution={execution} onRefresh={onRefresh} onStarted={onStarted} />
    <AgentLoop execution={execution} events={events} streamState={streamState} configuredRoles={configuredRoles} />
    <SteeringBar execution={execution} onContinued={onStarted} />
  </div>;
}

export function LiveView({ execution, enabled = true }: { execution: ExecutionSummary | null; enabled?: boolean }) {
  const [historicalRuns, setHistoricalRuns] = useState<HistoricalRunOption[]>([]);
  const [historicalRun, setHistoricalRun] = useState("");
  const selectedExecution = historicalRun
    ? historicalExecution(historicalRuns.find((run) => run.run_name === historicalRun) || { run_name: historicalRun })
    : execution;
  const [selected, setSelected] = useState<EventEnvelope | null>(null);
  const [liveTail, setLiveTail] = useState(true);
  const liveTailRef = useRef(true);
  const [unread, setUnread] = useState(0);
  const { events, streamState } = useExecutionEvents(selectedExecution, enabled, () => {
    if (!liveTailRef.current) setUnread((current) => current + 1);
  });
  const activityEvents = useMemo(
    () => projectActivityEvents(events, selectedExecution?.objective || ""),
    [events, selectedExecution?.objective],
  );
  const rawEvents = useMemo(
    () => correlateRawEvents(events, selectedExecution?.objective || ""),
    [events, selectedExecution?.objective],
  );

  useEffect(() => {
    if (!enabled) return;
    api.historyRuns(1000).then((payload) => {
      const runs = payload.items.map((row) => ({
        run_name: String(row.run_name || ""),
        first_timestamp: String(row.first_timestamp || ""),
        last_timestamp: String(row.last_timestamp || ""),
        event_count: Number(row.event_count || 0),
      })).filter((run) => run.run_name);
      setHistoricalRuns(runs);
      setHistoricalRun((current) => current || (!execution ? runs[0]?.run_name || "" : ""));
    }).catch(() => setHistoricalRuns([]));
  }, [enabled, execution?.id]);
  useEffect(() => {
    if (execution?.source === "history") setHistoricalRun(execution.run_id || execution.id);
    else if (execution) setHistoricalRun("");
  }, [execution?.id, execution?.source, execution?.run_id]);
  useEffect(() => { liveTailRef.current = liveTail; if (liveTail) setUnread(0); }, [liveTail]);
  useEffect(() => {
    setSelected(null);
    setUnread(0);
  }, [selectedExecution?.id]);

  useEffect(() => {
    setSelected((current) => {
      if (!activityEvents.length) return null;
      const refreshed = current && activityEvents.find((event) => event.id === current.id);
      if (refreshed) return refreshed;
      return liveTail ? activityEvents[activityEvents.length - 1] : current;
    });
  }, [activityEvents, liveTail]);

  return (
    <div className="dashboard-live dashboard-live-dashboard">
      <LiveRunSelector execution={execution} runs={historicalRuns} selectedRun={historicalRun} onSelect={setHistoricalRun} />
      <div className="dashboard-live-grid">
        <main className="dashboard-observatory">
          <RunOverview events={activityEvents} selected={selected} onSelect={setSelected} execution={selectedExecution} streamState={streamState} />
          <Timeline events={activityEvents} rawEvents={rawEvents} selected={selected} onSelect={setSelected} liveTail={liveTail} setLiveTail={setLiveTail} unread={unread} markRead={() => { setUnread(0); setLiveTail(true); }} />
        </main>
        <Inspector event={selected} />
      </div>
    </div>
  );
}
