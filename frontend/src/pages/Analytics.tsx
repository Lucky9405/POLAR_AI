import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock } from "../components/ui";

export default function AnalyticsPage() {
  const { data: carbon, error, loading, refresh } = usePolling(() => api.carbon(), 20000);
  const { data: history } = usePolling(() => api.history(96), 20000);
  const { data: whatifHist } = usePolling(() => api.whatIfHistory(), 20000);

  if (loading && !carbon) return <LoadingBlock label="Aggregating analytics..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const dispatchData = (history?.history || []).filter((_: any, i: number) => i % 4 === 0).map((h: any) => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit" }),
    solar: h.solar_kw, wind: h.wind_kw, diesel: h.diesel_output_kw,
    battery: Math.max(0, -h.battery_power_kw),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel"><div className="text-xs text-polar-dim">Diesel Consumed</div><div className="text-xl font-bold">{carbon.diesel_consumed_l} L</div></div>
        <div className="panel"><div className="text-xs text-polar-dim">Fuel Saved</div><div className="text-xl font-bold text-polar-green">{carbon.fuel_saved_l} L</div></div>
        <div className="panel"><div className="text-xs text-polar-dim">CO₂ Emitted</div><div className="text-xl font-bold text-polar-amber">{carbon.co2_emitted_kg} kg</div></div>
        <div className="panel"><div className="text-xs text-polar-dim">CO₂ Avoided</div><div className="text-xl font-bold text-polar-green">{carbon.co2_avoided_kg} kg</div></div>
      </div>
      <Panel>
        <p className="text-xs text-polar-dim">{carbon.assumption_note}</p>
      </Panel>

      <Panel title="Dispatch Mix — Last 24h (Stacked)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dispatchData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2a41" />
            <XAxis dataKey="time" stroke="#7d8ba1" fontSize={11} />
            <YAxis stroke="#7d8ba1" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2a41" }} />
            <Legend />
            <Bar dataKey="solar" stackId="a" fill="#fbbf24" name="Solar" />
            <Bar dataKey="wind" stackId="a" fill="#38bdf8" name="Wind" />
            <Bar dataKey="battery" stackId="a" fill="#34d399" name="Battery Discharge" />
            <Bar dataKey="diesel" stackId="a" fill="#f87171" name="Diesel" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

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
