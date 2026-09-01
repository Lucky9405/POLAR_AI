import React, { useState } from "react";
import { api } from "../api/client";
import { Panel, LoadingBlock } from "../components/ui";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const DEFAULTS = {
  solar_pct_change: 0,
  wind_pct_change: 0,
  load_pct_change: 0,
  storm_probability_pct: 20,
  storm_duration_hours: 8,
  temperature_c_delta: 0,
  horizon_hours: 24,
};

function Slider({ label, value, min, max, step = 1, unit, onChange }: any) {
  return (
    <div>
      <div className="flex justify-between text-xs text-polar-dim mb-1">
        <span>{label}</span><span className="text-polar-text font-semibold">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400" />
    </div>
  );
}

export default function WhatIfPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const set = (k: string) => (v: number) => setForm((f) => ({ ...f, [k]: v }));

  async function run() {
    setRunning(true);
    try {
      const res = await api.whatIf(form);
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setForm(DEFAULTS);
    setResult(null);
  }

  const timeline = result?.scenario?.timeline || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="What-If Scenario Controls" className="lg:col-span-1">
          <div className="space-y-4">
            <Slider label="Solar Generation" value={form.solar_pct_change} min={-100} max={100} unit="%" onChange={set("solar_pct_change")} />
            <Slider label="Wind Generation" value={form.wind_pct_change} min={-100} max={100} unit="%" onChange={set("wind_pct_change")} />
            <Slider label="Load Demand" value={form.load_pct_change} min={-50} max={100} unit="%" onChange={set("load_pct_change")} />
            <Slider label="Storm Probability" value={form.storm_probability_pct} min={0} max={100} unit="%" onChange={set("storm_probability_pct")} />
            <Slider label="Storm Duration" value={form.storm_duration_hours} min={0} max={24} unit="h" onChange={set("storm_duration_hours")} />
            <Slider label="Temperature Change" value={form.temperature_c_delta} min={-15} max={15} unit="°C" onChange={set("temperature_c_delta")} />
            <Slider label="Horizon" value={form.horizon_hours} min={6} max={48} unit="h" onChange={set("horizon_hours")} />
            <div className="flex gap-2 pt-2">
              <button onClick={run} disabled={running}
                className="flex-1 bg-polar-cyan text-black font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
                {running ? "Running..." : "Run Scenario"}
              </button>
              <button onClick={reset} className="px-3 rounded-lg bg-polar-panel2 text-polar-dim text-sm">Reset</button>
            </div>
          </div>
        </Panel>

        <Panel title="Scenario Results" className="lg:col-span-2">
          {!result && <p className="text-sm text-polar-dim">Adjust parameters and click "Run Scenario" to see results computed by the live optimization/risk engine.</p>}
          {result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Fuel Required</div>
                  <div className="text-lg font-bold">{result.scenario.fuel_required_l} L</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Min Battery SOC</div>
                  <div className="text-lg font-bold">{result.scenario.min_battery_soc_pct}%</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Critical Load Status</div>
                  <div className={`text-lg font-bold ${result.scenario.critical_load_status === "SAFE" ? "text-polar-green" : "text-polar-red"}`}>
                    {result.scenario.critical_load_status}
                  </div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Energy Deficit</div>
                  <div className="text-lg font-bold">{result.scenario.energy_deficit_kwh} kWh</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Fuel Autonomy</div>
                  <div className="text-lg font-bold">{result.scenario.fuel_autonomy_days} days</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Renewable Share</div>
                  <div className="text-lg font-bold">{result.scenario.renewable_share_pct}%</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">CO₂ Impact</div>
                  <div className="text-lg font-bold">{result.scenario.co2_increase_kg} kg</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Risk Score</div>
                  <div className="text-lg font-bold">{result.scenario.risk_score}/100 ({result.scenario.risk_level})</div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2a41" />
                  <XAxis dataKey="hour" stroke="#7d8ba1" fontSize={11} label={{ value: "Hour", position: "insideBottom", offset: -2, fill: "#7d8ba1" }} />
                  <YAxis stroke="#7d8ba1" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2a41" }} />
                  <Legend />
                  <Line type="monotone" dataKey="battery_soc_pct" stroke="#34d399" name="Battery SOC %" dot={false} />
                  <Line type="monotone" dataKey="solar_kw" stroke="#fbbf24" name="Solar kW" dot={false} />
                  <Line type="monotone" dataKey="wind_kw" stroke="#38bdf8" name="Wind kW" dot={false} />
                  <Line type="monotone" dataKey="load_kw" stroke="#a78bfa" name="Load kW" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
