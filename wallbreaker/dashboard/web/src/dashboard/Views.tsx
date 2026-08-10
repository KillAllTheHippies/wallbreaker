import { useEffect, useState } from "react";
import { arsenalItems, api } from "../api";
import { JEFBehaviorPicker } from "./JEFBehaviorPicker";
import { Profiles } from "../components/Profiles";
import { ProviderManager } from "../components/ProviderManager";
import { TargetOptions } from "../components/TargetOptions";
import { EmptyState, ErrorBanner, JEFIndicator, JsonBlock, LoadingState, Panel, VerdictBadge } from "./components";
import { WorkflowStudio } from "./WorkflowStudio";
import { RunsExplorer } from "./RunsExplorer";
import { ReportsDashboard } from "./ReportsDashboard";
import { BookmarkButton, bookmarkId, useBookmarks } from "./Bookmarks";
import { JEFResult } from "./JEFResult";
import type {
  ArsenalItem,
  Capability,
  ConsoleConversation,
  ComposePayload,
  ComposeResult,
  FindingRecord,
  SettingsRecord,
} from "./types";

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unexpected request failure";
}

function findingBookmarkKey(item: FindingRecord): string {
  return String(item.id || `${item.run || "unknown"}:${item.line || item.ts || item.technique || "finding"}`);
}

function useArsenal() {
  const [items, setItems] = useState<ArsenalItem[] | null>(null);
  useEffect(() => {
    Promise.all([api.presets(), api.transforms(), api.tools()])
      .then(([presets, transforms, tools]) => setItems(arsenalItems(presets, transforms, tools)))
      .catch(() => setItems([]));
  }, []);
  return items;
}

