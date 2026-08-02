import type { JEFEvaluation } from "./types";

/** Full, human-readable JEF evidence shared by Compose and the agent loop. */
export function JEFResult({ evaluation }: { evaluation: JEFEvaluation }) {
  if (evaluation.status !== "scored") {
    return <section className="v2-jef-result" role="status"><strong>JEF evaluation unavailable</strong><span>{evaluation.error || "The scorer did not return a result."}</span></section>;
  }
  const matches = evaluation.matches || [];
  const missing = evaluation.missing || [];
  return <section className={`v2-jef-result ${evaluation.triggered ? "triggered" : ""}`} role="status">
    <header><strong>JEF evaluation</strong><span>{evaluation.triggered ? "Threshold triggered" : "Below threshold"}</span></header>
    <dl className="v2-jef-metrics">
      <div><dt>Score</dt><dd>{Number(evaluation.score || 0).toFixed(2)}</dd></div>
      <div><dt>Percent</dt><dd>{Number(evaluation.percentage || 0).toFixed(2)}%</dd></div>
      <div><dt>Threshold</dt><dd>{evaluation.threshold}%</dd></div>
      {evaluation.total_possible_score !== undefined && <div><dt>Possible</dt><dd>{evaluation.total_possible_score}</dd></div>}
    </dl>
    <div className="v2-jef-criteria">
      <div><strong>Matched criteria · {matches.length}</strong>{matches.length ? <ul>{matches.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>None</p>}</div>
      <div><strong>Missing criteria · {missing.length}</strong>{missing.length ? <ul>{missing.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>None</p>}</div>
    </div>
  </section>;
}
