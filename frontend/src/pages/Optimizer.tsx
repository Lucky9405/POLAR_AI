import React from "react";
import { Zap, Battery, Fuel, ShieldAlert } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill } from "../components/ui";

export default function OptimizerPage() {
  const { data, error, loading, refresh } = usePolling(() => api.optimizerDecision(), 8000);
  const { data: tickData } = usePolling(() => api.currentEnergy(), 8000);

  if (loading && !data) return <LoadingBlock label="Running dispatch optimization..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  async function toggleSurvival(activate: boolean) {
    await api.setSurvivalMode(activate);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Panel title="Battery Command">
          <div className="flex items-center gap-2 text-2xl font-bold">
            <Battery className="text-polar-green" />
            {data.battery_command_kw >= 0 ? "+" : ""}{data.battery_command_kw} kW
          </div>
          <p className="text-xs text-polar-dim mt-1">{data.battery_command_kw >= 0 ? "Charging" : "Discharging"}</p>
        </Panel>
        <Panel title="Diesel Command">
          <div className="flex items-center gap-2 text-2xl font-bold">
            <Fuel className="text-polar-amber" /> {data.diesel_command_kw} kW
          </div>
        </Panel>
        <Panel title="Flexible Load Allowance">
          <div className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="text-polar-blue" /> {Math.round(data.flexible_load_target_frac * 100)}%
          </div>
        </Panel>
        <Panel title="Survival Mode">
          <div className="flex items-center gap-2">
            <ShieldAlert className={data.survival_mode ? "text-polar-red" : "text-polar-dim"} />
            <StatusPill status={data.survival_mode ? "SURVIVAL_MODE" : "NORMAL"} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => toggleSurvival(true)}
              className="text-xs bg-polar-red/20 text-polar-red px-3 py-1.5 rounded-lg font-semibold">
              Activate (Judge Control)
            </button>
            <button onClick={() => toggleSurvival(false)}
              className="text-xs bg-polar-panel2 text-polar-dim px-3 py-1.5 rounded-lg">
              Deactivate
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Explainable AI — Why This Decision">
        <p className="text-xs text-polar-dim mb-2">
          The optimizer is a deterministic, rule-based dispatch engine (not a black box). Every decision below traces
          to an explicit numeric condition in current station state.
        </p>
        <ul className="space-y-2">
          {data.reasons.map((r: string, i: number) => (
            <li key={i} className="border-l-2 border-polar-cyan pl-3 py-1 text-sm">{r}</li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-polar-border text-sm">
          Reserve target: <span className="font-semibold">{data.survival_reserve_target_pct}%</span>
        </div>
      </Panel>

      {tickData && (
        <Panel title="Load Priority Status">
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-polar-border rounded-lg p-3 text-center">
              <div className="text-xs text-polar-dim mb-1">CRITICAL</div>
              <div className="font-bold text-polar-green">Protected</div>
              <div className="text-sm mt-1">{tickData.load_critical_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3 text-center">
              <div className="text-xs text-polar-dim mb-1">IMPORTANT</div>
              <div className="font-bold text-polar-blue">Maintained</div>
              <div className="text-sm mt-1">{tickData.load_important_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3 text-center">
              <div className="text-xs text-polar-dim mb-1">FLEXIBLE</div>
              <div className={`font-bold ${tickData.flexible_curtailed_kw > 0 ? "text-polar-amber" : "text-polar-green"}`}>
                {tickData.flexible_curtailed_kw > 0 ? "Reduced" : "Maintained"}
              </div>
              <div className="text-sm mt-1">
                {tickData.load_flexible_kw} kW
                {tickData.flexible_curtailed_kw > 0 && (
                  <span className="text-polar-red"> (-{tickData.flexible_curtailed_kw} kW)</span>
                )}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
