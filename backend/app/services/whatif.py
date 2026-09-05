"""
What-If Scenario Simulator
=============================
Given the current baseline state plus user-supplied deltas (solar %, wind %,
load %, battery capacity/SOC, fuel, storm probability/duration,
temperature), recomputes a 24h scenario forward-projection using the same
physical relationships as the live simulator, and compares it to the
unmodified baseline.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from app.config import station_config as CFG
from app.risk.risk import compute_risk_score, compute_fuel_autonomy


@dataclass
class ScenarioInput:
    solar_pct_change: float = 0.0     # e.g. -60 means -60%
    wind_pct_change: float = 0.0
    load_pct_change: float = 0.0
    battery_capacity_kwh: float | None = None
    starting_soc_pct: float | None = None
    fuel_liters: float | None = None
    storm_probability_pct: float | None = None
    storm_duration_hours: float = 8.0
    temperature_c_delta: float = 0.0
    horizon_hours: int = 24


@dataclass
class ScenarioOutput:
    fuel_required_l: float
    min_battery_soc_pct: float
    renewable_share_pct: float
    critical_load_status: str
    energy_deficit_kwh: float
    fuel_autonomy_days: float
    co2_increase_kg: float
    risk_score: int
    risk_level: str
    timeline: list[dict] = field(default_factory=list)


def _hourly_profile(recent_history: list[dict], key: str) -> list[float]:
    """
    Average `key` by hour-of-day across recent history to build a 24-value
    diurnal profile (e.g. solar is ~0 at hour 2, peaks near midday). Falls
    back to a flat profile if not enough history is available.
    """
    from datetime import datetime
    buckets: dict[int, list[float]] = {h: [] for h in range(24)}
    for row in recent_history:
        hour = datetime.fromisoformat(row["timestamp"]).hour
        buckets[hour].append(row[key])
    profile = []
    overall_avg = sum(row[key] for row in recent_history) / max(1, len(recent_history))
    for h in range(24):
        vals = buckets[h]
        profile.append(sum(vals) / len(vals) if vals else overall_avg)
    return profile


def run_scenario(baseline_tick: dict, scenario: ScenarioInput, recent_history: list[dict] | None = None) -> ScenarioOutput:
    from datetime import datetime

    soc = scenario.starting_soc_pct if scenario.starting_soc_pct is not None else baseline_tick["battery_soc_pct"]
    battery_capacity = scenario.battery_capacity_kwh or baseline_tick["battery_capacity_kwh"]
    fuel = scenario.fuel_liters if scenario.fuel_liters is not None else baseline_tick["diesel_fuel_liters"]
    storm_prob = scenario.storm_probability_pct if scenario.storm_probability_pct is not None \
        else baseline_tick["weather"]["storm_probability_pct"]

    hours_per_step = 1.0
    n_steps = int(scenario.horizon_hours)
    start_hour = datetime.fromisoformat(baseline_tick["timestamp"]).hour

    # Use a real diurnal profile (from recent history) instead of holding a
    # single instant's solar/wind flat across the whole horizon — solar must
    # still fall to ~0 at night even inside a "what-if" projection.
    if recent_history and len(recent_history) >= 48:
        solar_profile = _hourly_profile(recent_history, "solar_kw")
        wind_profile = _hourly_profile(recent_history, "wind_kw")
        load_profile = _hourly_profile(recent_history, "load_total_kw")
    else:
        solar_profile = [baseline_tick["solar_kw"]] * 24
        wind_profile = [baseline_tick["wind_kw"]] * 24
        load_profile = [baseline_tick["load_total_kw"]] * 24

    min_soc = soc
    total_deficit_kwh = 0.0
    total_fuel_l = 0.0
    total_renewable_kwh = 0.0
    total_load_kwh = 0.0
    timeline = []

    storm_active_steps = scenario.storm_duration_hours if storm_prob >= 50 else 0

    for step in range(n_steps):
        storm_now = step < storm_active_steps
        storm_derate = 0.75 if storm_now else 0.0  # storms cut renewables sharply
        hour_of_day = (start_hour + step) % 24

        solar = max(0.0, solar_profile[hour_of_day] * (1 + scenario.solar_pct_change / 100) * (1 - storm_derate))
        wind = max(0.0, wind_profile[hour_of_day] * (1 + scenario.wind_pct_change / 100) * (1 - storm_derate * 0.5))
        load = max(0.0, load_profile[hour_of_day] * (1 + scenario.load_pct_change / 100) *
                   (1 + max(0, -scenario.temperature_c_delta) * 0.005))

        renewable = solar + wind
        net = renewable - load
        total_renewable_kwh += renewable * hours_per_step
        total_load_kwh += load * hours_per_step

        if net >= 0:
            charge_kwh = min(net * hours_per_step, CFG.battery_max_charge_kw * hours_per_step)
            soc = min(100.0, soc + (charge_kwh * CFG.battery_charge_eff / battery_capacity) * 100)
        else:
            deficit_kw = -net
            headroom_kwh = max(0.0, (soc - CFG.battery_min_soc_pct) / 100 * battery_capacity)
            discharge_kwh = min(deficit_kw * hours_per_step, headroom_kwh, CFG.battery_max_discharge_kw * hours_per_step)
            soc = max(0.0, soc - (discharge_kwh / battery_capacity) * 100)
            remaining_kw = deficit_kw - (discharge_kwh / hours_per_step)
            if remaining_kw > 0.1:
                fuel_needed = min(fuel, (remaining_kw * hours_per_step) / CFG.diesel_efficiency_kwh_per_l)
                fuel -= fuel_needed
                total_fuel_l += fuel_needed
                covered_kw = fuel_needed * CFG.diesel_efficiency_kwh_per_l / hours_per_step
                still_short = remaining_kw - covered_kw
                if still_short > 0.1:
                    total_deficit_kwh += still_short * hours_per_step

        min_soc = min(min_soc, soc)
        timeline.append({
            "hour": step + 1, "solar_kw": round(solar, 1), "wind_kw": round(wind, 1),
            "load_kw": round(load, 1), "battery_soc_pct": round(soc, 1), "storm_active": storm_now,
        })

    renewable_share = (total_renewable_kwh / total_load_kwh * 100) if total_load_kwh > 0 else 0
    co2_increase_kg = total_fuel_l * CFG.co2_kg_per_liter_diesel

    critical_status = "SAFE"
    if min_soc < CFG.battery_min_soc_pct:
        critical_status = "AT RISK"
    if total_deficit_kwh > 0:
        critical_status = "CRITICAL SHORTFALL"

    autonomy = compute_fuel_autonomy(fuel, load_profile, [s + w for s, w in zip(solar_profile, wind_profile)])
    risk = compute_risk_score(
        battery_soc_pct=min_soc,
        fuel_liters=fuel,
        renewable_forecast_drop_pct=abs(min(0, scenario.solar_pct_change)),
        storm_probability_pct=storm_prob,
        predicted_deficit_kw=total_deficit_kwh / max(1, n_steps),
        critical_load_kw=baseline_tick["load_critical_kw"],
    )

    return ScenarioOutput(
        fuel_required_l=round(total_fuel_l, 1),
        min_battery_soc_pct=round(min_soc, 1),
        renewable_share_pct=round(renewable_share, 1),
        critical_load_status=critical_status,
        energy_deficit_kwh=round(total_deficit_kwh, 1),
        fuel_autonomy_days=autonomy.days,
        co2_increase_kg=round(co2_increase_kg, 1),
        risk_score=risk.score,
        risk_level=risk.level,
        timeline=timeline,
    )
