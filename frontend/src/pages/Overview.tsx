import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sun, Wind, Battery, Fuel, Gauge, Zap, ShieldCheck, Bot, Waves,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, KpiCard, StatusPill, LoadingBlock, ErrorBlock, StatusStrip } from "../components/ui";
import { DecisionFlow } from "../components/DecisionFlow";
import { StrategyPanel } from "../components/StrategyPanel";
import { EnergyFlowDiagram } from "../components/EnergyFlowDiagram";
import { NodeInspectorDrawer } from "../components/NodeInspectorDrawer";
import { useChartColors } from "../components/useChartColors";

export default function Overview() {
  const cc = useChartColors();
  // dispatch_state is the SINGLE SOURCE OF TRUTH — every section below reads
  // from this one object instead of recomputing anything independently.
  const { data: dispatch, error, loading, refresh } = usePolling(() => api.dispatchState(), 8000);
  const { data: forecast24 } = usePolling(() => api.forecast(24), 30000);
  const { data: alertsData } = usePolling(() => api.alerts("OPEN"), 15000);
  const { data: equipment } = usePolling(() => api.equipmentHealth(), 30000);
  const [advisorQ, setAdvisorQ] = useState("");
  const [advisorMsgs, setAdvisorMsgs] = useState<{ role: string; text: string }[]>([
    { role: "ai", text: "Ask me anything about current energy status, storm readiness, or fuel savings." },
  ]);
  const [asking, setAsking] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);

  if (loading && !dispatch) return <LoadingBlock label="Connecting to POLAR-AI backend..." />;
  if (error) return <ErrorBlock message={`Could not load dispatch state: ${error}`} onRetry={refresh} />;

  const d = dispatch;
  const pq = d.power_quality;

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
    } catch {
      setAdvisorMsgs((m) => [...m, { role: "ai", text: "Sorry, I couldn't reach the advisor service." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-4">
      <StatusStrip items={[
        { label: "STATION", value: d.station },
        { label: "TICK", value: d.tick },
        { label: "MODE", value: d.operating_mode, accent: d.operating_mode === "SURVIVAL_MODE" ? "text-polar-red" : d.operating_mode === "NORMAL" ? "text-polar-green" : "text-polar-amber" },
        { label: "RISK", value: `${d.risk_score}/100`, accent: d.risk_level === "CRITICAL" ? "text-polar-red" : d.risk_level === "SAFE" ? "text-polar-green" : "text-polar-amber" },
        { label: "TIMESTAMP", value: new Date(d.timestamp).toLocaleString() },
      ]} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Zap size={20} />} label="Demand" value={d.demand_kw} unit="kW" />
        <KpiCard icon={<Sun size={20} />} label="Solar" value={d.solar_kw} unit="kW" accent="text-polar-amber" />
        <KpiCard icon={<Wind size={20} />} label="Wind" value={d.wind_kw} unit="kW" accent="text-polar-blue" />
        <KpiCard icon={<Battery size={20} />} label="Battery SOC" value={`${d.battery_soc_pct}%`}
          sub={d.battery_state} accent="text-polar-green" />
        <KpiCard icon={<Fuel size={20} />} label="Diesel" value={d.diesel_on ? "ON" : "OFF"}
          sub={d.diesel_on ? `${d.diesel_kw} kW (last resort)` : "Standby"}
          accent={d.diesel_on ? "text-polar-amber" : "text-polar-dim"} />
        <KpiCard icon={<Waves size={20} />} label="Renewable Share" value={`${d.renewable_share_pct}%`}
          sub={`Battery ${d.battery_contribution_pct}% · Diesel ${d.diesel_contribution_pct}%`} accent="text-polar-purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Energy flow driven by the same dispatch state — real diagram, not cards */}
        <Panel title="Live Energy Flow (Renewable → Battery → Diesel)" className="lg:col-span-2">
          <EnergyFlowDiagram d={d} onNodeClick={setInspecting} />
        </Panel>

        {/* Forecast chart */}
        <Panel title="AI Forecast (Next 24 Hours)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
              <XAxis dataKey="time" stroke={cc.axis} fontSize={11} />
              <YAxis stroke={cc.axis} fontSize={11} />
              <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
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

      <NodeInspectorDrawer node={inspecting} onClose={() => setInspecting(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DecisionFlow path={d.decision_path} />
        <StrategyPanel mode={d.operating_mode} strategy={d.strategy} reservePct={d.battery_reserve_target_pct} />
        <Panel title="Power Quality">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">{pq.voltage_v} V</span>
            <StatusPill status={pq.status} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-polar-dim">
            <div>Frequency<div className="text-polar-text font-semibold">{pq.frequency_hz} Hz</div></div>
            <div>THD<div className="text-polar-text font-semibold">{pq.thd_pct}%</div></div>
          </div>
          <Link to="/power-quality" className="text-xs text-polar-cyan mt-2 inline-block hover:underline">
            View full Power Quality page →
          </Link>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Energy Risk Score">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-polar-text">{d.risk_score}<span className="text-lg text-polar-dim">/100</span></div>
            <StatusPill status={d.risk_level} />
          </div>
          <p className="text-xs text-polar-dim mt-2">Fuel autonomy: {d.fuel_autonomy_days} days</p>
        </Panel>

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

      <Panel title="Why This Decision (Explainable AI)">
        <ul className="space-y-2 text-sm">
          {d.decision_reason.slice(0, 5).map((r: string, i: number) => (
            <li key={i} className="flex gap-2"><Gauge size={14} className="text-polar-cyan shrink-0 mt-0.5" />{r}</li>
          ))}
        </ul>
      </Panel>

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
