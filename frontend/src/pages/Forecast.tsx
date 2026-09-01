import React, { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Panel, LoadingBlock, ErrorBlock } from "../components/ui";

const HORIZONS = [1, 6, 24] as const;

export default function ForecastPage() {
  const [horizon, setHorizon] = useState<1 | 6 | 24>(24);
  const { data: forecast, error, loading, refresh } = usePolling(() => api.forecast(horizon), 30000, [horizon]);
  const { data: historyData } = usePolling(() => api.history(96), 30000, [horizon]);

  if (loading && !forecast) return <LoadingBlock label="Training forecasting models on live telemetry..." />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const histRows = (historyData?.history || []).map((h: any) => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit" }),
    load: h.load_total_kw, solar: h.solar_kw, wind: h.wind_kw, historical: true,
  }));
  const forecastRows = forecast.load.timestamps.map((ts: string, i: number) => ({
    time: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    loadForecast: forecast.load.values[i],
    solarForecast: forecast.solar.values[i],
    windForecast: forecast.wind.values[i],
  }));

  const metricRow = (name: string, key: "load" | "solar" | "wind", color: string) => (
    <div className="panel">
      <div className="panel-title">{name} Forecast Accuracy (Backtest)</div>
      <div className="flex gap-6">
        <div><span className="text-polar-dim text-xs block">MAE</span>
          <span className="text-xl font-bold" style={{ color }}>±{forecast[key].mae} kW</span></div>
        <div><span className="text-polar-dim text-xs block">RMSE</span>
          <span className="text-xl font-bold" style={{ color }}>±{forecast[key].rmse} kW</span></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-polar-dim">Horizon:</span>
        {HORIZONS.map((h) => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`px-3 py-1 rounded-lg text-sm ${horizon === h ? "bg-polar-cyan text-black font-semibold" : "bg-polar-panel2 text-polar-dim"}`}>
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
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={histRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2a41" />
            <XAxis dataKey="time" stroke="#7d8ba1" fontSize={11} />
            <YAxis stroke="#7d8ba1" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2a41" }} />
            <Legend />
            <Line type="monotone" dataKey="load" stroke="#38bdf8" name="Load" dot={false} />
            <Line type="monotone" dataKey="solar" stroke="#fbbf24" name="Solar" dot={false} />
            <Line type="monotone" dataKey="wind" stroke="#34d399" name="Wind" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title={`AI Forecast (Next ${horizon}h)`}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={forecastRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2a41" />
            <XAxis dataKey="time" stroke="#7d8ba1" fontSize={11} />
            <YAxis stroke="#7d8ba1" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2a41" }} />
            <Legend />
            <Line type="monotone" dataKey="loadForecast" stroke="#38bdf8" name="Load Forecast" dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="solarForecast" stroke="#fbbf24" name="Solar Forecast" dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="windForecast" stroke="#34d399" name="Wind Forecast" dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-polar-dim mt-2">
          Model: Gradient-Boosted Regression Trees trained on simulated station history (time-of-day + weather features).
          Future weather features are persisted from the latest observation — this is a modeling simplification, not a
          claim of real meteorological forecast skill beyond short horizons.
        </p>
      </Panel>
    </div>
  );
}
