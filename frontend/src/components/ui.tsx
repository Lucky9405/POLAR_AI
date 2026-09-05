import React from "react";

export function Panel({ title, children, className = "", accent = false }: { title?: string; children: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={`panel relative ${className}`}>
      {accent && <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg station-accent-bg-solid" />}
      {title && (
        <div className="panel-title font-mono flex items-center gap-2">
          <span className="text-polar-dim/50">//</span> {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function KpiCard({
  icon, label, value, unit, sub, accent = "text-polar-cyan",
}: { icon: React.ReactNode; label: string; value: string | number; unit?: string; sub?: string; accent?: string }) {
  return (
    <div className="panel flex items-center gap-3 !p-3">
      <div className={`shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-polar-dim font-mono">{label}</div>
        <div className="text-xl font-bold text-polar-text truncate font-mono tabular-nums">
          {value} {unit && <span className="text-xs font-medium text-polar-dim">{unit}</span>}
        </div>
        {sub && <div className="text-[10px] text-polar-dim font-mono">{sub}</div>}
      </div>
    </div>
  );
}

const GOOD = new Set(["GOOD", "SAFE", "RESOLVED", "RECOVERY"]);
const MID = new Set(["MODERATE", "FAIR", "WATCH", "ACKNOWLEDGED", "STORM_PREPARATION"]);
const WARN = new Set(["HIGH", "WARNING", "OPEN"]);

export function StatusPill({ status }: { status: string }) {
  const color = GOOD.has(status)
    ? "bg-polar-green/20 text-polar-green border-polar-green/30"
    : MID.has(status)
    ? "bg-polar-amber/20 text-polar-amber border-polar-amber/30"
    : WARN.has(status)
    ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
    : "bg-polar-red/20 text-polar-red border-polar-red/30";
  return <span className={`px-2 py-0.5 rounded border text-[11px] font-mono font-semibold tracking-wide ${color}`}>{status}</span>;
}

export function LoadingBlock({ label = "Loading live data..." }: { label?: string }) {
  return <div className="text-polar-dim text-sm font-mono animate-pulse py-6 text-center">{label}</div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-polar-red text-sm font-mono py-4 text-center">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 underline text-polar-cyan">Retry</button>
      )}
    </div>
  );
}

/** Dense, single-line mission-control status strip — station/mode/tick/timestamp
 * at a glance, the way a real SCADA header would read. */
export function StatusStrip({ items }: { items: { label: string; value: string | number; accent?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 rounded-lg border border-polar-border bg-polar-panel2 font-mono text-xs mb-4">
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <span className="text-polar-border">|</span>}
          <span className="text-polar-dim uppercase tracking-wide">{it.label}</span>
          <span className={`font-semibold ${it.accent || "text-polar-text"}`}>{it.value}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
