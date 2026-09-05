import React from "react";
import { CloudSnow, Wind, Play, Pause, RotateCcw, AlertTriangle, Sun, Moon } from "lucide-react";
import { StationPhoto } from "./StationPhoto";
import { useTheme } from "./ThemeContext";

export function Header({
  identity, weather, mode, onControl, running, alertCount,
}: {
  identity: any; weather: any; mode: string;
  onControl: (a: "start" | "pause" | "reset", speed?: number) => void;
  running: boolean; alertCount: number;
}) {
  const { theme, toggle } = useTheme();
  const modeClass =
    mode === "SURVIVAL_MODE" ? "bg-polar-red/20 text-polar-red" :
    mode === "STORM_PREPARATION" ? "bg-orange-500/20 text-orange-400" :
    mode === "WATCH" ? "bg-polar-amber/20 text-polar-amber" :
    mode === "RECOVERY" ? "bg-polar-blue/20 text-polar-blue" : "bg-polar-green/20 text-polar-green";

  return (
    <div className="panel flex items-center justify-between mb-4 flex-wrap gap-3 station-accent-border" style={{ borderWidth: 1 }}>
      <div className="flex items-center gap-3">
        {identity && <StationPhoto code={identity.code} name={identity.full_name} className="w-14 h-14" />}
        <div>
          <h1 className="text-xl font-bold text-polar-text station-accent-text">{identity?.full_name || "Loading..."}</h1>
          <p className="text-xs text-polar-dim">{identity?.region}</p>
          {identity?.coordinates && <p className="text-[10px] text-polar-dim">{identity.coordinates} · Est. {identity.established}</p>}
        </div>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        {weather && (
          <>
            <div className="flex items-center gap-1.5 text-sm">
              <CloudSnow size={16} className="text-polar-cyan" />
              <span>{weather.temperature_c}°C</span>
              <span className="text-polar-dim text-xs capitalize">{weather.condition}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Wind size={16} className="text-polar-cyan" />
              <span>{weather.wind_speed_ms} m/s</span>
            </div>
          </>
        )}
        <span className={`px-2 py-1 rounded text-xs font-semibold ${modeClass}`}>
          MODE: {mode}
        </span>

        <div className="flex items-center gap-1 border-l border-polar-border pl-4">
          <button onClick={() => onControl("start")} title="Start"
            className={`p-1.5 rounded ${running ? "text-polar-green" : "text-polar-dim hover:text-polar-text"}`}>
            <Play size={16} />
          </button>
          <button onClick={() => onControl("pause")} title="Pause" className="p-1.5 rounded text-polar-dim hover:text-polar-text">
            <Pause size={16} />
          </button>
          <button onClick={() => onControl("reset")} title="Reset" className="p-1.5 rounded text-polar-dim hover:text-polar-text">
            <RotateCcw size={16} />
          </button>
        </div>

        {alertCount > 0 && (
          <div className="flex items-center gap-1 text-polar-red text-sm">
            <AlertTriangle size={16} /> {alertCount}
          </div>
        )}

        <button onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="p-1.5 rounded border border-polar-border text-polar-dim hover:text-polar-cyan hover:border-polar-cyan transition-colors">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
}
