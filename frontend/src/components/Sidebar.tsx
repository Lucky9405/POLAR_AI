import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Activity, SlidersHorizontal, Box, FlaskConical,
  ShieldAlert, Wrench, Bot, BarChart3, Bell, Snowflake, FileText, Gauge, BookOpen,
} from "lucide-react";
import { api } from "../api/client";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard },
  { to: "/forecast", label: "Forecast Review", icon: Activity },
  { to: "/optimizer", label: "Dispatch Optimizer", icon: SlidersHorizontal },
  { to: "/digital-twin", label: "Digital Energy Twin", icon: Box },
  { to: "/whatif", label: "What-If Lab", icon: FlaskConical },
  { to: "/risk", label: "Resilience & Risk", icon: ShieldAlert },
  { to: "/maintenance", label: "Equipment Health", icon: Wrench },
  { to: "/advisor", label: "Energy Advisor", icon: Bot },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/alerts", label: "Alert Center", icon: Bell },
  { to: "/data-assumptions", label: "Data & Assumptions", icon: FileText },
  { to: "/power-quality", label: "Power Quality", icon: Gauge },
  { to: "/how-it-works", label: "How POLAR-AI Works", icon: BookOpen },
];

export function Sidebar({ station, onStationChange }: { station: string; onStationChange: (s: string) => void }) {
  const [stations, setStations] = useState<any[]>([]);

  useEffect(() => {
    api.listStations().then((d) => setStations(d.stations)).catch(() => {});
  }, []);

  return (
    <aside className="w-64 shrink-0 bg-polar-panel border-r border-polar-border flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-polar-border">
        <Snowflake className="text-polar-cyan" size={26} />
        <div>
          <div className="font-bold text-polar-text tracking-wide leading-none">POLAR-AI</div>
          <div className="text-[10px] text-polar-dim tracking-wider">ENERGY COMMAND CENTER</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm mx-2 rounded-lg transition-colors ${
                isActive ? "bg-polar-cyan/10 text-polar-cyan" : "text-polar-dim hover:text-polar-text hover:bg-white/5"
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-polar-border">
        <div className="text-[10px] uppercase text-polar-dim mb-1">Station</div>
        <select
          value={station}
          onChange={(e) => onStationChange(e.target.value)}
          className="w-full bg-polar-panel2 border border-polar-border rounded-lg px-2 py-1.5 text-sm text-polar-text"
        >
          {stations.map((s) => (
            <option key={s.code} value={s.code}>{s.full_name}</option>
          ))}
        </select>
      </div>
    </aside>
  );
}
