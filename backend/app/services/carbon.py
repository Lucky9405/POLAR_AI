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
    baseline_diesel_only_l: float
    diesel_reduction_pct: float
    assumption_note: str


def compute_carbon_summary(history: list[dict]) -> CarbonSummary:
    if not history:
        return CarbonSummary(0, 0, 0, 0, 0, CFG.co2_kg_per_liter_diesel, 0, 0,
                              "No simulation history yet.")

    total_load_kwh = sum(h["load_total_kw"] for h in history) * (CFG.tick_minutes / 60)
    total_renewable_kwh = sum(h["renewable_kw"] for h in history) * (CFG.tick_minutes / 60)

    # Diesel actually consumed WITHIN this window — fuel level at the start
    # of the selected range minus fuel level at the end, not against the
    # all-time initial tank level (which would be wrong for a 24h/7d slice
    # of a longer-running simulation).
    diesel_used_l = max(0.0, history[0]["diesel_fuel_liters"] - history[-1]["diesel_fuel_liters"])

    # Counterfactual: fuel that WOULD have been needed to cover the load
    # renewables actually served, had it all come from diesel instead.
    fuel_saved_l = (total_renewable_kwh / CFG.diesel_efficiency_kwh_per_l) if total_renewable_kwh > 0 else 0.0

    renewable_pct = (total_renewable_kwh / total_load_kwh * 100) if total_load_kwh > 0 else 0.0
    co2_emitted = diesel_used_l * CFG.co2_kg_per_liter_diesel
    co2_avoided = fuel_saved_l * CFG.co2_kg_per_liter_diesel

    # MINIMIZE DIESEL USE — baseline vs POLAR-AI comparison, computed from
    # the actual dataset: baseline = fuel required if diesel alone had to
    # cover 100% of the load in this window (no renewables/battery at all).
    baseline_diesel_only_l = total_load_kwh / CFG.diesel_efficiency_kwh_per_l if total_load_kwh > 0 else 0.0
    diesel_reduction_pct = (
        round((1 - diesel_used_l / baseline_diesel_only_l) * 100, 1)
        if baseline_diesel_only_l > 0 else 0.0
    )

    return CarbonSummary(
        diesel_consumed_l=round(diesel_used_l, 1),
        fuel_saved_l=round(fuel_saved_l, 1),
        renewable_pct=round(renewable_pct, 1),
        co2_emitted_kg=round(co2_emitted, 1),
        co2_avoided_kg=round(co2_avoided, 1),
        emissions_factor_kg_per_l=CFG.co2_kg_per_liter_diesel,
        baseline_diesel_only_l=round(baseline_diesel_only_l, 1),
        diesel_reduction_pct=diesel_reduction_pct,
        assumption_note=(
            "Estimated using a standard diesel combustion factor of "
            f"{CFG.co2_kg_per_liter_diesel} kg CO2 per litre. 'CO2 avoided' is the "
            "counterfactual emissions if renewable-served energy had instead been "
            "generated entirely by diesel. 'Baseline (diesel-only)' is the fuel a "
            "diesel-only station (no solar/wind/battery) would have burned to serve "
            "the same load over this window — SIMULATED/MODEL-DERIVED, not a claim "
            "about any real diesel-only station."
        ),
    )
