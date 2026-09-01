import React, { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill } from "../components/ui";
import { CloudLightning } from "lucide-react";

export default function RiskPage() {
  const { data: risk, error, loading, refresh } = usePolling(() => api.risk(), 8000);
  const { data: autonomy } = usePolling(() => api.fuelAutonomy(), 15000);
  const { data: opt } = usePolling(() => api.optimizerDecision(), 8000);
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

  return (
    <div className="space-y-4">
      <Panel title="APPROACHING POLAR STORM — Demo Scenario">
        <p className="text-sm text-polar-dim mb-3">
          Launches a scripted storm ~2 hours (8 ticks) ahead. Watch storm probability rise, Polar Survival Mode
          activate, flexible loads reduce, and diesel back up the battery as renewables fall — then recover.
        </p>
        <button onClick={launchStorm} disabled={launching}
          className="flex items-center gap-2 bg-polar-red/20 text-polar-red font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
          <CloudLightning size={16} /> {launching ? "Launching..." : "Launch Storm Scenario"}
        </button>
        {launched && <p className="text-xs text-polar-green mt-2">Scenario scheduled — keep the simulation running (Overview/Header ▶) to watch it unfold.</p>}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Energy Risk Score">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-5xl font-bold">{risk.score}<span className="text-lg text-polar-dim">/100</span></div>
            <StatusPill status={risk.level} />
          </div>
          <div className="space-y-2">
            {Object.entries(risk.factors).map(([k, v]: any) => (
              <div key={k}>
                <div className="flex justify-between text-xs text-polar-dim mb-0.5">
                  <span className="capitalize">{k.replace(/_/g, " ")}</span><span>{v}%</span>
                </div>
                <div className="h-1.5 bg-polar-panel2 rounded-full overflow-hidden">
                  <div className="h-full bg-polar-cyan rounded-full" style={{ width: `${Math.min(100, v)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Risk Explanation">
          <ul className="space-y-2 text-sm">
            {risk.explanation.map((e: string, i: number) => <li key={i} className="border-l-2 border-polar-cyan pl-3">{e}</li>)}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {autonomy && (
          <Panel title="Fuel Autonomy">
            <div className="text-3xl font-bold text-polar-green">{autonomy.days} days</div>
            <p className="text-xs text-polar-dim mt-1">Range: {autonomy.autonomy_range_low_days}–{autonomy.autonomy_range_high_days} days</p>
          </Panel>
        )}
        {opt && (
          <Panel title="Current System Mode">
            <StatusPill status={opt.survival_mode ? "SURVIVAL_MODE" : "NORMAL"} />
            <ul className="mt-2 space-y-1 text-xs text-polar-dim">
              {opt.reasons.slice(0, 3).map((r: string, i: number) => <li key={i}>• {r}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
