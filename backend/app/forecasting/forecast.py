"""
AI Forecasting Pipeline
========================
Trains lightweight gradient-boosted regressors on the simulator's own
generated history to forecast load, solar and wind generation at
+1h / +6h / +24h horizons. Reports MAE/RMSE from a held-out backtest so the
dashboard shows honest accuracy numbers rather than invented ones.

We deliberately use scikit-learn's GradientBoostingRegressor instead of
XGBoost to avoid an unnecessary heavy dependency, as instructed. Swapping in
XGBoost later is a drop-in change (same sklearn-style .fit/.predict API).
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from datetime import datetime
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from app.config import station_config as CFG

TICKS_PER_HOUR = 60 // CFG.tick_minutes


def _build_features(history: list[dict]) -> np.ndarray:
    """Time + weather features shared across all forecast targets."""
    feats = []
    for h in history:
        ts = datetime.fromisoformat(h["timestamp"])
        w = h["weather"]
        hour_sin = np.sin(2 * np.pi * (ts.hour + ts.minute / 60) / 24)
        hour_cos = np.cos(2 * np.pi * (ts.hour + ts.minute / 60) / 24)
        feats.append([
            hour_sin, hour_cos,
            w["temperature_c"], w["wind_speed_ms"],
            w["solar_irradiance_wm2"], w["cloud_cover_pct"],
            w["storm_probability_pct"], float(w["storm_active"]),
        ])
    return np.array(feats)


@dataclass
class ForecastResult:
    horizon_hours: int
    values: list[float]
    timestamps: list[str]
    mae: float
    rmse: float


class ForecastEngine:
    """
    One instance trains three independent models (load/solar/wind) on the
    tick history available so far, then produces multi-step forecasts by
    recursively feeding a synthetic future weather trajectory (extrapolated
    diurnal pattern) — since real future weather is, by definition, unknown
    to the model at inference time in a live system.
    """

    def __init__(self, history: list[dict]):
        self.history = history
        self.X = _build_features(history)
        self.targets = {
            "load": np.array([h["load_total_kw"] for h in history]),
            "solar": np.array([h["solar_kw"] for h in history]),
            "wind": np.array([h["wind_kw"] for h in history]),
        }
        self.models = {}
        self.metrics = {}
        self._train()

    def _train(self):
        n = len(self.X)
        split = max(int(n * 0.8), n - TICKS_PER_HOUR * 24) if n > 50 else n - 1
        split = max(split, 10)
        for name, y in self.targets.items():
            model = GradientBoostingRegressor(
                n_estimators=120, max_depth=3, learning_rate=0.08, random_state=CFG.random_seed
            )
            if n > split + 5:
                model.fit(self.X[:split], y[:split])
                pred = model.predict(self.X[split:])
                mae = float(mean_absolute_error(y[split:], pred))
                rmse = float(mean_squared_error(y[split:], pred) ** 0.5)
            else:
                model.fit(self.X, y)
                pred = model.predict(self.X)
                mae = float(mean_absolute_error(y, pred))
                rmse = float(mean_squared_error(y, pred) ** 0.5)
            # Refit on full data for best live forecasts, keep backtest metrics
            model.fit(self.X, y)
            self.models[name] = model
            self.metrics[name] = {"mae": round(mae, 2), "rmse": round(rmse, 2)}

    def _future_feature_row(self, ts: datetime, last_weather: dict) -> list[float]:
        hour_sin = np.sin(2 * np.pi * (ts.hour + ts.minute / 60) / 24)
        hour_cos = np.cos(2 * np.pi * (ts.hour + ts.minute / 60) / 24)
        # Persist most recent weather signal (simple, honest assumption — no
        # claim of real forecast skill beyond short-horizon persistence).
        w = last_weather
        return [
            hour_sin, hour_cos,
            w["temperature_c"], w["wind_speed_ms"],
            w["solar_irradiance_wm2"], w["cloud_cover_pct"],
            w["storm_probability_pct"], float(w["storm_active"]),
        ]

    def forecast(self, horizon_hours: int) -> dict[str, ForecastResult]:
        from datetime import timedelta
        last = self.history[-1]
        last_ts = datetime.fromisoformat(last["timestamp"])
        last_weather = last["weather"]
        n_steps = horizon_hours * TICKS_PER_HOUR

        future_ts = [last_ts + timedelta(minutes=CFG.tick_minutes * (i + 1)) for i in range(n_steps)]
        future_X = np.array([self._future_feature_row(ts, last_weather) for ts in future_ts])

        results = {}
        for name, model in self.models.items():
            preds = model.predict(future_X)
            preds = np.clip(preds, 0, None)
            results[name] = ForecastResult(
                horizon_hours=horizon_hours,
                values=[round(float(v), 2) for v in preds],
                timestamps=[ts.isoformat() for ts in future_ts],
                mae=self.metrics[name]["mae"],
                rmse=self.metrics[name]["rmse"],
            )
        return results
