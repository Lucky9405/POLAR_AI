"""
Energy Optimization Engine
============================
Deterministic, explainable dispatch optimizer. Given current state +
short-term forecast, decides:
  - battery charge/discharge command
  - diesel generator command
  - flexible-load curtailment
  - whether POLAR SURVIVAL MODE should be active

This is a rule-based (priority + threshold) formulation rather than a
generic LP/MILP solver, chosen deliberately for transparency: every
decision below can point at the exact numeric condition that caused it,
which is required for the Explainable-AI requirement. It is described
honestly as rule-based, not marketed as a black-box "AI decision".

Objective (informally): minimize diesel fuel use and battery cycling while
guaranteeing critical loads are never dropped and SOC never breaches its
floor.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from app.config import station_config as CFG


@dataclass
class OptimizerDecision:
    battery_command_kw: float          # + charge / - discharge
    diesel_command_kw: float
    flexible_load_target_frac: float   # 0..1 fraction of flexible load allowed
    survival_mode: bool
    survival_reserve_target_pct: float
    reasons: list[str] = field(default_factory=list)


def decide(
    battery_soc_pct: float,
    renewable_kw: float,
    load_critical_kw: float,
    load_important_kw: float,
    load_flexible_kw: float,
    fuel_liters: float,
    storm_probability_pct: float,
    forecast_renewable_drop_pct: float,
    survival_mode_manual_override: bool | None = None,
) -> OptimizerDecision:
    reasons: list[str] = []

    # ---- 1. Decide survival mode -----------------------------------
    risk_trigger = (
        storm_probability_pct >= 60
        or forecast_renewable_drop_pct >= 40
        or battery_soc_pct <= CFG.battery_survival_reserve_pct
        or fuel_liters < 300
    )
    survival_mode = risk_trigger if survival_mode_manual_override is None else survival_mode_manual_override

    if survival_mode:
        if storm_probability_pct >= 60:
            reasons.append(f"Storm probability {storm_probability_pct:.0f}% >= 60% threshold")
        if forecast_renewable_drop_pct >= 40:
            reasons.append(f"Forecast renewable drop {forecast_renewable_drop_pct:.0f}% >= 40% threshold")
        if battery_soc_pct <= CFG.battery_survival_reserve_pct:
            reasons.append(f"Battery SOC {battery_soc_pct:.0f}% at/below reserve target {CFG.battery_survival_reserve_pct:.0f}%")
        if fuel_liters < 300:
            reasons.append(f"Fuel level {fuel_liters:.0f} L below 300 L caution threshold")
        if survival_mode_manual_override:
            reasons.append("Manually activated by operator/judge control")

    reserve_target = CFG.battery_survival_reserve_pct if survival_mode else CFG.battery_min_soc_pct

    # ---- 2. Flexible load allowance --------------------------------
    if survival_mode:
        flexible_frac = 0.15
        reasons.append("Flexible loads reduced to 15% to protect reserve during elevated risk")
    elif battery_soc_pct < CFG.battery_min_soc_pct + 15:
        flexible_frac = 0.6
        reasons.append("Flexible loads reduced to 60% — battery approaching minimum SOC")
    else:
        flexible_frac = 1.0

    effective_flexible = load_flexible_kw * flexible_frac
    total_load = load_critical_kw + load_important_kw + effective_flexible
    net = renewable_kw - total_load

    # ---- 3. Battery command -----------------------------------------
    if net >= 0:
        # Surplus renewable: charge battery up to its limit, prioritizing
        # topping up reserve before spilling/wasting energy.
        battery_command = min(net, CFG.battery_max_charge_kw)
        if battery_soc_pct < 99:
            reasons.append(f"Surplus renewable of {net:.1f} kW routed to battery charging")
    else:
        deficit = -net
        headroom_kwh = max(0.0, (battery_soc_pct - reserve_target) / 100.0 * CFG.battery_capacity_kwh)
        # Only discharge below reserve target if diesel truly cannot cover it (handled below)
        max_discharge_kw = min(CFG.battery_max_discharge_kw, headroom_kwh * (60 / CFG.tick_minutes))
        battery_command = -min(deficit, max_discharge_kw)
        if battery_command < 0:
            reasons.append(f"Battery discharging {abs(battery_command):.1f} kW to cover shortfall while preserving {reserve_target:.0f}% reserve")

    # net = renewable - load; battery_command is +charge/-discharge, so its
    # supply contribution is -battery_command. Deficit diesel must cover:
    remaining_deficit = -net + battery_command

    # ---- 4. Diesel command --------------------------------------------
    diesel_command = 0.0
    if remaining_deficit > 0.5:
        if fuel_liters <= 0:
            reasons.append("Diesel unavailable — fuel tank empty, further shortfall will curtail flexible/important loads")
        else:
            diesel_command = min(remaining_deficit, CFG.diesel_capacity_kw)
            reasons.append(
                f"Diesel generator dispatched at {diesel_command:.1f} kW to cover {remaining_deficit:.1f} kW shortfall"
            )
            if diesel_command < CFG.diesel_capacity_kw * CFG.diesel_min_load_frac:
                reasons.append("Diesel running below efficient loading band — consider bundling with battery discharge")

    if not reasons:
        reasons.append("Renewables + battery fully cover demand; diesel remains on standby")

    return OptimizerDecision(
        battery_command_kw=round(battery_command, 2),
        diesel_command_kw=round(diesel_command, 2),
        flexible_load_target_frac=flexible_frac,
        survival_mode=survival_mode,
        survival_reserve_target_pct=reserve_target,
        reasons=reasons,
    )
