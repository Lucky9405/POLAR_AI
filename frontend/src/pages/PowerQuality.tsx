import React, { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusPill, StatusStrip } from "../components/ui";
import { useChartColors } from "../components/useChartColors";
import { NodeInspectorDrawer } from "../components/NodeInspectorDrawer";

const RANGES = ["6h", "24h", "7d", "30d"] as const;
const TABS = [
  { key: "voltage_v", label: "Voltage", unit: "V" },
  { key: "frequency_hz", label: "Frequency", unit: "Hz" },
  { key: "power_factor", label: "Power Factor", unit: "" },
  { key: "thd_pct", label: "THD", unit: "%" },
  { key: "voltage_unbalance_pct", label: "Voltage Unbalance", unit: "%" },
] as const;

const SOURCES = ["bus", "solar", "wind", "battery", "diesel"] as const;

export default function PowerQualityPage() {
  const [range, setRange] = useState<typeof RANGES[number]>("24h");
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("voltage_v");
  const [inspecting, setInspecting] = useState<string | null>(null);
  const cc = useChartColors();

  const { data: current, error, loading, refresh } = usePolling(() => api.powerQuality(), 8000);
  const { data: dispatch } = usePolling(() => api.dispatchState(), 15000);
  const { data: history } = usePolling(() => api.powerQualityHistory(range), 15000, [range]);
  const { data: events } = usePolling(() => api.powerQualityEvents("7d"), 20000);
  const { data: sources } = usePolling(() => api.powerQualitySources(), 10000);

  if (loading && !current) return <LoadingBlock label="Computing power quality metrics..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const chartData = (history?.series || []).map((p: any) => ({
    time: new Date(p.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }),
    value: p[tab],
  }));

  return (
    <div className="space-y-4">
      {dispatch && (
        <StatusStrip items={[
          { label: "STATION", value: dispatch.station },
          { label: "PQ STATUS", value: current.status },
          { label: "PROVENANCE", value: current.provenance },
        ]} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Panel title="Overall Power Quality Health">
          <div className="flex items-center gap-3">
            <StatusPill status={current.status} />
            <span className="text-xs text-polar-dim">Last update: {new Date().toLocaleTimeString()}</span>
          </div>
          <p className="text-[10px] text-polar-dim mt-2">
            Provenance: {current.provenance} — simulated/derived, not measured NCPOR electrical telemetry.
          </p>
        </Panel>
        {[
          ["Voltage", `${current.voltage_v} V`],
          ["Frequency", `${current.frequency_hz} Hz`],
          ["Power Factor", current.power_factor],
        ].map(([label, val]) => (
          <div key={label} className="panel">
            <div className="text-xs text-polar-dim">{label}</div>
            <div className="text-xl font-bold">{val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["THD", `${current.thd_pct}%`],
          ["Voltage Unbalance", `${current.voltage_unbalance_pct}%`],
          ["Active Power", `${current.active_power_kw} kW`],
          ["Reactive Power", `${current.reactive_power_kvar} kVAR`],
          ["Apparent Power", `${current.apparent_power_kva} kVA`],
        ].map(([label, val]) => (
          <div key={label} className="panel">
            <div className="text-xs text-polar-dim">{label}</div>
            <div className="text-lg font-bold">{val}</div>
          </div>
        ))}
      </div>

      <Panel title="Power Quality Trend">
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 rounded text-xs ${tab === t.key ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded text-xs uppercase ${range === r ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {history?.note && <p className="text-xs text-polar-amber mb-2">{history.note}</p>}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
            <XAxis dataKey="time" stroke={cc.axis} fontSize={10} />
            <YAxis stroke={cc.axis} fontSize={11} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
            <Line type="monotone" dataKey="value" stroke="#22d3ee" dot={false} strokeWidth={2}
              name={TABS.find((t) => t.key === tab)?.label} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Power Quality by Source (click for details)">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SOURCES.map((s) => {
            const src = sources?.[s];
            if (!src) return null;
            return (
              <button key={s} onClick={() => setInspecting(s)}
                className="border border-polar-border rounded-lg p-3 text-left hover:border-polar-cyan transition-colors">
                <div className="text-xs text-polar-dim uppercase mb-1">{s}</div>
                <StatusPill status={src.quality || src.status || "NORMAL"} />
                <div className="text-[10px] text-polar-dim mt-1">{src.provenance}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="AI Power Quality Assessment">
        <p className="text-sm mb-2">
          Current assessment: <StatusPill status={current.status} /> — station bus power quality is{" "}
          {current.status === "NORMAL" ? "within normal operating bounds" : current.status === "WARNING" ? "showing early deviation" : "outside safe bounds"}.
        </p>
        <ul className="text-xs text-polar-dim space-y-1">
          <li>• Voltage stability: {Math.abs(current.voltage_v - 415) < 12 ? "stable" : "deviating from nominal 415V"}</li>
          <li>• Frequency stability: {Math.abs(current.frequency_hz - 50) < 0.2 ? "stable" : "deviating from nominal 50Hz"}</li>
          <li>• Load variation: derived from current dispatch active power ({current.active_power_kw} kW)</li>
          <li>• Renewable intermittency contribution to THD: {current.thd_pct}%</li>
        </ul>
        <p className="text-sm mt-2 text-polar-cyan">
          Recommendation: {current.status === "NORMAL"
            ? "No action needed — continue normal dispatch."
            : "Review inverter/generator loading — consider rebalancing dispatch to reduce THD/voltage deviation."}
        </p>
      </Panel>

      <Panel title="Power Quality Events (last 7 days, derived from telemetry)">
        {(!events || events.events.length === 0) && <p className="text-sm text-polar-dim">No threshold-crossing events in this window.</p>}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events?.events.map((e: any, i: number) => (
            <div key={i} className="border-l-2 border-polar-amber pl-3 py-1 text-xs flex justify-between">
              <span>{e.source} · {e.parameter} = {e.value}</span>
              <div className="flex items-center gap-2">
                <StatusPill status={e.severity} />
                <StatusPill status={e.state} />
                <span className="text-polar-dim">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <NodeInspectorDrawer node={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}
