import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock, StatusStrip, StatusPill } from "../components/ui";
import { useChartColors } from "../components/useChartColors";

const HORIZONS = [1, 6, 24] as const;

export default function ForecastPage() {
  const cc = useChartColors();
  const [horizon, setHorizon] = useState<1 | 6 | 24>(24);
  const { data: forecast, error, loading, refresh } = usePolling(() => api.forecast(horizon), 30000, [horizon]);
  const { data: historyData } = usePolling(() => api.history(96), 30000, [horizon]);
  const { data: dispatch } = usePolling(() => api.dispatchState(), 10000);
  const [trajectory, setTrajectory] = useState<any[]>([]);

  // Battery trajectory: real backend projection (not frontend-invented) — a
  // zero-change What-If scenario at this horizon gives an honest forward
  // projection using the same physics as the live dispatch engine.
  useEffect(() => {
    api.whatIf({ horizon_hours: horizon }).then((res) => {
      setTrajectory(res.scenario.timeline.map((t: any) => ({
        hour: `+${t.hour}h`, soc: t.battery_soc_pct,
      })));
    }).catch(() => setTrajectory([]));
  }, [horizon]);

  if (loading && !forecast) return <LoadingBlock label="Training forecasting models on live telemetry..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const histRows = (historyData?.history || []).map((h: any) => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit" }),
    load: h.load_total_kw, solar: h.solar_kw, wind: h.wind_kw,
  }));
  const forecastRows = forecast.load.timestamps.map((ts: string, i: number) => ({
    time: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    loadForecast: forecast.load.values[i],
    solarForecast: forecast.solar.values[i],
    windForecast: forecast.wind.values[i],
  }));

  const metricRow = (name: string, key: "load" | "solar" | "wind", color: string) => (
    <div className="panel">
      <div className="panel-title font-mono">// {name} Forecast Confidence (Backtest)</div>
      <div className="flex gap-6 font-mono">
        <div><span className="text-polar-dim text-xs block">MAE</span>
          <span className="text-xl font-bold tabular-nums" style={{ color }}>±{forecast[key].mae} kW</span></div>
        <div><span className="text-polar-dim text-xs block">RMSE</span>
          <span className="text-xl font-bold tabular-nums" style={{ color }}>±{forecast[key].rmse} kW</span></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {dispatch && (
        <StatusStrip items={[
          { label: "STATION", value: dispatch.station },
          { label: "MODE", value: dispatch.operating_mode },
          { label: "RISK", value: `${dispatch.risk_score}/100` },
          { label: "STORM PROB", value: `${dispatch.weather.storm_probability_pct}%` },
        ]} />
      )}

      <Panel title="What This Forecast Predicts & How It Affects Operations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-polar-dim uppercase mb-1 font-mono">What it predicts</div>
            <p>Load, solar, and wind generation at +1h/+6h/+24h horizons, trained on this station's own recent
              telemetry (time-of-day + weather features) using Gradient-Boosted Regression Trees.</p>
          </div>
          <div>
            <div className="text-xs text-polar-dim uppercase mb-1 font-mono">How it affects operations</div>
            <p>The Dispatch Optimizer and Risk score both consume a short-horizon renewable-drop signal derived
              from this forecast — a predicted drop feeds directly into Survival Mode activation thresholds.</p>
          </div>
        </div>
      </Panel>

      <div className="flex items-center gap-2">
        <span className="text-sm text-polar-dim font-mono">HORIZON:</span>
        {HORIZONS.map((h) => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`px-3 py-1 rounded text-sm font-mono ${horizon === h ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
            +{h}h
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metricRow("Load", "load", "#38bdf8")}
        {metricRow("Solar", "solar", "#fbbf24")}
        {metricRow("Wind", "wind", "#34d399")}
      </div>

      <Panel title="Historical (last 24h)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={histRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
            <XAxis dataKey="time" stroke={cc.axis} fontSize={11} />
            <YAxis stroke={cc.axis} fontSize={11} />
            <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
            <Legend />
            <Line type="monotone" dataKey="load" stroke="#38bdf8" name="Load" dot={false} />
            <Line type="monotone" dataKey="solar" stroke="#fbbf24" name="Solar" dot={false} />
            <Line type="monotone" dataKey="wind" stroke="#34d399" name="Wind" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title={`AI Forecast (Next ${horizon}h) — Model-Derived`}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={forecastRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
            <XAxis dataKey="time" stroke={cc.axis} fontSize={11} />
            <YAxis stroke={cc.axis} fontSize={11} />
            <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
            <Legend />
            <Line type="monotone" dataKey="loadForecast" stroke="#38bdf8" name="Load Forecast" dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="solarForecast" stroke="#fbbf24" name="Solar Forecast" dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="windForecast" stroke="#34d399" name="Wind Forecast" dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-polar-dim mt-2">
          Future weather features are persisted from the latest observation — a documented modeling
          simplification, not a claim of real meteorological forecast skill beyond short horizons.
        </p>
      </Panel>

      <Panel title="Battery Trajectory Forecast (Derived from Dispatch Engine)">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trajectory}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
            <XAxis dataKey="hour" stroke={cc.axis} fontSize={11} />
            <YAxis stroke={cc.axis} fontSize={11} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}` }} />
            <Line type="monotone" dataKey="soc" stroke="#34d399" name="Battery SOC %" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-polar-dim mt-2">
          Projected using the same physics/optimizer engine as the What-If Lab with no scenario changes applied —
          a zero-delta forward projection, not a separately-invented number.
        </p>
      </Panel>

      {dispatch && (
        <Panel title="Risk Implications of This Forecast">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold font-mono">{dispatch.risk_score}/100</span>
            <StatusPill status={dispatch.risk_level} />
          </div>
          <p className="text-sm text-polar-dim">{dispatch.active_decision}</p>
        </Panel>
      )}
    </div>
  );
}
