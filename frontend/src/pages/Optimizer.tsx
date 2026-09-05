import React from "react";
import { Zap, Battery, Fuel, ShieldAlert, Sun, Wind } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill, StatusStrip } from "../components/ui";
import { DecisionFlow } from "../components/DecisionFlow";

const LOAD_TIERS = ["critical", "essential", "flexible", "deferrable"] as const;

export default function OptimizerPage() {
  const { data: d, error, loading, refresh } = usePolling(() => api.dispatchState(), 8000);

  if (loading && !d) return <LoadingBlock label="Running dispatch optimization..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  async function toggleSurvival(activate: boolean) {
    await api.setSurvivalMode(activate);
    refresh();
  }

  const recommendedAction = d.diesel_on
    ? "Dispatch diesel as last-resort backup"
    : d.battery_state === "CHARGING"
    ? "Charge battery from renewable surplus"
    : d.battery_state === "DISCHARGING"
    ? "Discharge battery to cover renewable deficit"
    : d.battery_state === "RESERVE"
    ? "Hold battery at reserve — awaiting renewable recovery or diesel backup"
    : "Maintain current dispatch — no action needed";

  return (
    <div className="space-y-4">
      <StatusStrip items={[
        { label: "STATION", value: d.station },
        { label: "MODE", value: d.operating_mode },
        { label: "RESERVE TARGET", value: `${d.battery_reserve_target_pct}%` },
        { label: "STRATEGY", value: "RENEWABLE -> BATTERY -> DIESEL" },
      ]} />

      <Panel title="Current State">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
          <div><div className="text-xs text-polar-dim">DEMAND</div><div className="text-lg font-bold tabular-nums">{d.demand_kw} kW</div></div>
          <div><div className="text-xs text-polar-dim flex items-center gap-1"><Sun size={11}/>SOLAR</div><div className="text-lg font-bold tabular-nums text-polar-amber">{d.solar_kw} kW</div></div>
          <div><div className="text-xs text-polar-dim flex items-center gap-1"><Wind size={11}/>WIND</div><div className="text-lg font-bold tabular-nums text-polar-blue">{d.wind_kw} kW</div></div>
          <div><div className="text-xs text-polar-dim">BATTERY SOC</div><div className="text-lg font-bold tabular-nums text-polar-green">{d.battery_soc_pct}%</div></div>
          <div><div className="text-xs text-polar-dim">DIESEL</div><div className={`text-lg font-bold tabular-nums ${d.diesel_on ? "text-polar-amber" : "text-polar-dim"}`}>{d.diesel_on ? `${d.diesel_kw} kW` : "OFF"}</div></div>
        </div>
      </Panel>

      <Panel title="Recommended Dispatch" accent>
        <div className="text-lg font-semibold text-polar-cyan mb-3">{recommendedAction}</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="panel !bg-polar-bg">
            <div className="text-xs text-polar-dim font-mono">TARGET BATTERY ACTION</div>
            <div className="flex items-center gap-2 text-xl font-bold font-mono tabular-nums mt-1">
              <Battery className="text-polar-green" size={18} />
              {d.battery_power_kw >= 0 ? "+" : ""}{d.battery_power_kw} kW
            </div>
            <StatusPill status={d.battery_state} />
          </div>
          <div className="panel !bg-polar-bg">
            <div className="text-xs text-polar-dim font-mono">TARGET DIESEL ACTION</div>
            <div className="flex items-center gap-2 text-xl font-bold font-mono tabular-nums mt-1">
              <Fuel className="text-polar-amber" size={18} /> {d.diesel_kw} kW
            </div>
            <StatusPill status={d.diesel_on ? "RUNNING" : "STANDBY"} />
          </div>
          <div className="panel !bg-polar-bg">
            <div className="text-xs text-polar-dim font-mono">FLEXIBLE LOAD ACTION</div>
            <div className="flex items-center gap-2 text-xl font-bold font-mono mt-1">
              <Zap className="text-polar-blue" size={18} /> {d.loads.flexible.status}
            </div>
          </div>
          <div className="panel !bg-polar-bg">
            <div className="text-xs text-polar-dim font-mono">SURVIVAL MODE</div>
            <div className="flex items-center gap-2 mt-1">
              <ShieldAlert className={d.survival_mode ? "text-polar-red" : "text-polar-dim"} size={18} />
              <StatusPill status={d.operating_mode} />
            </div>
            <div className="flex gap-1 mt-2">
              <button onClick={() => toggleSurvival(true)}
                className="text-[10px] bg-polar-red/20 text-polar-red px-2 py-1 rounded font-semibold">
                ACTIVATE
              </button>
              <button onClick={() => toggleSurvival(false)}
                className="text-[10px] bg-polar-panel2 text-polar-dim px-2 py-1 rounded">
                DEACTIVATE
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <DecisionFlow path={d.decision_path} />

      <Panel title="Why This Action? — Explainable Factors">
        <p className="text-xs text-polar-dim mb-2 font-mono">
          // Deterministic, rule-based dispatch engine enforcing strict RENEWABLE → BATTERY → DIESEL priority.
          Every decision below traces to an explicit numeric condition — not a black box.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-mono">
          <span className="px-2 py-1 rounded border border-polar-border">Renewable {d.renewable_kw} kW</span>
          <span className="text-polar-dim">+</span>
          <span className="px-2 py-1 rounded border border-polar-border">Battery {d.battery_state}</span>
          <span className="text-polar-dim">+</span>
          <span className="px-2 py-1 rounded border border-polar-border">Demand {d.demand_kw} kW</span>
          <span className="text-polar-dim">=</span>
          <span className="px-2 py-1 rounded border border-polar-cyan text-polar-cyan">{recommendedAction}</span>
        </div>
        <ul className="space-y-2">
          {d.decision_reason.map((r: string, i: number) => (
            <li key={i} className="border-l-2 border-polar-cyan pl-3 py-1 text-sm">{r}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Load Priority Status">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LOAD_TIERS.map((tier) => {
            const l = d.loads[tier];
            return (
              <div key={tier} className="border border-polar-border rounded-lg p-3 text-center font-mono">
                <div className="text-xs text-polar-dim mb-1">{tier.toUpperCase()}</div>
                <StatusPill status={l.status} />
                <div className="text-sm mt-2 tabular-nums">{l.supplied_kw} kW</div>
                {l.curtailed_kw > 0 && <div className="text-xs text-polar-red">(-{l.curtailed_kw} kW)</div>}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
