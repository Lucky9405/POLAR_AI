import React, { useState } from "react";
import {
  Sun, Wind, Battery, Fuel, Gauge, Activity, Zap, ShieldCheck, Bot,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, KpiCard, StatusPill, LoadingBlock, ErrorBlock } from "../components/ui";

export default function Overview() {
  const { data: status, error, loading, refresh } = usePolling(() => api.status(), 8000);
  const { data: forecast24 } = usePolling(() => api.forecast(24), 30000);
  const { data: alertsData } = usePolling(() => api.alerts("OPEN"), 15000);
  const { data: autonomy } = usePolling(() => api.fuelAutonomy(), 20000);
  const { data: carbon } = usePolling(() => api.carbon(), 20000);
  const { data: equipment } = usePolling(() => api.equipmentHealth(), 30000);
  const [advisorQ, setAdvisorQ] = useState("");
  const [advisorMsgs, setAdvisorMsgs] = useState<{ role: string; text: string }[]>([
    { role: "ai", text: "Ask me anything about current energy status, storm readiness, or fuel savings." },
  ]);
  const [asking, setAsking] = useState(false);

  if (loading && !status) return <LoadingBlock label="Connecting to POLAR-AI backend..." />;
  if (error) return <ErrorBlock message={`Could not load station status: ${error}`} onRetry={refresh} />;

  const tick = status.tick;
  const risk = status.risk;
  const opt = status.optimizer;

  const forecastChartData = forecast24
    ? forecast24.load.timestamps.map((ts: string, i: number) => ({
        time: new Date(ts).toLocaleTimeString([], { hour: "2-digit" }),
        load: forecast24.load.values[i],
        solar: forecast24.solar.values[i],
        wind: forecast24.wind.values[i],
      }))
    : [];

  async function askAdvisor() {
    if (!advisorQ.trim()) return;
    const q = advisorQ;
    setAdvisorMsgs((m) => [...m, { role: "user", text: q }]);
    setAdvisorQ("");
    setAsking(true);
    try {
      const res = await api.askAdvisor(q);
      setAdvisorMsgs((m) => [...m, { role: "ai", text: res.answer }]);
    } catch (e: any) {
      setAdvisorMsgs((m) => [...m, { role: "ai", text: "Sorry, I couldn't reach the advisor service." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Zap size={20} />} label="Total Load" value={tick.load_total_kw} unit="kW" />
        <KpiCard icon={<Sun size={20} />} label="Solar" value={tick.solar_kw} unit="kW" accent="text-polar-amber" />
        <KpiCard icon={<Wind size={20} />} label="Wind" value={tick.wind_kw} unit="kW" accent="text-polar-blue" />
        <KpiCard icon={<Battery size={20} />} label="Battery SOC" value={`${tick.battery_soc_pct}%`}
          sub={tick.battery_power_kw >= 0 ? "Charging" : "Discharging"} accent="text-polar-green" />
        <KpiCard icon={<Activity size={20} />} label="Diesel" value={tick.diesel_on ? "ON" : "OFF"}
          sub={tick.diesel_on ? `${tick.diesel_output_kw} kW` : "Standby"}
          accent={tick.diesel_on ? "text-polar-amber" : "text-polar-dim"} />
        <KpiCard icon={<Fuel size={20} />} label="Fuel Level" value={tick.diesel_fuel_liters} unit="L"
          sub={autonomy ? `Est. ${autonomy.days} days` : ""} accent="text-polar-purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Energy flow */}
        <Panel title="Energy Flow (Live)" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">SOLAR</div>
              <div className="text-lg font-bold text-polar-amber">{tick.solar_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">CRITICAL LOADS</div>
              <div className="text-lg font-bold">{tick.load_critical_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">WIND</div>
              <div className="text-lg font-bold text-polar-blue">{tick.wind_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">IMPORTANT LOADS</div>
              <div className="text-lg font-bold">{tick.load_important_kw} kW</div>
            </div>
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">BATTERY</div>
              <div className="text-lg font-bold text-polar-green">
                {tick.battery_soc_pct}% ({tick.battery_power_kw >= 0 ? "+" : ""}{tick.battery_power_kw} kW)
              </div>
            </div>
            <div className="border border-polar-border rounded-lg p-3">
              <div className="text-polar-dim text-xs mb-1">FLEXIBLE LOADS</div>
              <div className="text-lg font-bold">{tick.load_flexible_kw} kW
                {tick.flexible_curtailed_kw > 0 && (
                  <span className="text-xs text-polar-red ml-1">(-{tick.flexible_curtailed_kw} curtailed)</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 border border-polar-border rounded-lg p-3 flex items-center justify-between">
            <span className="text-polar-dim text-xs">DIESEL GENERATOR</span>
            <span className={`font-bold ${tick.diesel_on ? "text-polar-amber" : "text-polar-dim"}`}>
              {tick.diesel_on ? `ON — ${tick.diesel_output_kw} kW` : "OFF"}
            </span>
          </div>
        </Panel>

        {/* Forecast chart */}
        <Panel title="AI Forecast (Next 24 Hours)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c2a41" />
              <XAxis dataKey="time" stroke="#7d8ba1" fontSize={11} />
              <YAxis stroke="#7d8ba1" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2a41" }} />
              <Legend />
              <Line type="monotone" dataKey="load" stroke="#38bdf8" name="Load Forecast" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="solar" stroke="#fbbf24" name="Solar Forecast" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="wind" stroke="#34d399" name="Wind Forecast" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          {forecast24 && (
            <p className="text-[11px] text-polar-dim mt-1">
              Model MAE: load ±{forecast24.load.mae} kW · solar ±{forecast24.solar.mae} kW · wind ±{forecast24.wind.mae} kW
            </p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk gauge */}
        <Panel title="Energy Risk Score">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-polar-text">{risk.score}<span className="text-lg text-polar-dim">/100</span></div>
            <StatusPill status={risk.level} />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-polar-dim">
            {risk.explanation.slice(0, 4).map((e: string, i: number) => <li key={i}>• {e}</li>)}
          </ul>
        </Panel>

        {/* Alerts */}
        <Panel title="Alerts Panel">
          {alertsData && alertsData.alerts.length === 0 && (
            <p className="text-sm text-polar-dim">No open alerts.</p>
          )}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {alertsData?.alerts.slice(0, 5).map((a: any) => (
              <div key={a.id} className="border-l-2 border-polar-red pl-2">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {a.title} <StatusPill status={a.severity} />
                </div>
                <div className="text-xs text-polar-dim">{a.description}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* System health summary */}
        <Panel title="System Health">
          <div className="space-y-1.5">
            {equipment?.equipment.map((e: any) => (
              <div key={e.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-polar-dim" />{e.name}</span>
                <StatusPill status={e.status} />
              </div>
            ))}
          </div>
          {equipment && (
            <div className="mt-2 pt-2 border-t border-polar-border flex justify-between text-sm font-semibold">
              Overall <StatusPill status={equipment.overall} />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Fuel Autonomy Predictor">
          {autonomy && (
            <>
              <div className="text-3xl font-bold text-polar-green">{autonomy.days} <span className="text-sm text-polar-dim">days</span></div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-polar-dim">
                <div>Fuel in Tank<div className="text-polar-text font-semibold">{autonomy.fuel_in_tank_l} L</div></div>
                <div>Daily Use (pred.)<div className="text-polar-text font-semibold">{autonomy.predicted_daily_consumption_l} L</div></div>
                <div className="col-span-2">Range<div className="text-polar-text font-semibold">
                  {autonomy.autonomy_range_low_days}–{autonomy.autonomy_range_high_days} days
                </div></div>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Carbon Impact (Cumulative — Simulated)">
          {carbon && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-polar-dim text-xs block">Renewable Share</span>
                <span className="font-bold text-polar-green">{carbon.renewable_pct}%</span></div>
              <div><span className="text-polar-dim text-xs block">Fuel Saved</span>
                <span className="font-bold">{carbon.fuel_saved_l} L</span></div>
              <div><span className="text-polar-dim text-xs block">CO₂ Avoided</span>
                <span className="font-bold text-polar-green">{carbon.co2_avoided_kg} kg</span></div>
              <div><span className="text-polar-dim text-xs block">CO₂ Emitted</span>
                <span className="font-bold text-polar-amber">{carbon.co2_emitted_kg} kg</span></div>
            </div>
          )}
        </Panel>

        <Panel title="AI Recommendations">
          <ul className="space-y-2 text-sm">
            {opt.reasons.slice(0, 4).map((r: string, i: number) => (
              <li key={i} className="flex gap-2"><Gauge size={14} className="text-polar-cyan shrink-0 mt-0.5" />{r}</li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* AI Advisor */}
      <Panel title="AI Energy Advisor (Ask Me Anything)">
        <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
          {advisorMsgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex items-start gap-2 max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                {m.role === "ai" && <Bot size={16} className="text-polar-cyan mt-1 shrink-0" />}
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-polar-cyan text-black" : "bg-polar-panel2 text-polar-text"
                }`}>{m.text}</div>
              </div>
            </div>
          ))}
          {asking && <div className="text-xs text-polar-dim">Thinking...</div>}
        </div>
        <div className="flex gap-2">
          <input
            value={advisorQ}
            onChange={(e) => setAdvisorQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askAdvisor()}
            placeholder="Ask a question... e.g. Why is diesel ON?"
            className="flex-1 bg-polar-panel2 border border-polar-border rounded-lg px-3 py-2 text-sm outline-none focus:border-polar-cyan"
          />
          <button onClick={askAdvisor} className="bg-polar-cyan text-black font-semibold rounded-lg px-4 py-2 text-sm">
            Ask
          </button>
        </div>
      </Panel>
    </div>
  );
}
