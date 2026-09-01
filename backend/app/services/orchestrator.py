"""
Orchestrator
==============
The glue layer: advances a station's simulation by one tick using the
optimizer's commanded battery/diesel dispatch (rather than the simulator's
naive internal default), persists telemetry, evaluates alerts, and returns
a consolidated state snapshot used by almost every API endpoint.
"""
from __future__ import annotations
from dataclasses import asdict

from app.database import db as DB
from app.optimization.optimizer import decide as optimizer_decide
from app.risk.risk import compute_risk_score, compute_fuel_autonomy
from app.services.alerts import evaluate_and_raise_alerts
from app.forecasting.forecast import ForecastEngine
from app.config import station_config as CFG


def _forecast_renewable_drop_pct(history: list[dict]) -> float:
    """Quick heuristic: compare last hour's avg renewable vs previous hour's."""
    if len(history) < 8:
        return 0.0
    last4 = [h["renewable_kw"] for h in history[-4:]]
    prev4 = [h["renewable_kw"] for h in history[-8:-4]]
    a, b = sum(last4) / 4, sum(prev4) / 4
    if b <= 0.1:
        return 0.0
    drop = max(0.0, (b - a) / b * 100)
    return round(drop, 1)


def advance_tick(runtime, survival_override: bool | None = None) -> dict:
    station = runtime.code
    history = DB.get_recent_telemetry(station, limit=500)
    last = history[-1] if history else None

    if last:
        renewable_drop = _forecast_renewable_drop_pct(history)
        decision = optimizer_decide(
            battery_soc_pct=last["battery_soc_pct"],
            renewable_kw=last["solar_kw"] + last["wind_kw"],
            load_critical_kw=last["load_critical_kw"],
            load_important_kw=last["load_important_kw"],
            load_flexible_kw=last["load_flexible_kw"],
            fuel_liters=last["diesel_fuel_liters"],
            storm_probability_pct=last["weather"]["storm_probability_pct"],
            forecast_renewable_drop_pct=renewable_drop,
            survival_mode_manual_override=survival_override,
        )
    else:
        decision = optimizer_decide(70, 50, 40, 55, 35, CFG.initial_fuel_liters, 10, 0, survival_override)

    tick = runtime.simulator.step(
        battery_command_kw=decision.battery_command_kw,
        diesel_command_kw=decision.diesel_command_kw,
    )
    tick_dict = asdict(tick)
    DB.insert_telemetry(station, tick_dict)
    DB.insert_optimization_result(station, tick.tick, tick.timestamp, asdict(decision))

    runtime.mode = (
        "SURVIVAL_MODE" if decision.survival_mode else
        "WATCH" if tick_dict["weather"]["storm_probability_pct"] >= 40 else
        "NORMAL"
    )

    updated_history = DB.get_recent_telemetry(station, limit=500)
    autonomy = compute_fuel_autonomy(
        tick_dict["diesel_fuel_liters"],
        [h["load_total_kw"] for h in updated_history[-96:]] or [tick_dict["load_total_kw"]],
        [h["renewable_kw"] for h in updated_history[-96:]] or [tick_dict["renewable_kw"]],
    )
    risk = compute_risk_score(
        battery_soc_pct=tick_dict["battery_soc_pct"],
        fuel_liters=tick_dict["diesel_fuel_liters"],
        renewable_forecast_drop_pct=_forecast_renewable_drop_pct(updated_history),
        storm_probability_pct=tick_dict["weather"]["storm_probability_pct"],
        predicted_deficit_kw=tick_dict["flexible_curtailed_kw"],
        critical_load_kw=tick_dict["load_critical_kw"],
    )

    evaluate_and_raise_alerts(station, tick_dict, asdict(risk), asdict(decision), asdict(autonomy))

    return {
        "tick": tick_dict,
        "optimizer": asdict(decision),
        "risk": asdict(risk),
        "autonomy": asdict(autonomy),
        "mode": runtime.mode,
    }


def get_state_snapshot(runtime) -> dict:
    """Read-only snapshot without advancing the simulation (used by GET endpoints)."""
    history = DB.get_recent_telemetry(runtime.code, limit=500)
    if not history:
        return advance_tick(runtime)
    last = history[-1]
    renewable_drop = _forecast_renewable_drop_pct(history)
    decision = optimizer_decide(
        battery_soc_pct=last["battery_soc_pct"],
        renewable_kw=last["solar_kw"] + last["wind_kw"],
        load_critical_kw=last["load_critical_kw"],
        load_important_kw=last["load_important_kw"],
        load_flexible_kw=last["load_flexible_kw"],
        fuel_liters=last["diesel_fuel_liters"],
        storm_probability_pct=last["weather"]["storm_probability_pct"],
        forecast_renewable_drop_pct=renewable_drop,
    )
    autonomy = compute_fuel_autonomy(
        last["diesel_fuel_liters"],
        [h["load_total_kw"] for h in history[-96:]],
        [h["renewable_kw"] for h in history[-96:]],
    )
    risk = compute_risk_score(
        battery_soc_pct=last["battery_soc_pct"],
        fuel_liters=last["diesel_fuel_liters"],
        renewable_forecast_drop_pct=renewable_drop,
        storm_probability_pct=last["weather"]["storm_probability_pct"],
        predicted_deficit_kw=last["flexible_curtailed_kw"],
        critical_load_kw=last["load_critical_kw"],
    )
    return {
        "tick": last,
        "optimizer": asdict(decision),
        "risk": asdict(risk),
        "autonomy": asdict(autonomy),
        "mode": runtime.mode,
    }


def get_forecast(runtime, horizon_hours: int) -> dict:
    history = DB.get_recent_telemetry(runtime.code, limit=2000)
    if len(history) < 10:
        history = DB.get_recent_telemetry(runtime.code, limit=2000)
    engine = ForecastEngine(history)
    results = engine.forecast(horizon_hours)
    return {k: asdict(v) for k, v in results.items()}
