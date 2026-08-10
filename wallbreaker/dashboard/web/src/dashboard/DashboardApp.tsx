import { useCallback, useEffect, useRef, useState } from "react";
import { api, type RoleAssignments } from "../api";
import { RoleChooser } from "../components/RoleChooser";
import { CommandPalette, ROUTES } from "./CommandPalette";
import { formatTime, StatusBadge } from "./components";
import { mergeExecutionRefresh, selectionAfterExecutionRefresh } from "./executionFocus";
import { AgentView, LiveView } from "./LiveView";
import {
  ComposeView,
  FindingsView,
  ModelsView,
  ReportsView,
  RunsView,
  SettingsView,
  WorkflowsView,
} from "./Views";
import type { Capability, ExecutionSummary, DashboardRoute } from "./types";

function routeFromLocation(): DashboardRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const candidate = hash.split("/")[0];
  if (ROUTES.some((item) => item.id === candidate)) return candidate as DashboardRoute;
  if (hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/agent`);
  return "agent";
}

function isActive(execution: ExecutionSummary) {
  return ["queued", "running", "pausing", "paused"].includes(execution.status);
}

const ROUTE_ICONS: Record<DashboardRoute, string> = {
  agent: "◉",
  live: "◌",
  compose: "◇",
  workflows: "↯",
  findings: "⌕",
  runs: "▤",
  reports: "▥",
  models: "◫",
  settings: "⚙",
};

export function DashboardApp() {
  const [route, setRouteState] = useState<DashboardRoute>(routeFromLocation);
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(() => window.localStorage.getItem("wallbreaker-dashboard-rail-collapsed") === "true");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [capabilitySource, setCapabilitySource] = useState("dashboard");
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState("");
  const [initialCapability, setInitialCapability] = useState("");
  const [roles, setRoles] = useState<RoleAssignments | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const pendingExecutionFocus = useRef<ExecutionSummary | null>(null);
  const executionsRequestInFlight = useRef(false);
  const scrollPositions = useRef<Partial<Record<DashboardRoute, number>>>({});

  const refreshExecutions = useCallback(() => {
    // Do not stack a new request behind a slow server response. This is
    // especially important while a large provider catalog is being fetched,
    // because the five-second refresh cadence must not become an unbounded
    // connection queue.
    if (executionsRequestInFlight.current) return;
    executionsRequestInFlight.current = true;
    api.executions().then((result) => {
      const pending = pendingExecutionFocus.current;
      setExecutions(mergeExecutionRefresh(result.data, pending));
      setSelectedExecutionId((current) => selectionAfterExecutionRefresh(result.data, current, pending));
      if (pending && result.data.some((item) => item.id === pending.id)) {
        pendingExecutionFocus.current = null;
      }
    }).catch(() => setExecutions([])).finally(() => {
      executionsRequestInFlight.current = false;
    });
  }, []);

  const refreshRoles = useCallback(() => {
    api.roles().then(setRoles).catch(() => setRoles(null));
  }, []);

  const focusExecution = useCallback((execution: ExecutionSummary) => {
    pendingExecutionFocus.current = execution;
    setExecutions((current) => [execution, ...current.filter((item) => item.id !== execution.id)]);
    setSelectedExecutionId(execution.id);
    window.requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }, []);

  useEffect(() => {
    api.capabilities().then((result) => { setCapabilities(result.data); setCapabilitySource(result.source); }).catch(() => setCapabilities([]));
    refreshExecutions();
    refreshRoles();
    const timer = window.setInterval(refreshExecutions, 5000);
    return () => window.clearInterval(timer);
  }, [refreshExecutions, refreshRoles]);

  useEffect(() => {
    const update = () => setRouteState(routeFromLocation());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("wallbreaker-dashboard-rail-collapsed", String(railCollapsed));
  }, [railCollapsed]);

  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = scrollPositions.current[route] || 0;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (mainRef.current) scrollPositions.current[route] = mainRef.current.scrollTop;
    };
  }, [route]);

  const navigate = useCallback((next: DashboardRoute) => {
    setRouteState(next);
    setRailOpen(false);
    setPaletteOpen(false);
    window.location.hash = `/${next}`;
  }, []);

  const chooseCapability = useCallback((capability: Capability) => {
    setInitialCapability(capability.id);
    navigate("workflows");
  }, [navigate]);

  const selectedExecution = executions.find((item) => item.id === selectedExecutionId) || null;
  const activeExecutions = executions.filter(isActive);
  const agentExecution = (selectedExecution?.capability_id === "agent.run" ? selectedExecution : null)
    || activeExecutions.find((item) => item.capability_id === "agent.run")
    || activeExecutions[0]
    || executions.find((item) => item.capability_id === "agent.run")
    || null;
  const recentExecutions = executions.filter((item) => !isActive(item)).slice(0, 5);
  const routeInfo = ROUTES.find((item) => item.id === route) || ROUTES[0];

  return (
    <div className={`dashboard-root ${railCollapsed ? "dashboard-rail-collapsed" : ""}`}>
      <a className="dashboard-skip" href="#dashboard-main">Skip to main content</a>
      <aside className={`dashboard-rail ${railOpen ? "open" : ""}`} aria-label="dashboard navigation">
        <div className="dashboard-brand"><span aria-hidden="true">◆</span><strong>WALL<b>BREAKER</b></strong><small>dashboard</small><button className="dashboard-rail-toggle" type="button" aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!railCollapsed} onClick={() => setRailCollapsed((collapsed) => !collapsed)}>{railCollapsed ? "›" : "‹"}</button><button className="dashboard-rail-close" type="button" aria-label="Close navigation" onClick={() => setRailOpen(false)}>Close</button></div>
        <nav>{ROUTES.map((item) => <button type="button" key={item.id} className={route === item.id ? "active" : ""} aria-current={route === item.id ? "page" : undefined} aria-label={item.label} title={item.label} onClick={() => navigate(item.id)}><span aria-hidden="true">{ROUTE_ICONS[item.id]}</span><b>{item.label}</b></button>)}</nav>
        <section className="dashboard-rail-section" aria-label="Active executions">
          <header><span>Active run</span><span>{activeExecutions.length}</span></header>
          {!activeExecutions.length && <p>No active execution</p>}
          {activeExecutions.map((execution) => <button type="button" key={execution.id} className={agentExecution?.id === execution.id ? "selected" : ""} onClick={() => { setSelectedExecutionId(execution.id); navigate("agent"); }}><strong>{execution.title || execution.id}</strong><StatusBadge status={execution.status} /><small>{execution.current_round ? `Round ${execution.current_round}${execution.max_rounds ? ` of ${execution.max_rounds}` : ""}` : "Waiting for round data"}</small></button>)}
        </section>
        <section className="dashboard-rail-section dashboard-run-queue" aria-label="Run queue and history">
          <header><span>Run queue</span><span>{executions.length}</span></header>
          {[...activeExecutions, ...recentExecutions].slice(0, 7).map((execution) => <button type="button" key={`queue-${execution.id}`} className={selectedExecutionId === execution.id ? "selected" : ""} onClick={() => { setSelectedExecutionId(execution.id); navigate("live"); }}><span aria-hidden="true">●</span><strong>{execution.title || execution.run_id || execution.id}</strong><small>{execution.status} / {formatTime(execution.created_at || execution.started_at)}</small></button>)}
        </section>
        <div className="dashboard-rail-foot"><span className="dashboard-status dashboard-status-running"><span aria-hidden="true">●</span>Local operator</span><small>Capability catalog: {capabilitySource}</small></div>
      </aside>
      <div className="dashboard-shell">
        <header className="dashboard-mobile-header"><button type="button" onClick={() => setRailOpen(true)} aria-label="Open navigation">Menu</button><div className="dashboard-brand"><span aria-hidden="true">◆</span><strong>WALL<b>BREAKER</b></strong></div><button type="button" onClick={() => setPaletteOpen(true)}>Commands</button></header>
        <header className="dashboard-page-header dashboard-operator-bar">
          <div className="dashboard-route-heading"><h1>{routeInfo.label}</h1></div>
          <div className="dashboard-operator-controls">
            {roles && (["attacker", "target", "judge"] as const).map((role) => <RoleChooser
              key={role}
              role={role}
              value={roles[role]}
              onSaved={() => { refreshRoles(); refreshExecutions(); }}
            />)}
            <button type="button" className="dashboard-command-button" onClick={() => setPaletteOpen(true)}>Commands <kbd>Ctrl K</kbd></button>
          </div>
        </header>
        <main ref={mainRef} id="dashboard-main" className={route === "live" ? "dashboard-main dashboard-main-live" : "dashboard-main"}>
          <div className={`dashboard-route-state ${route === "agent" ? "active" : ""}`}><AgentView execution={agentExecution} enabled={route === "agent"} onRefresh={refreshExecutions} onStarted={focusExecution} configuredRoles={roles} /></div>
          <div className={`dashboard-route-state ${route === "live" ? "active" : ""}`}><LiveView execution={selectedExecution} enabled={route === "live"} /></div>
          <div className={`dashboard-route-state ${route === "compose" ? "active" : ""}`}><ComposeView /></div>
          <div className={`dashboard-route-state ${route === "workflows" ? "active" : ""}`}><WorkflowsView capabilities={capabilities} initialCapability={initialCapability} onConsumed={() => setInitialCapability("")} /></div>
          <div className={`dashboard-route-state ${route === "findings" ? "active" : ""}`}><FindingsView /></div>
          <div className={`dashboard-route-state ${route === "runs" ? "active" : ""}`}><RunsView /></div>
          <div className={`dashboard-route-state ${route === "reports" ? "active" : ""}`}><ReportsView /></div>
          <div className={`dashboard-route-state ${route === "models" ? "active" : ""}`}><ModelsView /></div>
          <div className={`dashboard-route-state ${route === "settings" ? "active" : ""}`}><SettingsView /></div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} capabilities={capabilities} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onCapability={chooseCapability} />
    </div>
  );
}

export default DashboardApp;
