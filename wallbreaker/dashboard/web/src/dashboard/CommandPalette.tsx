import { useEffect, useMemo, useRef, useState } from "react";
import type { Capability, DashboardRoute } from "./types";

const ROUTES: Array<{ id: DashboardRoute; label: string; description: string }> = [
  { id: "agent", label: "Agent", description: "Run and steer the attack-target-judge loop" },
  { id: "live", label: "Live", description: "Observe current and historical engagements" },
  { id: "compose", label: "Compose", description: "Build and inspect a payload" },
  { id: "workflows", label: "Workflows", description: "Run any registered capability" },
  { id: "findings", label: "Findings", description: "Investigate recorded evidence" },
  { id: "runs", label: "Runs and Logs", description: "Inspect historical event records" },
  { id: "reports", label: "Reports", description: "Summarize and export evidence" },
  { id: "models", label: "Models", description: "Inspect providers and model roles" },
  { id: "settings", label: "Settings", description: "Tune operator defaults" },
];

export function CommandPalette({
  open,
  capabilities,
  onClose,
  onNavigate,
  onCapability,
}: {
  open: boolean;
  capabilities: Capability[];
  onClose: () => void;
  onNavigate: (route: DashboardRoute) => void;
  onCapability: (capability: Capability) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  const lower = query.trim().toLowerCase();
  const routes = useMemo(() => ROUTES.filter((item) =>
    !lower || `${item.label} ${item.description}`.toLowerCase().includes(lower),
  ), [lower]);
  const matches = useMemo(() => capabilities.filter((item) =>
    !lower || `${item.title} ${item.description || ""} ${item.category}`.toLowerCase().includes(lower),
  ).slice(0, 24), [capabilities, lower]);

  if (!open) return null;
  return (
    <div className="dashboard-palette-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dashboard-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="dashboard-palette-search">
          <label htmlFor="dashboard-command-search">Command or capability</label>
          <input
            id="dashboard-command-search"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search views, workflows, tools, and transforms"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="dashboard-palette-results">
          {routes.length > 0 && <div className="dashboard-palette-group">
            <h3>Navigate</h3>
            {routes.map((item) => <button type="button" key={item.id} onClick={() => onNavigate(item.id)}>
              <span>{item.label}</span><small>{item.description}</small>
            </button>)}
          </div>}
          {matches.length > 0 && <div className="dashboard-palette-group">
            <h3>Capabilities</h3>
            {matches.map((item) => <button type="button" key={item.id} onClick={() => onCapability(item)}>
              <span>{item.title}</span><small>{item.category}{item.execution_mode ? ` / ${item.execution_mode}` : ""}</small>
            </button>)}
          </div>}
          {!routes.length && !matches.length && <div className="dashboard-empty"><strong>No matching command</strong></div>}
        </div>
        <footer>Tip: press Ctrl K from anywhere to reopen this menu.</footer>
      </section>
    </div>
  );
}

export { ROUTES };
