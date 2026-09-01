"""
Predictive Maintenance
========================
Derives equipment health scores (0-100) from simulated operating history.
Deterministic and explainable — no black box.
"""
from __future__ import annotations
from dataclasses import dataclass
from app.config import station_config as CFG


@dataclass
class EquipmentHealth:
    name: str
    score: int
    status: str
    metrics: dict
    recommendation: str


def _status(score: int) -> str:
    if score >= 85:
        return "GOOD"
    if score >= 65:
        return "FAIR"
    if score >= 40:
        return "WARNING"
    return "CRITICAL"


def compute_equipment_health(history: list[dict]) -> list[EquipmentHealth]:
    if not history:
        return []

    recent = history[-min(len(history), 96):]  # last ~24h at 15-min ticks
    diesel_hours = history[-1]["diesel_hours_total"]
    battery_capacity_kwh = history[-1]["battery_capacity_kwh"]
    battery_capacity_frac = battery_capacity_kwh / CFG.battery_capacity_kwh

    # --- Solar ---
    solar_scores = [h["solar_kw"] for h in recent if h["weather"]["solar_irradiance_wm2"] > 300]
    solar_ratio = (
        sum(solar_scores) / max(1, len(solar_scores)) /
        max(1.0, CFG.solar_capacity_kw)
    ) if solar_scores else 1.0
    solar_health = int(min(100, max(0, solar_ratio * 100)))

    # --- Wind ---
    wind_active = [h["wind_kw"] for h in recent if h["weather"]["wind_speed_ms"] > 6]
    wind_ratio = (sum(wind_active) / max(1, len(wind_active)) / max(1.0, CFG.wind_capacity_kw)) if wind_active else 1.0
    wind_health = int(min(100, max(0, wind_ratio * 100)))

    # --- Battery ---
    battery_health = int(min(100, max(0, battery_capacity_frac * 100)))

    # --- Diesel ---
    diesel_wear = max(0.0, 100 - (diesel_hours / 20))  # arbitrary but documented: -1pt/20 operating hrs
    diesel_health = int(min(100, max(0, diesel_wear)))

    # --- Power conversion / inverters (proxy: consistency of renewable delivery vs weather) ---
    converter_health = int((solar_health + wind_health) / 2 * 0.95 + 5)

    results = [
        EquipmentHealth("Solar Array", solar_health, _status(solar_health),
                        {"avg_output_ratio_pct": round(solar_ratio * 100, 1)},
                        "Inspect panels for icing/soiling" if solar_health < 65 else "No action needed"),
        EquipmentHealth("Wind Turbines", wind_health, _status(wind_health),
                        {"avg_output_ratio_pct": round(wind_ratio * 100, 1)},
                        "Inspect turbine bearings/controller" if wind_health < 65 else "No action needed"),
        EquipmentHealth("Battery System", battery_health, _status(battery_health),
                        {"effective_capacity_kwh": round(battery_capacity_kwh, 1),
                         "capacity_retained_pct": round(battery_capacity_frac * 100, 1)},
                        "Schedule capacity test" if battery_health < 80 else "No action needed"),
        EquipmentHealth("Diesel Generator", diesel_health, _status(diesel_health),
                        {"operating_hours_total": round(diesel_hours, 1)},
                        "Schedule oil/filter service" if diesel_health < 60 else "No action needed"),
        EquipmentHealth("Power Converter", converter_health, _status(converter_health),
                        {}, "No action needed" if converter_health >= 65 else "Inspect inverter logs"),
    ]
    return results


def overall_health(items: list[EquipmentHealth]) -> str:
    if not items:
        return "UNKNOWN"
    avg = sum(i.score for i in items) / len(items)
    return _status(int(avg))
