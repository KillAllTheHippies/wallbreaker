import { useEffect, useState } from "react";
import { api, type ConfigInfo, type Overview as OverviewT, type Settings as SettingsT } from "./api";
import { Agent } from "./components/Agent";
import { Overview } from "./components/Overview";
import { Console } from "./components/Console";
import { Findings } from "./components/Findings";
import { Runs } from "./components/Runs";
import { Arsenal } from "./components/Arsenal";
import { Settings } from "./components/Settings";
import { ModelChooser } from "./components/ModelChooser";

type Tab = "agent" | "overview" | "console" | "findings" | "runs" | "arsenal" | "settings";

const NAV: { id: Tab; label: string; short: string }[] = [
  { id: "agent", label: "Agent", short: "AG" },
  { id: "overview", label: "Overview", short: "OV" },
  { id: "console", label: "Attack console", short: "AC" },
  { id: "findings", label: "Findings", short: "FN" },
  { id: "runs", label: "Run logs", short: "RL" },
  { id: "arsenal", label: "Arsenal", short: "AR" },
  { id: "settings", label: "Settings", short: "ST" },
];

function tabFromHash(): Tab {
  const h = window.location.hash.replace("#", "");
  return (NAV.some((n) => n.id === h) ? h : "agent") as Tab;
}

export function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash());
  const [railCollapsed, setRailCollapsed] = useState(
    () => window.localStorage.getItem("wallbreaker.railCollapsed") === "true",
  );
  const setTab = (t: Tab) => { setTabState(t); window.location.hash = t; };
  const [cfg, setCfg] = useState<ConfigInfo | null>(null);
  const [ov, setOv] = useState<OverviewT | null>(null);
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [topTarget, setTopTarget] = useState("");
  const [topBusy, setTopBusy] = useState(false);
  const [topError, setTopError] = useState("");

  const refresh = () => {
    api.config().then(setCfg).catch(() => setCfg(null));
    api.overview().then(setOv).catch(() => setOv(null));
    api.settings().then(setSettings).catch(() => setSettings(null));
  };
  useEffect(refresh, [tab]);
  useEffect(() => setTopTarget(cfg?.target || ""), [cfg?.target]);

  const asr = ov?.scorecard?.asr;
  const asrStr = typeof asr === "number" ? `${Math.round(asr * 100)}%` : "—";
  const toggleRail = () => {
    setRailCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("wallbreaker.railCollapsed", String(next));
      return next;
    });
  };
  const saveProfile = async (profile: string) => {
    if (!profile) return;
    setTopBusy(true);
    setTopError("");
    setSettings((current) => current ? { ...current, default_profile: profile } : current);
    try {
      const saved = await api.saveSettings({ attacker_profile: profile });
      setSettings(saved);
      refresh();
    } catch (error) {
      setTopError((error as Error).message);
      refresh();
    } finally {
      setTopBusy(false);
    }
  };
  const saveTarget = async (model: string) => {
    const profile = settings?.default_profile;
    if (!profile || !model.trim()) return;
    setTopBusy(true);
    setTopError("");
    try {
      const saved = await api.saveSettings({
        target_profile: profile,
        target_model: model.trim(),
      });
      setSettings(saved);
      setTopTarget(saved.target?.model || model.trim());
      refresh();
    } catch (error) {
      setTopError((error as Error).message);
    } finally {
      setTopBusy(false);
    }
  };

  return (
    <div className={`app ${railCollapsed ? "rail-collapsed" : ""}`}>
      <aside className="rail" aria-label="Primary navigation">
        <div className="brand">
          <span className="mark">◆</span>
          <span className="word">{railCollapsed ? "WB" : <>WALL<b>BREAKER</b></>}</span>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!railCollapsed}
          >
            {railCollapsed ? "›" : "‹"}
          </button>
        </div>
        {NAV.map((n) => (
          <button
            type="button"
            key={n.id}
            className={`nav-item ${tab === n.id ? "active" : ""}`}
            onClick={() => setTab(n.id)}
            title={railCollapsed ? n.label : undefined}
            aria-current={tab === n.id ? "page" : undefined}
          >
            <span className="dot" />
            <span className="nav-label">{railCollapsed ? n.short : n.label}</span>
          </button>
        ))}
        <div className="spacer" />
        <div className="foot">
          break the wall ·<br />
          not the rules of engagement
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="title">{NAV.find((n) => n.id === tab)?.label}</div>
          <div className="meta">
            <label className="topbar-profile">
              <span>profile</span>
              <select
                aria-label="Provider profile"
                value={settings?.default_profile || ""}
                disabled={topBusy || !settings}
                onChange={(event) => void saveProfile(event.target.value)}
              >
                {(settings?.profiles || []).map((profile) => (
                  <option key={profile} value={profile}>{profile}</option>
                ))}
              </select>
            </label>
            <label className="topbar-target">
              <span>target</span>
              <ModelChooser
                compact
                ariaLabel="Target model"
                profile={settings?.default_profile || ""}
                value={topTarget}
                onChange={setTopTarget}
                onCommit={(model) => void saveTarget(model)}
                disabled={topBusy || !settings}
                placeholder="choose target"
              />
            </label>
            {topError && <span className="topbar-error" title={topError}>!</span>}
            <span className="pill">ASR {asrStr}</span>
          </div>
        </div>
        <div className="content">
          {tab === "agent" && <Agent hasTarget={!!cfg?.has_target} />}
          {tab === "overview" && <Overview ov={ov} />}
          {tab === "console" && <Console hasTarget={!!cfg?.has_target} />}
          {tab === "findings" && <Findings />}
          {tab === "runs" && <Runs />}
          {tab === "arsenal" && <Arsenal />}
          {tab === "settings" && <Settings onSaved={refresh} />}
        </div>
      </div>
    </div>
  );
}
