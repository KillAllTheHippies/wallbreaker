import type { ReactNode } from "react";
import type { EventEnvelope, ExecutionStatus } from "./types";

export function StatusBadge({ status }: { status: ExecutionStatus | string }) {
  const normalized = status.toLowerCase();
  return (
    <span className={`dashboard-status dashboard-status-${normalized}`}>
      <span aria-hidden="true">●</span>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return <span className="dashboard-muted">Not judged</span>;
  const normalized = verdict.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <span className={`dashboard-verdict dashboard-verdict-${normalized}`}>{verdict}</span>;
}

export function JEFIndicator({ behavior, evaluation }: { behavior?: string; evaluation?: { percentage?: number; threshold?: number; status?: string; title?: string } }) {
  if (!behavior && !evaluation) return null;
  const score = typeof evaluation?.percentage === "number" ? evaluation.percentage : null;
  const threshold = typeof evaluation?.threshold === "number" ? evaluation.threshold : null;
  const passed = score != null && threshold != null && score >= threshold;
  const result = score == null ? "unavailable" : `${score}%${threshold == null ? "" : `/${threshold}%`}`;
  return <span className={`dashboard-jef-indicator ${passed ? "pass" : "fail"}`} title={`${evaluation?.title || behavior || "JEF behavior"}: ${result}`}>JEF {result}</span>;
}

export function Panel({
  title,
  meta,
  actions,
  className = "",
  children,
}: {
  title: string;
  meta?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`dashboard-panel ${className}`}>
      <header className="dashboard-panel-header">
        <div className="dashboard-panel-title">
          <h2>{title}</h2>
          {meta && <span>{meta}</span>}
        </div>
        {actions && <div className="dashboard-panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="dashboard-empty" role="status">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="dashboard-loading" role="status"><span aria-hidden="true">●</span>{label}</div>;
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="dashboard-error" role="alert">
      <strong>Request failed</strong>
      <span>{message}</span>
      {onDismiss && <button type="button" className="dashboard-text-button" onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}

export function JsonBlock({ value, empty = "No structured data recorded." }: { value: unknown; empty?: string }) {
  if (value == null || value === "") return <EmptyState title={empty} />;
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="dashboard-code">{content}</pre>;
}

export function formatTime(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return value;
  return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(milliseconds?: number): string {
  if (milliseconds == null) return "--";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatTokens(input?: number, output?: number): string {
  if (input == null && output == null) return "--";
  return `${(input || 0).toLocaleString()} / ${(output || 0).toLocaleString()}`;
}

export function actorLabel(event: EventEnvelope): string {
  const value = event.actor || (event.kind === "tool" ? "Tool" : "System");
  return value.charAt(0).toUpperCase() + value.slice(1);
}
