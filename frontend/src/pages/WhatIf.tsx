import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Panel, LoadingBlock, StatusStrip, StatusPill } from "../components/ui";
import { useChartColors } from "../components/useChartColors";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const BASE_DEFAULTS = {
  solar_pct_change: 0,
  wind_pct_change: 0,
  load_pct_change: 0,
  storm_probability_pct: 20,
  storm_duration_hours: 8,
  temperature_c_delta: 0,
  horizon_hours: 24,
  battery_degradation_pct: 0,
  diesel_unavailable: false,
};

function Slider({ label, value, min, max, step = 1, unit, onChange }: any) {
  return (
    <div>
      <div className="flex justify-between text-xs text-polar-dim mb-1">
        <span>{label}</span><span className="text-polar-text font-semibold tabular-nums font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400" />
    </div>
  );
}

export default function WhatIfPage() {
  const cc = useChartColors();
  const [baseline, setBaseline] = useState<{ soc: number; capacity: number } | null>(null);
  const [form, setForm] = useState<any>(BASE_DEFAULTS);
  const [startingSoc, setStartingSoc] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const set = (k: string) => (v: number) => setForm((f: any) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.currentEnergy().then((tick) => {
      setBaseline({ soc: tick.battery_soc_pct, capacity: tick.battery_capacity_kwh });
      setStartingSoc(tick.battery_soc_pct);
    }).catch(() => {});
  }, []);

  async function run() {
    setRunning(true);
    try {
      const payload: any = {
        solar_pct_change: form.solar_pct_change,
        wind_pct_change: form.wind_pct_change,
        load_pct_change: form.load_pct_change,
        storm_probability_pct: form.storm_probability_pct,
        storm_duration_hours: form.storm_duration_hours,
        temperature_c_delta: form.temperature_c_delta,
        horizon_hours: form.horizon_hours,
      };
      if (startingSoc !== null) payload.starting_soc_pct = startingSoc;
      if (baseline && form.battery_degradation_pct > 0) {
        payload.battery_capacity_kwh = Math.round(baseline.capacity * (1 - form.battery_degradation_pct / 100));
      }
      if (form.diesel_unavailable) payload.fuel_liters = 0;
      const res = await api.whatIf(payload);
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setForm(BASE_DEFAULTS);
    setStartingSoc(baseline?.soc ?? null);
    setResult(null);
  }

  const timeline = result?.scenario?.timeline || [];

  return (
    <div className="space-y-4">
      <StatusStrip items={[
        { label: "MODE", value: "BASELINE vs SCENARIO" },
        { label: "ENGINE", value: "SAME PHYSICS AS LIVE DISPATCH" },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="What-If Scenario Controls" className="lg:col-span-1">
          {!baseline && <LoadingBlock label="Loading baseline state..." />}
          {baseline && (
            <div className="space-y-4">
              <Slider label="Solar Generation" value={form.solar_pct_change} min={-100} max={100} unit="%" onChange={set("solar_pct_change")} />
              <Slider label="Wind Generation" value={form.wind_pct_change} min={-100} max={100} unit="%" onChange={set("wind_pct_change")} />
              <Slider label="Demand (Load)" value={form.load_pct_change} min={-50} max={100} unit="%" onChange={set("load_pct_change")} />
              <Slider label="Starting Battery SOC (Low-SOC Scenario)" value={startingSoc ?? baseline.soc} min={5} max={100} unit="%"
                onChange={(v: number) => setStartingSoc(v)} />
              <Slider label="Battery Degradation" value={form.battery_degradation_pct} min={0} max={50} unit="%" onChange={set("battery_degradation_pct")} />
              <div className="flex items-center justify-between border border-polar-border rounded-lg p-2">
                <span className="text-xs text-polar-dim">Diesel Unavailable</span>
                <input type="checkbox" checked={form.diesel_unavailable}
                  onChange={(e) => setForm((f: any) => ({ ...f, diesel_unavailable: e.target.checked }))}
                  className="accent-cyan-400 w-4 h-4" />
              </div>
              <Slider label="Storm Probability" value={form.storm_probability_pct} min={0} max={100} unit="%" onChange={set("storm_probability_pct")} />
              <Slider label="Storm Duration" value={form.storm_duration_hours} min={0} max={24} unit="h" onChange={set("storm_duration_hours")} />
              <Slider label="Temperature Change" value={form.temperature_c_delta} min={-15} max={15} unit="°C" onChange={set("temperature_c_delta")} />
              <Slider label="Horizon" value={form.horizon_hours} min={6} max={48} unit="h" onChange={set("horizon_hours")} />
              <p className="text-[10px] text-polar-dim">
                Tip: for a "renewable surplus" scenario, set Solar/Wind to +50% or more. For "diesel unavailable",
                check the box above — the optimizer will curtail flexible/deferrable loads instead once battery
                reserve is exhausted, exactly as it would live.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={run} disabled={running}
                  className="flex-1 bg-polar-cyan text-black font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
                  {running ? "Running..." : "Run Scenario"}
                </button>
                <button onClick={reset} className="px-3 rounded-lg bg-polar-panel2 text-polar-dim text-sm">Reset</button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Baseline vs. Scenario Results" className="lg:col-span-2">
          {!result && <p className="text-sm text-polar-dim">Adjust parameters and click "Run Scenario" to see results computed by the live optimization/risk engine — no fake precision, real recomputation.</p>}
          {result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Fuel Required</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.fuel_required_l} L</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Min Battery SOC</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.min_battery_soc_pct}%</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Critical Load Status</div>
                  <div className="text-lg font-bold"><StatusPill status={result.scenario.critical_load_status} /></div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Energy Deficit</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.energy_deficit_kwh} kWh</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Fuel Autonomy</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.fuel_autonomy_days} days</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Renewable Share</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.renewable_share_pct}%</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">CO₂ Impact</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.co2_increase_kg} kg</div>
                </div>
                <div className="border border-polar-border rounded-lg p-3">
                  <div className="text-xs text-polar-dim">Risk Score</div>
                  <div className="text-lg font-bold font-mono tabular-nums">{result.scenario.risk_score}/100 <StatusPill status={result.scenario.risk_level} /></div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                  <XAxis dataKey="hour" stroke={cc.axis} fontSize={11} label={{ value: "Hour", position: "insideBottom", offset: -2, fill: cc.axis }} />
                  <YAxis stroke={cc.axis} fontSize={11} />
                  <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
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
