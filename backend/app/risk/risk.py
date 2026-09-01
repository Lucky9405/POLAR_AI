"""
Energy Risk Score + Fuel Autonomy
===================================
Both are computed transparently from current application state — every
number contributing to the score is returned alongside it so the frontend
(and the AI Advisor) can explain *why* the score is what it is.
"""
from __future__ import annotations
from dataclasses import dataclass
from app.config import station_config as CFG


@dataclass
class RiskBreakdown:
    score: int
    level: str
    factors: dict
    explanation: list[str]


def compute_risk_score(
    battery_soc_pct: float,
    fuel_liters: float,
    renewable_forecast_drop_pct: float,
    storm_probability_pct: float,
    predicted_deficit_kw: float,
    critical_load_kw: float,
) -> RiskBreakdown:
    # Each sub-score is 0-100; weighted sum -> overall 0-100
    battery_risk = max(0.0, 100 - (battery_soc_pct / CFG.battery_survival_reserve_pct) * 100) \
        if battery_soc_pct < CFG.battery_survival_reserve_pct * 2 else max(0.0, 40 - battery_soc_pct * 0.2)
    battery_risk = min(100.0, max(0.0, 100 - battery_soc_pct))

    fuel_days = fuel_liters / max(1.0, (CFG.diesel_capacity_kw * 0.5 * 24 / CFG.diesel_efficiency_kwh_per_l))
    fuel_risk = max(0.0, min(100.0, 100 - fuel_days * 15))

    renewable_risk = min(100.0, renewable_forecast_drop_pct)
    storm_risk = storm_probability_pct
    deficit_risk = min(100.0, (predicted_deficit_kw / max(1.0, critical_load_kw)) * 60)

    weights = {
        "battery": 0.25,
        "fuel": 0.15,
        "renewable_forecast": 0.20,
        "storm": 0.25,
        "deficit": 0.15,
    }
    score = (
        battery_risk * weights["battery"]
        + fuel_risk * weights["fuel"]
        + renewable_risk * weights["renewable_forecast"]
        + storm_risk * weights["storm"]
        + deficit_risk * weights["deficit"]
    )
    score = int(round(min(100, max(0, score))))

    if score <= CFG.risk_safe_max:
        level = "SAFE"
    elif score <= CFG.risk_moderate_max:
        level = "MODERATE"
    elif score <= CFG.risk_high_max:
        level = "HIGH"
    else:
        level = "CRITICAL"

    explanation = [
        f"Battery reserve contributes {battery_risk * weights['battery']:.1f} pts (SOC {battery_soc_pct:.0f}%)",
        f"Fuel availability contributes {fuel_risk * weights['fuel']:.1f} pts (~{fuel_days:.1f} days at half diesel load)",
        f"Renewable forecast drop contributes {renewable_risk * weights['renewable_forecast']:.1f} pts ({renewable_forecast_drop_pct:.0f}% predicted drop)",
        f"Storm probability contributes {storm_risk * weights['storm']:.1f} pts ({storm_probability_pct:.0f}% chance)",
        f"Predicted energy deficit contributes {deficit_risk * weights['deficit']:.1f} pts ({predicted_deficit_kw:.1f} kW vs {critical_load_kw:.0f} kW critical load)",
    ]

    return RiskBreakdown(
        score=score,
        level=level,
        factors={
            "battery_reserve_pct": round(battery_soc_pct, 1),
            "fuel_availability_pct": round(max(0, 100 - fuel_risk), 1),
            "renewable_forecast_pct": round(max(0, 100 - renewable_risk), 1),
            "weather_risk_pct": round(storm_risk, 1),
            "load_demand_pct": round(min(100, deficit_risk + 40), 1),
        },
        explanation=explanation,
    )


@dataclass
class FuelAutonomy:
    days: float
    hours: float
    fuel_in_tank_l: float
    predicted_daily_consumption_l: float
    autonomy_range_low_days: float
    autonomy_range_high_days: float


def compute_fuel_autonomy(
    fuel_liters: float,
    forecast_load_kw_24h: list[float],
    forecast_renewable_kw_24h: list[float],
) -> FuelAutonomy:
    n = max(1, len(forecast_load_kw_24h))
    hours_per_point = 24.0 / n
    total_deficit_kwh = 0.0
    for load, renew in zip(forecast_load_kw_24h, forecast_renewable_kw_24h):
        deficit = max(0.0, load - renew)
        total_deficit_kwh += deficit * hours_per_point

    daily_fuel_needed_l = total_deficit_kwh / CFG.diesel_efficiency_kwh_per_l if total_deficit_kwh > 0 else 0.01
    days = fuel_liters / daily_fuel_needed_l if daily_fuel_needed_l > 0 else 999.0
    days = round(min(days, 60.0), 1)

    return FuelAutonomy(
        days=days,
        hours=round(days * 24, 1),
        fuel_in_tank_l=round(fuel_liters, 1),
        predicted_daily_consumption_l=round(daily_fuel_needed_l, 1),
        autonomy_range_low_days=round(days * 0.85, 1),
        autonomy_range_high_days=round(days * 1.10, 1),
    )
