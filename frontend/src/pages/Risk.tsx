import React, { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill, StatusStrip } from "../components/ui";
import { CloudLightning } from "lucide-react";

const STAGES = ["NORMAL", "WATCH", "STORM_PREPARATION", "SURVIVAL_MODE", "RECOVERY"];

export default function RiskPage() {
  const { data: risk, error, loading, refresh } = usePolling(() => api.risk(), 8000);
  const { data: autonomy } = usePolling(() => api.fuelAutonomy(), 15000);
  const { data: dispatch } = usePolling(() => api.dispatchState(), 8000);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  if (loading && !risk) return <LoadingBlock label="Computing energy risk score..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  async function launchStorm() {
    setLaunching(true);
    try {
      await api.launchStorm(8);
      setLaunched(true);
    } finally {
      setLaunching(false);
    }
  }

  const currentStageIdx = STAGES.indexOf(dispatch?.operating_mode || "NORMAL");

  return (
    <div className="space-y-4">
      {dispatch && (
        <StatusStrip items={[
          { label: "STATION", value: dispatch.station },
          { label: "MODE", value: dispatch.operating_mode },
          { label: "RISK", value: `${dispatch.risk_score}/100` },
        ]} />
      )}

      <Panel title="Storm Progression — NORMAL → WATCH → PREPARATION → SURVIVAL → RECOVERY">
        <div className="flex items-center gap-1 mb-3 font-mono text-xs">
          {STAGES.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`px-2 py-1.5 rounded border text-center flex-1 ${
                i === currentStageIdx ? "border-polar-cyan bg-polar-cyan/10 text-polar-cyan font-bold" :
                i < currentStageIdx ? "border-polar-border text-polar-dim" : "border-polar-border text-polar-dim opacity-50"
              }`}>{s.replace(/_/g, " ")}</div>
              {i < STAGES.length - 1 && <span className="text-polar-dim">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-sm text-polar-dim mb-3">
          Launches a scripted storm ~2 hours (8 ticks) ahead. Watch storm probability rise, Polar Survival Mode
          activate, flexible/deferrable loads reduce, and diesel back up the battery as renewables fall — then
          a gradual RECOVERY back to NORMAL.
        </p>
        <button onClick={launchStorm} disabled={launching}
          className="flex items-center gap-2 bg-polar-red/20 text-polar-red font-semibold px-4 py-2 rounded text-sm disabled:opacity-50">
          <CloudLightning size={16} /> {launching ? "Launching..." : "Launch Storm Scenario"}
        </button>
        {launched && <p className="text-xs text-polar-green mt-2">Scenario scheduled — keep the simulation running (Command Center ▶) to watch it unfold.</p>}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Energy Risk Score">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-5xl font-bold font-mono tabular-nums">{risk.score}<span className="text-lg text-polar-dim">/100</span></div>
            <StatusPill status={risk.level} />
          </div>
          <div className="space-y-2">
            {Object.entries(risk.factors).map(([k, v]: any) => (
              <div key={k}>
                <div className="flex justify-between text-xs text-polar-dim mb-0.5 font-mono">
                  <span className="capitalize">{k.replace(/_/g, " ")}</span><span>{v}%</span>
                </div>
                <div className="h-1.5 bg-polar-panel2 rounded-full overflow-hidden">
                  <div className="h-full bg-polar-cyan rounded-full" style={{ width: `${Math.min(100, v)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Contributing Factors — Explainable">
          <ul className="space-y-2 text-sm">
            {risk.explanation.map((e: string, i: number) => <li key={i} className="border-l-2 border-polar-cyan pl-3">{e}</li>)}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {autonomy && (
          <Panel title="Fuel Autonomy">
            <div className="text-3xl font-bold text-polar-green font-mono tabular-nums">{autonomy.days} days</div>
            <p className="text-xs text-polar-dim mt-1">Range: {autonomy.autonomy_range_low_days}–{autonomy.autonomy_range_high_days} days</p>
          </Panel>
        )}
        {dispatch && (
          <Panel title="Battery Reserve">
            <div className="text-3xl font-bold text-polar-cyan font-mono tabular-nums">{dispatch.battery_soc_pct}%</div>
            <p className="text-xs text-polar-dim mt-1">Reserve target: {dispatch.battery_reserve_target_pct}% ({dispatch.battery_state})</p>
          </Panel>
        )}
        {dispatch && (
          <Panel title="Mitigation Actions">
            <ul className="text-xs text-polar-dim space-y-1">
              {dispatch.decision_reason.slice(0, 3).map((r: string, i: number) => <li key={i}>• {r}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
