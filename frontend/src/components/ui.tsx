import React from "react";

export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`panel ${className}`}>
      {title && <div className="panel-title">{title}</div>}
      {children}
    </div>
  );
}

export function KpiCard({
  icon, label, value, unit, sub, accent = "text-polar-cyan",
}: { icon: React.ReactNode; label: string; value: string | number; unit?: string; sub?: string; accent?: string }) {
  return (
    <div className="panel flex items-center gap-3">
      <div className={`shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-polar-dim">{label}</div>
        <div className="text-xl font-bold text-polar-text truncate">
          {value} {unit && <span className="text-sm font-medium text-polar-dim">{unit}</span>}
        </div>
        {sub && <div className="text-xs text-polar-dim">{sub}</div>}
      </div>
    </div>
  );
}

const GOOD = new Set(["GOOD", "SAFE", "RESOLVED"]);
const MID = new Set(["MODERATE", "FAIR", "WATCH", "ACKNOWLEDGED", "STORM_PREPARATION"]);
const WARN = new Set(["HIGH", "WARNING", "OPEN"]);

export function StatusPill({ status }: { status: string }) {
  const color = GOOD.has(status)
    ? "bg-polar-green/20 text-polar-green"
    : MID.has(status)
    ? "bg-polar-amber/20 text-polar-amber"
    : WARN.has(status)
    ? "bg-orange-500/20 text-orange-400"
    : "bg-polar-red/20 text-polar-red";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{status}</span>;
}

export function LoadingBlock({ label = "Loading live data..." }: { label?: string }) {
  return <div className="text-polar-dim text-sm animate-pulse py-6 text-center">{label}</div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-polar-red text-sm py-4 text-center">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 underline text-polar-cyan">Retry</button>
      )}
    </div>
  );
}
