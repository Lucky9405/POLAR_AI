import React, { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock } from "../components/ui";
import { useChartColors } from "../components/useChartColors";

const RANGES = ["24h", "7d", "30d"] as const;
const STATIONS = ["ACTIVE", "MAITRI", "BHARATI", "BOTH"] as const;

export default function AnalyticsPage() {
  const cc = useChartColors();
  const [range, setRange] = useState<typeof RANGES[number]>("24h");
  const [stationFilter, setStationFilter] = useState<typeof STATIONS[number]>("ACTIVE");
  const stationParam = stationFilter === "ACTIVE" ? undefined : stationFilter;

  const { data: carbon, error, loading, refresh } = usePolling(() => api.carbon(range, stationParam), 20000, [range, stationFilter]);
  const { data: history } = usePolling(() => api.history(672, range, stationParam), 20000, [range, stationFilter]);
  const { data: whatifHist } = usePolling(() => api.whatIfHistory(), 20000);

  if (loading && !carbon) return <LoadingBlock label="Aggregating analytics from dispatch history..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const isBoth = stationFilter === "BOTH";
  const rows = isBoth ? [] : (history?.history || []);
  const step = range === "24h" ? 4 : range === "7d" ? 24 : 24;
  const dispatchData = rows.filter((_: any, i: number) => i % step === 0).map((h: any) => ({
    time: range === "24h" ? new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit" })
                          : new Date(h.timestamp).toLocaleDateString([], { month: "short", day: "numeric" }),
    solar: h.solar_kw, wind: h.wind_kw, diesel: h.diesel_output_kw,
    battery: Math.max(0, -h.battery_power_kw),
  }));

  const carbonEntries = isBoth ? Object.entries(carbon || {}) : [["ACTIVE", carbon]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm uppercase ${range === r ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {STATIONS.map((s) => (
            <button key={s} onClick={() => setStationFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm ${stationFilter === s ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
              {s === "ACTIVE" ? "Current Station" : s}
            </button>
          ))}
        </div>
      </div>

      {carbon?.note && <p className="text-xs text-polar-amber">{carbon.note}</p>}

      {carbonEntries.map(([code, c]: any) => c && (
        <div key={code} className="space-y-3">
          {isBoth && <h3 className="text-sm font-semibold text-polar-cyan">{code}</h3>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="panel"><div className="text-xs text-polar-dim">Renewable Share</div><div className="text-xl font-bold text-polar-green">{c.renewable_pct}%</div></div>
            <div className="panel"><div className="text-xs text-polar-dim">Diesel Consumed</div><div className="text-xl font-bold">{c.diesel_consumed_l} L</div></div>
            <div className="panel"><div className="text-xs text-polar-dim">CO₂ Emitted</div><div className="text-xl font-bold text-polar-amber">{c.co2_emitted_kg} kg</div></div>
            <div className="panel"><div className="text-xs text-polar-dim">CO₂ Avoided</div><div className="text-xl font-bold text-polar-green">{c.co2_avoided_kg} kg</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="panel"><div className="text-xs text-polar-dim">Dispatch Strategy</div><div className="font-semibold">{c.dispatch_strategy}</div></div>
            <div className="panel"><div className="text-xs text-polar-dim">Diesel Required</div><div className="font-semibold">{c.diesel_required_pct_of_ticks}% of ticks in range</div></div>
          </div>
        </div>
      ))}

      <Panel>
        <p className="text-xs text-polar-dim">{isBoth ? carbon?.MAITRI?.assumption_note : carbon?.assumption_note}</p>
      </Panel>

      {!isBoth && carbon && (
        <Panel title="Minimize Diesel Use — Baseline vs. POLAR-AI (Simulated / Model-Derived)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { name: "Diesel-only baseline", fuel: carbon.baseline_diesel_only_l },
                { name: "POLAR-AI (actual)", fuel: carbon.diesel_consumed_l },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                <XAxis dataKey="name" stroke={cc.axis} fontSize={11} />
                <YAxis stroke={cc.axis} fontSize={11} label={{ value: "Litres", angle: -90, position: "insideLeft", fill: cc.axis }} />
                <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
                <Bar dataKey="fuel" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-polar-border pb-1">
                <span className="text-polar-dim">Baseline (diesel-only, no renewables/battery)</span>
                <span className="font-semibold">{carbon.baseline_diesel_only_l} L</span>
              </div>
              <div className="flex justify-between border-b border-polar-border pb-1">
                <span className="text-polar-dim">POLAR-AI actual diesel used</span>
                <span className="font-semibold">{carbon.diesel_consumed_l} L</span>
              </div>
              <div className="flex justify-between border-b border-polar-border pb-1">
                <span className="text-polar-dim">Fuel saved</span>
                <span className="font-semibold text-polar-green">{carbon.fuel_saved_l} L</span>
              </div>
              <div className="flex justify-between border-b border-polar-border pb-1">
                <span className="text-polar-dim">Diesel runtime this range</span>
                <span className="font-semibold">{carbon.diesel_required_pct_of_ticks}% of ticks</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-polar-dim">Diesel reduction vs. baseline</span>
                <span className={`text-xl font-bold ${carbon.diesel_reduction_pct > 0 ? "text-polar-green" : "text-polar-dim"}`}>
                  {carbon.diesel_reduction_pct}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-polar-dim mt-3">
            "Baseline" is computed from this same dataset — the fuel a diesel-only station (no solar/wind/
            battery) would have burned to serve the identical load over this window. This figure is
            SIMULATED/MODEL-DERIVED, calculated from actual telemetry, not a hardcoded marketing claim.
          </p>
        </Panel>
      )}

      {!isBoth && (
        <Panel title={`Dispatch Mix — ${range.toUpperCase()} (from actual dispatch history)`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dispatchData}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
              <XAxis dataKey="time" stroke={cc.axis} fontSize={11} />
              <YAxis stroke={cc.axis} fontSize={11} />
              <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
              <Legend />
              <Bar dataKey="solar" stackId="a" fill="#fbbf24" name="Solar" />
              <Bar dataKey="wind" stackId="a" fill="#38bdf8" name="Wind" />
              <Bar dataKey="battery" stackId="a" fill="#34d399" name="Battery Discharge" />
              <Bar dataKey="diesel" stackId="a" fill="#f87171" name="Diesel (last resort)" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-polar-dim mt-2">
            Diesel only appears here in ticks where the dispatch engine actually required it — it is not a
            constant baseline.
          </p>
        </Panel>
      )}

      <Panel title="What-If Scenario History">
        {(!whatifHist || whatifHist.history.length === 0) && (
          <p className="text-sm text-polar-dim">No scenarios run yet — try the What-If Simulator page.</p>
        )}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {whatifHist?.history.map((w: any) => {
            const output = JSON.parse(w.output_json);
            const input = JSON.parse(w.input_json);
            return (
              <div key={w.id} className="border border-polar-border rounded-lg p-2 text-xs flex justify-between items-center">
                <span>Solar {input.solar_pct_change}% · Wind {input.wind_pct_change}% · Load {input.load_pct_change}%</span>
                <span className="text-polar-dim">{new Date(w.created_at).toLocaleString()}</span>
                <span className={output.critical_load_status === "SAFE" ? "text-polar-green" : "text-polar-red"}>{output.critical_load_status}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
