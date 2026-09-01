"""
Carbon Analytics
==================
All figures are ESTIMATES based on the simulated diesel consumption and a
documented emissions factor (2.68 kg CO2 per litre of diesel combusted —
a standard, widely-cited figure for automotive/generator diesel). These are
not measured emissions from any real facility.
"""
from __future__ import annotations
from dataclasses import dataclass
from app.config import station_config as CFG


@dataclass
class CarbonSummary:
    diesel_consumed_l: float
    fuel_saved_l: float
    renewable_pct: float
    co2_emitted_kg: float
    co2_avoided_kg: float
    emissions_factor_kg_per_l: float
    assumption_note: str


def compute_carbon_summary(history: list[dict]) -> CarbonSummary:
    if not history:
        return CarbonSummary(0, 0, 0, 0, 0, CFG.co2_kg_per_liter_diesel,
                              "No simulation history yet.")

    total_load_kwh = sum(h["load_total_kw"] for h in history) * (CFG.tick_minutes / 60)
    total_renewable_kwh = sum(h["renewable_kw"] for h in history) * (CFG.tick_minutes / 60)
    diesel_used_l = CFG.initial_fuel_liters - history[-1]["diesel_fuel_liters"]
    diesel_used_l = max(0.0, diesel_used_l)

    # Counterfactual: fuel that WOULD have been needed to cover the load
    # renewables actually served, had it all come from diesel instead.
    fuel_saved_l = (total_renewable_kwh / CFG.diesel_efficiency_kwh_per_l) if total_renewable_kwh > 0 else 0.0

    renewable_pct = (total_renewable_kwh / total_load_kwh * 100) if total_load_kwh > 0 else 0.0
    co2_emitted = diesel_used_l * CFG.co2_kg_per_liter_diesel
    co2_avoided = fuel_saved_l * CFG.co2_kg_per_liter_diesel

    return CarbonSummary(
        diesel_consumed_l=round(diesel_used_l, 1),
        fuel_saved_l=round(fuel_saved_l, 1),
        renewable_pct=round(renewable_pct, 1),
        co2_emitted_kg=round(co2_emitted, 1),
        co2_avoided_kg=round(co2_avoided, 1),
        emissions_factor_kg_per_l=CFG.co2_kg_per_liter_diesel,
        assumption_note=(
            "Estimated using a standard diesel combustion factor of "
            f"{CFG.co2_kg_per_liter_diesel} kg CO2 per litre. 'CO2 avoided' is the "
            "counterfactual emissions if renewable-served energy had instead been "
            "generated entirely by diesel."
        ),
    )
