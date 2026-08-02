import { useEffect, useMemo, useState } from "react";
import { v2Api } from "./api";
import type { JEFBehavior } from "./types";

export function JEFBehaviorPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [behaviors, setBehaviors] = useState<JEFBehavior[]>([]);
  useEffect(() => { v2Api.jefBehaviors().then(setBehaviors).catch(() => setBehaviors([])); }, []);
  const selected = useMemo(() => behaviors.find((item) => item.id === value), [behaviors, value]);
  return <label className="v2-field">
    <span>JEF behavior</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      <option value="">Custom / no JEF behavior</option>
      {behaviors.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.category}{item.deprecated ? " · legacy" : ""}</option>)}
    </select>
    <small>{selected ? `${selected.description} Threshold: ${selected.threshold}%.` : "Bind this authorized run to a standardized JEF behavior category. Benchmark prompts stay out of the dashboard."}</small>
  </label>;
}
