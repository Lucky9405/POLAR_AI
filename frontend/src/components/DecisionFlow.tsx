import React from "react";
import { Panel } from "./ui";

const LABELS: Record<string, string> = {
  DEMAND: "Demand",
  RENEWABLE_AVAILABLE: "Renewable Available",
  NO_RENEWABLE: "No Renewable",
  RENEWABLE_GE_DEMAND: "Renewable ≥ Demand",
  RENEWABLE_LT_DEMAND: "Renewable < Demand",
  SUPPLY_LOAD: "Supply Load",
  CHARGE_BATTERY: "Charge Battery",
  BATTERY_AVAILABLE: "Battery Available",
  DISCHARGE_BATTERY: "Discharge Battery",
  BATTERY_AT_RESERVE: "Battery At Reserve",
  DIESEL: "Diesel Backup",
  DIESEL_STANDBY: "Diesel Standby",
};

/** Renders the fixed decision tree with the actual path taken this tick highlighted. */
export function DecisionFlow({ path }: { path: string[] }) {
  const active = new Set(path);
  const isDiesel = active.has("DIESEL");

  const Node = ({ id, className = "" }: { id: string; className?: string }) => (
    <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold border text-center ${className} ${
      active.has(id)
        ? isDiesel && id === "DIESEL"
          ? "bg-polar-red/20 border-polar-red text-polar-red"
          : "bg-polar-cyan/15 border-polar-cyan text-polar-cyan"
        : "border-polar-border text-polar-dim"
    }`}>
      {LABELS[id] || id}
    </div>
  );

  return (
    <Panel title="How POLAR-AI Decides">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Node id="DEMAND" />
        <div className="text-polar-dim text-xs">↓</div>
        <div className="flex gap-2">
          <Node id="RENEWABLE_AVAILABLE" />
          <Node id="NO_RENEWABLE" />
        </div>
        <div className="text-polar-dim text-xs">↓</div>
        <div className="flex gap-2">
          <Node id="RENEWABLE_GE_DEMAND" />
          <Node id="RENEWABLE_LT_DEMAND" />
        </div>
        <div className="text-polar-dim text-xs">↓</div>
        <div className="flex gap-2 flex-wrap justify-center">
          <Node id="SUPPLY_LOAD" />
          <Node id="CHARGE_BATTERY" />
          <Node id="DISCHARGE_BATTERY" />
          <Node id="BATTERY_AT_RESERVE" />
        </div>
        <div className="text-polar-dim text-xs">↓</div>
        <div className="flex gap-2">
          <Node id="DIESEL_STANDBY" />
          <Node id="DIESEL" />
        </div>
      </div>
    </Panel>
  );
}
