import React from "react";
import { useChartColors } from "./useChartColors";

/**
 * Live Energy Flow — a real data-driven diagram, not decorative. Layout:
 *
 *   Solar ─┐
 *   Wind ──┼──> Energy Bus ──> Critical
 *   Battery ─┘               ├> Essential
 *   Diesel (only if ON) ─┘   ├> Flexible
 *                            └> Deferrable
 *
 * Diesel only connects to the bus when it is actually dispatched (diesel_on).
 * Every value shown comes directly from the single dispatch_state object —
 * nothing here is computed independently of the backend.
 */
export function EnergyFlowDiagram({ d, onNodeClick }: { d: any; onNodeClick: (node: string) => void }) {
  const cc = useChartColors();
  const solarActive = d.solar_kw > 0.1;
  const windActive = d.wind_kw > 0.1;
  const batteryDischarging = d.battery_state === "DISCHARGING";
  const batteryCharging = d.battery_state === "CHARGING";
  const dieselActive = d.diesel_on && d.diesel_kw > 0.1;
  const loads = d.loads;

  // Left column (sources) x=50, right column (loads) x=590, bus at x=320
  const SRC_X = 50, BUS_X = 320, LOAD_X = 590;
  const Y = { solar: 35, wind: 105, battery: 175, diesel: 245 };
  const LY = { critical: 35, essential: 105, flexible: 175, deferrable: 245 };

  const Flow = ({ path, active, color }: { path: string; active: boolean; color: string }) => (
    <path d={path} fill="none" stroke={active ? color : cc.grid} strokeWidth={active ? 2.5 : 1.5}
      strokeDasharray={active ? "6 4" : undefined} strokeLinecap="round">
      {active && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />}
    </path>
  );

  const SourceNode = ({ id, y, label, value, active, color }: any) => (
    <g transform={`translate(${SRC_X},${y})`} onClick={() => onNodeClick(id)} style={{ cursor: "pointer" }}>
      <rect x={-46} y={-18} width={92} height={36} rx={8} fill={cc.panelFill} stroke={active ? color : cc.grid} strokeWidth={2} />
      <text textAnchor="middle" y={-3} fill={cc.text} fontSize="10" fontWeight="600">{label}</text>
      <text textAnchor="middle" y={11} fill={active ? color : "#7d8ba1"} fontSize="11" fontWeight="700">{value}</text>
    </g>
  );

  const LoadNode = ({ id, y, label, l }: any) => (
    <g transform={`translate(${LOAD_X},${y})`} onClick={() => onNodeClick(id)} style={{ cursor: "pointer" }}>
      <rect x={-52} y={-16} width={104} height={32} rx={7}
        fill={cc.panelFill} stroke={l.status === "PROTECTED" ? "#34d399" : l.curtailed_kw > 0 ? "#f87171" : "#a78bfa"} strokeWidth={1.5} />
      <text textAnchor="middle" y={-2} fill={cc.text} fontSize="9.5" fontWeight="600">{label}</text>
      <text textAnchor="middle" y={11} fill="#a78bfa" fontSize="10.5" fontWeight="700">
        {l.supplied_kw} kW{l.curtailed_kw > 0 ? ` (-${l.curtailed_kw})` : ""}
      </text>
    </g>
  );

  return (
    <div>
      <svg viewBox="0 0 640 300" className="w-full h-[320px]">
        {/* Sources -> Bus */}
        <Flow path={`M${SRC_X + 46},${Y.solar} C${SRC_X + 130},${Y.solar} ${BUS_X - 90},150 ${BUS_X - 40},150`} active={solarActive} color="#fbbf24" />
        <Flow path={`M${SRC_X + 46},${Y.wind} L${BUS_X - 40},150`} active={windActive} color="#38bdf8" />
        <Flow path={`M${SRC_X + 46},${Y.battery} C${SRC_X + 130},${Y.battery} ${BUS_X - 90},150 ${BUS_X - 40},150`} active={batteryDischarging} color="#34d399" />
        {/* Bus -> Battery (charging = reverse direction) */}
        <Flow path={`M${BUS_X - 40},150 C${BUS_X - 90},150 ${SRC_X + 130},${Y.battery} ${SRC_X + 46},${Y.battery}`} active={batteryCharging} color="#34d399" />
        {/* Diesel -> Bus, ONLY when actually dispatched */}
        <Flow path={`M${SRC_X + 46},${Y.diesel} C${SRC_X + 150},${Y.diesel} ${BUS_X - 90},160 ${BUS_X - 40},155`} active={dieselActive} color="#f87171" />

        {/* Bus -> 4 load tiers */}
        <Flow path={`M${BUS_X + 40},150 L${LOAD_X - 52},${LY.critical}`} active={loads.critical.supplied_kw > 0} color="#a78bfa" />
        <Flow path={`M${BUS_X + 40},150 L${LOAD_X - 52},${LY.essential}`} active={loads.essential.supplied_kw > 0} color="#a78bfa" />
        <Flow path={`M${BUS_X + 40},150 L${LOAD_X - 52},${LY.flexible}`} active={loads.flexible.supplied_kw > 0} color="#a78bfa" />
        <Flow path={`M${BUS_X + 40},150 L${LOAD_X - 52},${LY.deferrable}`} active={loads.deferrable.status !== "CURTAILED"} color="#7d8ba1" />

        <SourceNode id="solar" y={Y.solar} label="SOLAR" value={`${d.solar_kw} kW`} active={solarActive} color="#fbbf24" />
        <SourceNode id="wind" y={Y.wind} label="WIND" value={`${d.wind_kw} kW`} active={windActive} color="#38bdf8" />
        <SourceNode id="battery" y={Y.battery} label="BATTERY" value={`${d.battery_soc_pct}%`} active={batteryDischarging || batteryCharging} color="#34d399" />
        <SourceNode id="diesel" y={Y.diesel} label="DIESEL" value={dieselActive ? `${d.diesel_kw} kW` : "STANDBY"} active={dieselActive} color="#f87171" />

        <g transform={`translate(${BUS_X},150)`} onClick={() => onNodeClick("bus")} style={{ cursor: "pointer" }}>
          <circle r={40} fill="#0b1220" stroke="#22d3ee" strokeWidth={2.5} />
          <text textAnchor="middle" y={-4} fill={cc.text} fontSize="10" fontWeight="700">ENERGY</text>
          <text textAnchor="middle" y={10} fill="#22d3ee" fontSize="11" fontWeight="700">BUS</text>
        </g>

        <LoadNode id="critical" y={LY.critical} label="CRITICAL" l={loads.critical} />
        <LoadNode id="essential" y={LY.essential} label="ESSENTIAL" l={loads.essential} />
        <LoadNode id="flexible" y={LY.flexible} label="FLEXIBLE" l={loads.flexible} />
        <LoadNode id="deferrable" y={LY.deferrable} label="DEFERRABLE" l={loads.deferrable} />
      </svg>
      <p className="text-[11px] text-polar-dim">
        Click any node for details. Diesel only shows a connected flow line when it is actually dispatched
        ({d.diesel_on ? `currently ON at ${d.diesel_kw} kW` : "currently STANDBY, 0 kW"}).
      </p>
    </div>
  );
}
