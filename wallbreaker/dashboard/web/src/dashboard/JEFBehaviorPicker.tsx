import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { JEFBehavior } from "./types";

export function JEFBehaviorPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [behaviors, setBehaviors] = useState<JEFBehavior[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.jefBehaviors().then(setBehaviors).catch((reason) => {
    setBehaviors([]);
    setError(reason instanceof Error ? reason.message : "Unable to load the JEF catalog.");
  }); }, []);
  const selected = useMemo(() => behaviors.find((item) => item.id === value), [behaviors, value]);
  return <label className="dashboard-field">
    <span>JEF behavior</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || Boolean(error)}>
      <option value="">Custom / no JEF behavior</option>
      {behaviors.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.category}{item.deprecated ? " · legacy" : ""}</option>)}
    </select>
    <small className={error ? "dashboard-field-error" : ""}>{error || (selected ? `${selected.description} Threshold: ${selected.threshold}%.` : "Bind this authorized run to a standardized JEF behavior category. Benchmark prompts stay out of the dashboard.")}</small>
  </label>;
}
