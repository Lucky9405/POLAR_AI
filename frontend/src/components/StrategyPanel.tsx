import React from "react";
import { Panel, StatusPill } from "./ui";

export function StrategyPanel({ mode, strategy, reservePct }: { mode: string; strategy: Record<string, string>; reservePct: number }) {
  const rows = Object.entries(strategy).map(([k, v]) => [
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    v,
  ]);

  return (
    <Panel title="Current Energy Strategy">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">Operating Mode</span>
        <StatusPill status={mode} />
      </div>
      <div className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-polar-dim">{label}</span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
        <div className="flex justify-between pt-1.5 mt-1.5 border-t border-polar-border">
          <span className="text-polar-dim">Battery Reserve</span>
          <span className="font-semibold">{reservePct}% (configurable)</span>
        </div>
      </div>
    </Panel>
  );
}