export function ComposeView() {
  const arsenal = useArsenal();
  const presets = (arsenal || []).filter((item) => item.kind === "preset");
  const transforms = (arsenal || []).filter((item) => item.kind === "transform");
  const [request, setRequest] = useState("");
  const [preset, setPreset] = useState("");
  const [selectedTransforms, setSelectedTransforms] = useState<string[]>([]);
  const [system, setSystem] = useState("");
  const [jefBehavior, setJefBehavior] = useState("");
  const [maxTokens, setMaxTokens] = useState(8192);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [conversation, setConversation] = useState<ConsoleConversation>({ active: false, turn_count: 0, turns: [], run_log: "" });
  const [working, setWorking] = useState<"preview" | "fire" | "">("");
  const [error, setError] = useState("");

  const applySetup = (setup?: ComposePayload, restoreRequest = false) => {
    if (!setup) return;
    if (restoreRequest) setRequest(setup.request || "");
    setPreset(setup.preset || "");
    setSelectedTransforms(setup.transforms || []);
    setSystem(setup.system || "");
    setJefBehavior(setup.jef_behavior || "");
    if (setup.max_tokens) setMaxTokens(setup.max_tokens);
  };

  useEffect(() => {
    api.consoleConversation().then((next) => {
      setConversation(next);
      applySetup(next.opening);
      if (!next.opening) setJefBehavior(next.jef_behavior || "");
    }).catch(() => undefined);
  }, []);

  const submit = async (action: "preview" | "fire") => {
    if (!request.trim()) return;
    setWorking(action);
    setError("");
    const body = {
      request,
      preset: conversation.active ? undefined : preset || undefined,
      transforms: selectedTransforms,
      system: conversation.active ? undefined : system || undefined,
      max_tokens: maxTokens,
      jef_behavior: jefBehavior || undefined,
    };
    try {
      const next = action === "preview" ? await api.compose(body) : await api.fire(body);
      setResult(next);
      if (action === "fire" && next.conversation) setConversation(next.conversation);
    }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setWorking(""); }
  };

  const beginNewTurn = async () => {
    setWorking("fire"); setError("");
    try {
      const next = await api.resetConsoleConversation();
      setConversation(next);
      setResult(null);
      applySetup(next.retained_setup);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setWorking(""); }
  };

  return <div className="dashboard-page dashboard-compose-grid">
    <Panel title="Attack composer" meta="Persistent multi-turn target conversation">
      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
      <div className={`dashboard-compose-session ${conversation.active ? "active" : "fresh"}`}>
        <div><span>{conversation.active ? "ACTIVE THREAD" : "NEW THREAD"}</span><strong>{conversation.active ? `${conversation.turn_count} turn${conversation.turn_count === 1 ? "" : "s"} · follow-ups retain target context` : "The first delivery opens a multi-turn conversation"}</strong><small>{conversation.run_log || "A run log is created on the first delivery"}</small></div>
        <div className="dashboard-inline-actions"><button type="button" className="dashboard-text-button" disabled={!request || !!working} onClick={() => setRequest("")}>Clear input</button>{conversation.active && <button type="button" className="dashboard-button" disabled={!!working} onClick={() => void beginNewTurn()}>New turn</button>}</div>
      </div>
      <div className="dashboard-form-grid">
        {!conversation.active && <JEFBehaviorPicker value={jefBehavior} onChange={setJefBehavior} />}
        <label className="dashboard-field dashboard-field-wide"><span>{conversation.active ? `Follow-up turn ${conversation.turn_count + 1}` : "First turn"}</span><textarea value={request} onChange={(event) => setRequest(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") void submit("fire"); }} placeholder={conversation.active ? "Continue the same target conversation…  Ctrl Enter sends" : "Enter the authorized evaluation objective or request"} /></label>
        <label className="dashboard-field"><span>Initial preset</span><select value={preset} disabled={conversation.active} onChange={(event) => setPreset(event.target.value)}><option value="">None</option>{presets.map((item) => <option key={item.name}>{item.name}</option>)}</select><small>{conversation.active ? "Locked until new turn" : "Applied to the opening turn"}</small></label>
        <label className="dashboard-field"><span>Maximum tokens</span><input type="number" min={1} max={64000} value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
        <label className="dashboard-field dashboard-field-wide"><span>Initial system prompt override</span><textarea value={system} disabled={conversation.active} onChange={(event) => setSystem(event.target.value)} placeholder="Optional system prompt for the complete thread" /></label>
      </div>
      <fieldset className="dashboard-check-grid"><legend>Transforms for this turn</legend>
        {!transforms.length && <span className="dashboard-muted">No transforms loaded.</span>}
        {transforms.map((item) => <label key={item.name}><input type="checkbox" checked={selectedTransforms.includes(item.name)} onChange={(event) => setSelectedTransforms((current) => event.target.checked ? [...current, item.name] : current.filter((name) => name !== item.name))} /><span>{item.name}</span></label>)}
      </fieldset>
      <div className="dashboard-actions">
        <button type="button" className="dashboard-button" disabled={!request.trim() || !!working} onClick={() => submit("preview")}>{working === "preview" ? "Composing" : "Preview turn"}</button>
        <button type="button" className="dashboard-button dashboard-button-primary" disabled={!request.trim() || !!working} onClick={() => submit("fire")}>{working === "fire" ? "Delivering" : conversation.active ? "Send follow-up" : "Open conversation"}</button>
      </div>
    </Panel>
    <Panel title="Target conversation" meta={conversation.active ? `${conversation.turn_count} turns · active conversation` : "No active conversation"}>
      {!conversation.turns.length && !result && <EmptyState title="No conversation yet" detail="The first delivery opens a persistent target thread. Every later delivery is a contextual follow-up until you start a new turn." />}
      {!!conversation.turns.length && <div className="dashboard-conversation-thread">{conversation.turns.map((turn) => <article className="dashboard-conversation-turn" key={turn.index}>
        <div className="dashboard-turn-user"><header><span>YOU · TURN {turn.index}</span>{turn.transforms?.length ? <small>{turn.transforms.join(" + ")}</small> : null}</header><p>{turn.request}</p>{turn.payload !== turn.request && <details><summary>Transformed payload</summary><JsonBlock value={turn.payload} /></details>}</div>
        <div className="dashboard-turn-target"><header><span>TARGET</span>{turn.verdict && <VerdictBadge verdict={turn.verdict} />}</header><p>{turn.response}</p>{turn.jef_evaluation && <JEFResult evaluation={turn.jef_evaluation} />}</div>
      </article>)}</div>}
      {result && !result.response && <div className="dashboard-turn-preview"><header><strong>TURN PREVIEW</strong><span>Not delivered</span></header><JsonBlock value={result.payload} /></div>}
    </Panel>
  </div>;
}

export function WorkflowsView({ capabilities, initialCapability, onConsumed }: {
  capabilities: Capability[];
  initialCapability?: string;
  onConsumed: () => void;
}) {
  return <WorkflowStudio capabilities={capabilities} initialCapability={initialCapability} onConsumed={onConsumed} />;
}

export function FindingsView() {
  const [findings, setFindings] = useState<FindingRecord[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("all");
  const [selected, setSelected] = useState<FindingRecord | null>(null);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const bookmarks = useBookmarks();
  useEffect(() => {
    setError("");
    api.findingRuns().then((runs) => {
      const names = runs.filter((run) => Number(run.findings || 0) > 0).map((run) => run.name);
      return names.length ? api.findings(names) : [];
    }).then(setFindings).catch((reason) => {
      setError(errorMessage(reason));
      setFindings([]);
    });
  }, []);
  if (!findings) return <LoadingState label="Loading findings" />;
  const verdicts = [...new Set(findings.map((item) => item.label).filter(Boolean) as string[])];
  const filtered = findings.filter((item) => (!bookmarkedOnly || bookmarks.isBookmarked("finding", findingBookmarkKey(item))) && (verdict === "all" || item.label === verdict) && (!query || `${item.technique || ""} ${item.reason || ""} ${item.response || ""} ${item.run || ""}`.toLowerCase().includes(query.toLowerCase())));
  return <div className="dashboard-page dashboard-library-grid dashboard-findings-page">
    <Panel className="dashboard-findings-panel" title="Findings" meta={`${filtered.length} evidence records`}>
      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
      <div className="dashboard-filterbar"><input aria-label="Search findings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search evidence, technique, run" /><select aria-label="Finding verdict" value={verdict} onChange={(event) => setVerdict(event.target.value)}><option value="all">All verdicts</option>{verdicts.map((value) => <option key={value}>{value}</option>)}</select><button type="button" className={`dashboard-button dashboard-button-small ${bookmarkedOnly ? "active" : ""}`} aria-pressed={bookmarkedOnly} onClick={() => setBookmarkedOnly((current) => !current)}>★ Bookmarked</button></div>
      {bookmarks.error && <ErrorBanner message={bookmarks.error} />}
      {!filtered.length && <EmptyState title="No findings match" detail={findings.length ? "Clear filters to see other evidence." : "No findings have been recorded yet."} />}
      <div className="dashboard-finding-list">{filtered.map((item) => {
        const key = findingBookmarkKey(item);
        const label = String(item.reason || item.response || item.technique || "Recorded finding");
        const target = { kind: "finding" as const, key, label, run_name: item.run };
        return <div className={`dashboard-bookmark-row ${selected === item ? "active" : ""}`} key={key}><button type="button" className="dashboard-row-select" onClick={() => setSelected(item)}><div><VerdictBadge verdict={item.label} /><JEFIndicator behavior={item.jef_behavior} evaluation={item.jef_evaluation} /><span>{item.technique || "Unclassified"}</span></div><strong>{label}</strong><small>{item.run || "Unknown run"}{item.ts ? ` / ${item.ts}` : ""}</small></button><BookmarkButton active={bookmarks.isBookmarked("finding", key)} busy={bookmarks.busy === bookmarkId(target)} label={label} onClick={() => void bookmarks.toggle(target)} /></div>;
      })}</div>
    </Panel>
    <Panel className="dashboard-finding-inspector" title="Finding inspector" meta={selected?.id || selected?.run}>{selected ? <JsonBlock value={selected} /> : <EmptyState title="Select a finding" detail="The complete evidence record, judging, and conversation will appear here." />}</Panel>
  </div>;
}

export function RunsView() {
  return <RunsExplorer />;
}

export function ReportsView() {
  return <ReportsDashboard />;
}

export function ModelsView() {
  return <div className="dashboard-page">
    <Panel title="Provider management" meta="Create, edit, enable, discover, and test"><ProviderManager /></Panel>
    <Panel title="Attacker, target, and judge profiles" meta="Reusable named role assignments"><Profiles /></Panel>
  </div>;
}

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.settings().then(setSettings).catch((reason) => setError(errorMessage(reason))); }, []);
  if (!settings && !error) return <LoadingState label="Loading settings" />;
  const agent = settings?.agent || {};
  const setAgent = (key: string, value: number) => setSettings((current) => ({ ...(current || {}), agent: { ...(current?.agent || {}), [key]: value } }));
  const save = async () => {
    if (!settings) return;
    setError(""); setSaved("");
    try { setSettings(await api.saveSettings(settings)); setSaved("Settings saved."); }
    catch (reason) { setError(errorMessage(reason)); }
  };
  return <div className="dashboard-page dashboard-settings-page"><Panel title="Operator defaults" meta="Applies to future launches">
    {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
    <div className="dashboard-form-grid">
      <label className="dashboard-field"><span>Maximum rounds</span><input type="number" min={1} max={100} value={agent.max_rounds ?? 20} onChange={(event) => setAgent("max_rounds", Number(event.target.value))} /></label>
      <label className="dashboard-field"><span>Maximum tokens</span><input type="number" min={1} max={64000} value={agent.max_tokens ?? 8192} onChange={(event) => setAgent("max_tokens", Number(event.target.value))} /></label>
      <label className="dashboard-field"><span>Concurrency</span><input type="number" min={1} max={64} value={agent.concurrency ?? 4} onChange={(event) => setAgent("concurrency", Number(event.target.value))} /></label>
      <label className="dashboard-field"><span>Request delay (ms)</span><input type="number" min={0} max={60000} value={agent.request_delay_ms ?? 0} onChange={(event) => setAgent("request_delay_ms", Number(event.target.value))} /></label>
    </div>
    <div className="dashboard-actions"><button type="button" className="dashboard-button dashboard-button-primary" disabled={!settings} onClick={save}>Save defaults</button>{saved && <span className="dashboard-inline-status" role="status">{saved}</span>}</div>
  </Panel><Panel title="Target delivery controls" meta="Modality, system handling, backend, and judging"><TargetOptions /></Panel></div>;
}
