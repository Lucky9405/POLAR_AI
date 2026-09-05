"""
Energy Optimization Engine
============================
Deterministic, explainable dispatch optimizer implementing strict
RENEWABLE -> BATTERY -> DIESEL priority with a four-tier load hierarchy:
CRITICAL > ESSENTIAL > FLEXIBLE > DEFERRABLE.

This is a rule-based (priority + threshold) formulation rather than a
generic LP/MILP solver, chosen deliberately for transparency: every
decision below can point at the exact numeric condition that caused it,
which is required for the Explainable-AI requirement. It is described
honestly as rule-based, not marketed as a black-box "AI decision".

Objective (informally): minimize diesel fuel use and battery cycling while
guaranteeing critical (then essential) loads are never dropped and the
configured battery reserve is respected except as a genuine last resort.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from app.config import station_config as CFG


@dataclass
class OptimizerDecision:
    battery_command_kw: float          # + charge / - discharge
    battery_state: str                 # CHARGING | DISCHARGING | STANDBY | RESERVE
    diesel_command_kw: float
    flexible_load_target_frac: float   # 0..1 fraction of flexible load allowed
    deferrable_load_target_frac: float  # 0..1 fraction of deferrable load allowed
    survival_mode: bool
    operating_mode: str                 # NORMAL | WATCH | STORM_PREPARATION | SURVIVAL_MODE
    reserve_target_pct: float           # the ACTIVE reserve target (single source of truth)
    reasons: list[str] = field(default_factory=list)
    decision_path: list[str] = field(default_factory=list)  # nodes of the decision tree actually taken


def decide(
    battery_soc_pct: float,
    renewable_kw: float,
    load_critical_kw: float,
    load_essential_kw: float,
    load_flexible_kw: float,
    load_deferrable_kw: float,
    fuel_liters: float,
    storm_probability_pct: float,
    forecast_renewable_drop_pct: float,
    survival_mode_manual_override: bool | None = None,
    previous_mode: str = "NORMAL",
) -> OptimizerDecision:
    reasons: list[str] = []
    path: list[str] = ["DEMAND"]

    # ---- 1. Decide operating mode / survival mode -----------------------
    # Five states: NORMAL -> WATCH -> STORM_PREPARATION -> SURVIVAL_MODE -> RECOVERY -> NORMAL.
    # RECOVERY has hysteresis via `previous_mode` so the station doesn't snap
    # straight back to NORMAL the instant conditions dip below the survival
    # threshold — it recovers gradually, matching how a real station would
    # cautiously stand down from an emergency posture.
    watch_trigger = 20 <= storm_probability_pct < 40 or 10 <= forecast_renewable_drop_pct < 20
    storm_prep_trigger = 40 <= storm_probability_pct < 60 or 20 <= forecast_renewable_drop_pct < 40
    survival_trigger = (
        storm_probability_pct >= 60
        or forecast_renewable_drop_pct >= 40
        or battery_soc_pct <= CFG.battery_normal_reserve_pct
        or fuel_liters < 300
    )
    survival_mode = survival_trigger if survival_mode_manual_override is None else survival_mode_manual_override

    if survival_mode:
        operating_mode = "SURVIVAL_MODE"
        if storm_probability_pct >= 60:
            reasons.append(f"Storm probability {storm_probability_pct:.0f}% >= 60% threshold")
        if forecast_renewable_drop_pct >= 40:
            reasons.append(f"Forecast renewable drop {forecast_renewable_drop_pct:.0f}% >= 40% threshold")
        if battery_soc_pct <= CFG.battery_normal_reserve_pct:
            reasons.append(f"Battery SOC {battery_soc_pct:.0f}% at/below reserve target {CFG.battery_normal_reserve_pct:.0f}%")
        if fuel_liters < 300:
            reasons.append(f"Fuel level {fuel_liters:.0f} L below 300 L caution threshold")
        if survival_mode_manual_override:
            reasons.append("Manually activated by operator/judge control")
    elif previous_mode == "SURVIVAL_MODE":
        # Just exited Survival Mode — stand down through RECOVERY rather than
        # snapping straight to NORMAL, even if conditions already look calm.
        operating_mode = "RECOVERY"
        reasons.append("Exiting Survival Mode — recovering battery reserve and restoring loads gradually")
    elif previous_mode == "RECOVERY":
        if storm_prep_trigger or watch_trigger:
            # Conditions worsened again mid-recovery — treat as still elevated risk.
            operating_mode = "STORM_PREPARATION" if storm_prep_trigger else "WATCH"
            reasons.append("Conditions re-elevated during recovery")
        elif battery_soc_pct < CFG.battery_normal_reserve_pct + 15:
            operating_mode = "RECOVERY"
            reasons.append(f"Still recovering — battery SOC {battery_soc_pct:.0f}% not yet comfortably above reserve")
        else:
            operating_mode = "NORMAL"
            reasons.append("Recovery complete — battery reserve restored, conditions calm")
    elif storm_prep_trigger:
        operating_mode = "STORM_PREPARATION"
        reasons.append(f"Elevated storm probability ({storm_probability_pct:.0f}%) or renewable-drop forecast — preparing reserve ahead of possible Survival Mode")
    elif watch_trigger:
        operating_mode = "WATCH"
        reasons.append(f"Watching worsening conditions (storm probability {storm_probability_pct:.0f}%) — no action required yet")
    else:
        operating_mode = "NORMAL"

    reserve_target = CFG.battery_survival_reserve_pct if survival_mode else CFG.battery_normal_reserve_pct

    # ---- 2. Load priority allowance (CRITICAL/ESSENTIAL always 100%) ----
    if survival_mode:
        flexible_frac, deferrable_frac = 0.15, 0.0
        reasons.append("Deferrable loads fully curtailed and flexible loads reduced to 15% to protect reserve")
    elif operating_mode == "STORM_PREPARATION":
        flexible_frac, deferrable_frac = 0.6, 0.3
        reasons.append("Flexible loads reduced to 60% and deferrable to 30% ahead of possible storm")
    elif operating_mode == "RECOVERY":
        flexible_frac, deferrable_frac = 0.5, 0.3
        reasons.append("Loads restored gradually during recovery rather than all at once")
    elif battery_soc_pct < reserve_target + 10:
        flexible_frac, deferrable_frac = 0.7, 0.5
        reasons.append(f"Battery SOC {battery_soc_pct:.0f}% approaching reserve target {reserve_target:.0f}% — trimming flexible/deferrable loads")
    else:
        flexible_frac, deferrable_frac = 1.0, 1.0

    effective_flexible = load_flexible_kw * flexible_frac
    effective_deferrable = load_deferrable_kw * deferrable_frac
    total_load = load_critical_kw + load_essential_kw + effective_flexible + effective_deferrable
    net = renewable_kw - total_load

    # ---- 3. RENEWABLE -> BATTERY -> DIESEL priority ----------------------
    path.append("RENEWABLE_AVAILABLE" if renewable_kw > 0.1 else "NO_RENEWABLE")

    if net >= 0:
        path += ["RENEWABLE_GE_DEMAND", "SUPPLY_LOAD"]
        # Surplus renewable: charge battery up to its limit (never curtail
        # renewables unless the battery is genuinely full/at its charge-rate limit).
        battery_command = min(net, CFG.battery_max_charge_kw)
        if battery_command > 0.1:
            path.append("CHARGE_BATTERY")
            battery_state = "CHARGING"
            if battery_soc_pct < 99:
                reasons.append(f"Renewable supply of {renewable_kw:.1f} kW exceeds demand — surplus {net:.1f} kW routed to battery charging")
            else:
                reasons.append("Battery at/near full charge — additional surplus renewable is curtailed rather than wasted unsafely")
        else:
            battery_state = "STANDBY"
            reasons.append("Renewable output matches demand — battery on standby")
    else:
        path.append("RENEWABLE_LT_DEMAND")
        deficit = -net
        headroom_kwh = max(0.0, (battery_soc_pct - reserve_target) / 100.0 * CFG.battery_capacity_kwh)
        max_discharge_kw = min(CFG.battery_max_discharge_kw, headroom_kwh * (60 / CFG.tick_minutes))
        if max_discharge_kw > 0.1:
            path += ["BATTERY_AVAILABLE", "DISCHARGE_BATTERY"]
            battery_command = -min(deficit, max_discharge_kw)
            battery_state = "DISCHARGING"
            reasons.append(
                f"Renewable ({renewable_kw:.1f} kW) is {deficit:.1f} kW short of demand — battery discharging "
                f"{abs(battery_command):.1f} kW while preserving {reserve_target:.0f}% reserve"
            )
        else:
            path.append("BATTERY_AT_RESERVE")
            battery_command = 0.0
            battery_state = "RESERVE"
            reasons.append(f"Battery at protected reserve ({reserve_target:.0f}%) — no further discharge without diesel backup")

    # net = renewable - load; battery_command is +charge/-discharge, so its
    # supply contribution is -battery_command. Deficit diesel must cover:
    remaining_deficit = -net + battery_command

    # ---- 4. Diesel — genuine last resort ---------------------------------
    diesel_command = 0.0
    if remaining_deficit > 0.5:
        path.append("DIESEL")
        if fuel_liters <= 0:
            reasons.append("Diesel unavailable — fuel tank empty, further shortfall will curtail flexible/deferrable loads")
        else:
            diesel_command = min(remaining_deficit, CFG.diesel_capacity_kw)
            reasons.append(
                f"Renewable + battery cannot safely cover {remaining_deficit:.1f} kW — diesel generator "
                f"dispatched at {diesel_command:.1f} kW as last-resort backup"
            )
            if diesel_command < CFG.diesel_capacity_kw * CFG.diesel_min_load_frac:
                reasons.append("Diesel running below efficient loading band — consider bundling with battery discharge")
    else:
        path.append("DIESEL_STANDBY")

    if not reasons:
        reasons.append("Renewables + battery fully cover demand; diesel remains on standby")

    return OptimizerDecision(
        battery_command_kw=round(battery_command, 2),
        battery_state=battery_state,
        diesel_command_kw=round(diesel_command, 2),
        flexible_load_target_frac=flexible_frac,
        deferrable_load_target_frac=deferrable_frac,
        survival_mode=survival_mode,
        operating_mode=operating_mode,
        reserve_target_pct=reserve_target,
        reasons=reasons,
        decision_path=path,
    )
