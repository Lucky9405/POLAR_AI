import React, { useState } from "react";
import { Panel, StatusStrip } from "../components/ui";
import {
  CloudSnow, Database, Brain, ShieldAlert, SlidersHorizontal, Zap, Box, Bot, RotateCcw,
} from "lucide-react";

const STAGES = [
  { id: "weather", icon: CloudSnow, title: "Weather", what: "Monitors simulated temperature, wind, irradiance, cloud cover, and storm probability.", inputs: "Time of day, season, prior weather state (random-walk model)", outputs: "Current weather snapshot", why: "Everything downstream — solar/wind generation, load, storm response — depends on weather." },
  { id: "state", icon: Database, title: "Data & Current State", what: "Combines weather with the station's physical model to produce load, solar, wind, battery, and diesel telemetry for this tick.", inputs: "Weather + station config (capacities, load ceilings)", outputs: "A single telemetry tick, persisted to SQLite", why: "This tick is the single source of truth every other stage and every dashboard section reads." },
  { id: "forecast", icon: Brain, title: "AI Forecasting", what: "Trains Gradient-Boosted Regression Trees on the station's own recent history to predict load, solar, and wind at +1h/+6h/+24h.", inputs: "Historical ticks (time-of-day + weather features)", outputs: "Forecast series + honest backtested MAE/RMSE", why: "Lets the optimizer and risk score react ahead of a problem, not just to it." },
  { id: "risk", icon: ShieldAlert, title: "Risk Assessment", what: "Combines battery reserve, fuel availability, forecast renewable drop, storm probability, and predicted deficit into one explainable 0-100 score.", inputs: "Current state + forecasts", outputs: "Risk score, level (SAFE/MODERATE/HIGH/CRITICAL), and a factor-by-factor explanation", why: "A single number a judge or operator can act on, always traceable to its inputs." },
  { id: "optimizer", icon: SlidersHorizontal, title: "Dispatch Optimizer", what: "A deterministic rule-based engine enforcing strict RENEWABLE → BATTERY → DIESEL priority.", inputs: "Current state, risk, battery reserve config", outputs: "Battery command, diesel command, load-tier allowances, operating mode, and a decision path", why: "Diesel should be the last resort, not a default — this is where that rule actually lives." },
  { id: "loads", icon: Zap, title: "Load Management", what: "Enforces CRITICAL > ESSENTIAL > FLEXIBLE > DEFERRABLE priority — critical/essential are never curtailed by the optimizer's allowance fractions.", inputs: "Optimizer's flexible/deferrable fractions", outputs: "Per-tier supplied/curtailed kW and status", why: "Guarantees life-support and core operations stay powered even during a shortage." },
  { id: "twin", icon: Box, title: "Digital Energy Twin", what: "A live 2D visualization of every source, the energy bus, and every load tier, with clickable inspectors.", inputs: "The same dispatch_state object as the rest of the dashboard", outputs: "Visual energy flow + per-node detail on click", why: "Makes the abstract dispatch decision physically legible at a glance." },
  { id: "advisor", icon: Bot, title: "Advisor + Alerts", what: "A deterministic engine (optionally phrased by an LLM) answers questions using only real computed numbers; alert rules fire on real thresholds.", inputs: "The dispatch_state object", outputs: "Grounded natural-language answers; OPEN/ACKNOWLEDGED/RESOLVED alerts", why: "Explains WHY, in plain language, without ever contradicting the dashboard." },
  { id: "loop", icon: RotateCcw, title: "New System State", what: "The tick is persisted, and the whole loop repeats on the next simulation step.", inputs: "Everything above", outputs: "Updated telemetry, ready for the next Weather stage", why: "Continuous re-evaluation is what lets Polar Survival Mode activate and recover automatically." },
];

export default function HowItWorksPage() {
  const [active, setActive] = useState(STAGES[0].id);
  const stage = STAGES.find((s) => s.id === active)!;

  return (
    <div className="space-y-4">
      <StatusStrip items={[
        { label: "STAGES", value: STAGES.length },
        { label: "VIEWING", value: stage.title },
      ]} />

      <Panel title="The POLAR-AI Intelligence Loop">
        <p className="text-sm text-polar-dim mb-4">
          Click any stage to see what it does, what it reads, what it produces, and why it matters.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === active;
            return (
              <React.Fragment key={s.id}>
                <button
                  onClick={() => setActive(s.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-colors ${
                    isActive ? "border-polar-cyan bg-polar-cyan/10 text-polar-cyan" : "border-polar-border text-polar-dim hover:text-polar-text"
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight w-16">{s.title}</span>
                </button>
                {i < STAGES.length - 1 && <span className="text-polar-dim text-xs">→</span>}
              </React.Fragment>
            );
          })}
        </div>
      </Panel>

      <Panel title={stage.title}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-polar-dim uppercase mb-1">What it does</div>
            <p>{stage.what}</p>
          </div>
          <div>
            <div className="text-xs text-polar-dim uppercase mb-1">Inputs → Outputs</div>
            <p className="text-polar-cyan">{stage.inputs}</p>
            <p className="mt-1">↓</p>
            <p className="text-polar-green">{stage.outputs}</p>
          </div>
          <div>
            <div className="text-xs text-polar-dim uppercase mb-1">Why it matters</div>
            <p>{stage.why}</p>
          </div>
        </div>
      </Panel>

      <Panel title="AI vs. Optimization vs. Safety Rules — What's Actually Doing the Work">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="border border-polar-border rounded-lg p-3">
            <div className="font-semibold text-polar-cyan mb-2">AI / Forecasting</div>
            <ul className="text-xs text-polar-dim space-y-1">
              <li>• Demand prediction</li>
              <li>• Renewable generation prediction</li>
              <li>• Weather-influenced trends</li>
              <li>• Equipment health scoring</li>
            </ul>
          </div>
          <div className="border border-polar-border rounded-lg p-3">
            <div className="font-semibold text-polar-blue mb-2">Optimization</div>
            <ul className="text-xs text-polar-dim space-y-1">
              <li>• Battery charge/discharge dispatch</li>
              <li>• Diesel dispatch (last resort)</li>
              <li>• Flexible/deferrable load scheduling</li>
              <li>• Reserve management</li>
            </ul>
          </div>
          <div className="border border-polar-border rounded-lg p-3">
            <div className="font-semibold text-polar-green mb-2">Safety / Rules</div>
            <ul className="text-xs text-polar-dim space-y-1">
              <li>• Critical/essential load protection (never curtailed)</li>
              <li>• Battery hard-floor SOC limit</li>
              <li>• Diesel capacity/fuel limits</li>
              <li>• Survival Mode activation thresholds</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-polar-dim mt-3">
          Why diesel is minimized rather than eliminated: a real Antarctic station cannot risk losing critical
          loads to save fuel. The optimizer treats diesel as a genuine last resort — used only when renewable
          generation and battery reserve together cannot safely meet demand — never removed as an option.
        </p>
      </Panel>
    </div>
  );
}
