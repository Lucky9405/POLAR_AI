import React from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock } from "../components/ui";

export default function DigitalTwinPage() {
  const { data, error, loading, refresh } = usePolling(() => api.digitalTwin(), 6000);

  if (loading && !data) return <LoadingBlock label="Rendering digital twin..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const n = data.nodes;
  const f = data.flows;

  const Node = ({ x, y, label, active, value, color }: any) => (
    <g transform={`translate(${x},${y})`}>
      <circle r="34" fill="#0f1a2c" stroke={active ? color : "#1c2a41"} strokeWidth="2.5"
        className={active ? "animate-pulse" : ""} />
      <text textAnchor="middle" y="-4" fill="#e2e8f0" fontSize="11" fontWeight="600">{label}</text>
      <text textAnchor="middle" y="12" fill={color} fontSize="12" fontWeight="700">{value}</text>
    </g>
  );

  const Flow = ({ x1, y1, x2, y2, active, color }: any) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? color : "#1c2a41"} strokeWidth={active ? 2.5 : 1}
      strokeDasharray={active ? "6 4" : "0"} />
  );

  return (
    <div className="space-y-4">
      <Panel title="Digital Twin — Software-Only 2D Energy Model">
        <svg viewBox="0 0 600 320" className="w-full h-[380px]">
          <Flow x1={110} y1={70} x2={300} y2={160} active={n.solar.active} color="#fbbf24" />
          <Flow x1={110} y1={250} x2={300} y2={160} active={n.wind.active} color="#38bdf8" />
          <Flow x1={490} y1={70} x2={300} y2={160} active={n.battery.charging === false} color="#34d399" />
          <Flow x1={300} y1={160} x2={490} y2={70} active={n.battery.charging} color="#34d399" />
          <Flow x1={490} y1={250} x2={300} y2={160} active={n.diesel.on} color="#f87171" />
          <Flow x1={300} y1={160} x2={300} y2={280} active={true} color="#a78bfa" />

          <Node x={90} y={70} label="SOLAR" value={`${n.solar.output_kw} kW`} active={n.solar.active} color="#fbbf24" />
          <Node x={90} y={250} label="WIND" value={`${n.wind.output_kw} kW`} active={n.wind.active} color="#38bdf8" />
          <Node x={300} y={160} label="BUS" value="STATION" active color="#22d3ee" />
          <Node x={510} y={70} label="BATTERY" value={`${n.battery.soc_pct}%`} active color="#34d399" />
          <Node x={510} y={250} label="DIESEL" value={n.diesel.on ? `${n.diesel.output_kw} kW` : "OFF"}
            active={n.diesel.on} color="#f87171" />
          <Node x={300} y={280} label="LOADS" value={`${(n.load.critical_kw + n.load.important_kw + n.load.flexible_kw).toFixed(0)} kW`}
            active color="#a78bfa" />
        </svg>
      </Panel>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="panel"><div className="text-polar-dim text-xs">Solar → Bus</div><div className="font-bold">{f.solar_to_bus} kW</div></div>
        <div className="panel"><div className="text-polar-dim text-xs">Wind → Bus</div><div className="font-bold">{f.wind_to_bus} kW</div></div>
        <div className="panel"><div className="text-polar-dim text-xs">Battery → Bus</div><div className="font-bold">{f.battery_to_bus} kW</div></div>
        <div className="panel"><div className="text-polar-dim text-xs">Diesel → Bus</div><div className="font-bold">{f.diesel_to_bus} kW</div></div>
      </div>
      <p className="text-xs text-polar-dim">Mode: <span className="font-semibold text-polar-text">{data.mode}</span> — all values are live-updated from the simulation/optimization engine, not static.</p>
    </div>
  );
}
