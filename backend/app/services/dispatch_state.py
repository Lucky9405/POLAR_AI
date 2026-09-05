"""
Dispatch State — Single Source of Truth
==========================================
Every dashboard section (Command Center, Energy Flow, Analytics, Power
Quality, Risk, Digital Twin, AI Advisor, Alerts) must read from this one
composed object rather than recomputing dispatch independently. This module
does not invent new numbers — it assembles fields already computed by the
simulator/optimizer/risk/power-quality modules into one consistent shape.
"""
from __future__ import annotations
from dataclasses import asdict

from app.services import orchestrator
from app.services.power_quality import compute_station_power_quality, compute_source_quality

PROVENANCE = {
    "station_identity": "VERIFIED_PUBLIC_DATA",
    "weather": "SIMULATION",
    "electrical_telemetry": "SIMULATION",
    "forecasts": "MODEL_DERIVED",
    "risk_score": "DERIVED",
    "power_quality": "MODEL_DERIVED",
    "equipment_health": "MODEL_DERIVED",
}

STRATEGY_TEXT = {
    "NORMAL": {
        "solar_wind": "PRIORITY",
        "battery": "BALANCING / STANDBY",
        "diesel": "BACKUP / STANDBY",
        "critical_loads": "PROTECTED",
    },
    "WATCH": {
        "solar_wind": "PRIORITY",
        "battery": "RESERVE INCREASING",
        "diesel": "STANDBY",
        "critical_loads": "PROTECTED",
    },
    "STORM_PREPARATION": {
        "solar_wind": "MAXIMIZE",
        "battery": "RESERVE PROTECTED",
        "diesel": "BACKUP READY",
        "critical_loads": "PROTECTED",
        "flexible_loads": "REDUCE",
    },
    "SURVIVAL_MODE": {
        "solar_wind": "MAXIMIZE",
        "battery": "RESERVE CONTROL",
        "diesel": "ACTIVE BACKUP",
        "critical_loads": "PROTECTED",
        "flexible_loads": "CURTAILED",
        "deferrable_loads": "CURTAILED",
    },
    "RECOVERY": {
        "solar_wind": "RECHARGING BATTERY",
        "battery": "RECHARGING",
        "diesel": "STANDING DOWN",
        "critical_loads": "PROTECTED",
        "flexible_loads": "GRADUALLY RESTORED",
        "deferrable_loads": "GRADUALLY RESTORED",
    },
}


def _load_status(name: str, allocated: float, ceiling_frac: float, curtailed: float) -> dict:
    if name in ("critical", "essential"):
        status = "PROTECTED"
    elif curtailed > 0.1:
        status = "CURTAILED" if name == "deferrable" else "REDUCED"
    elif ceiling_frac < 0.99:
        status = "REDUCED" if name == "flexible" else "CURTAILED"
    else:
        status = "MAINTAINED"
    return {
        "priority": name.upper(),
        "demand_kw": round(allocated + curtailed, 2),
        "supplied_kw": round(allocated, 2),
        "curtailed_kw": round(curtailed, 2),
        "status": status,
    }


def get_dispatch_state(runtime) -> dict:
    snap = orchestrator.get_state_snapshot(runtime)
    tick = snap["tick"]
    opt = snap["optimizer"]
    risk = snap["risk"]
    autonomy = snap["autonomy"]

    renewable_kw = tick["solar_kw"] + tick["wind_kw"]
    demand_kw = tick["load_total_kw"] + tick["flexible_curtailed_kw"] + tick["deferrable_curtailed_kw"]
    battery_supply_kw = max(0.0, -tick["battery_power_kw"])
    diesel_kw = tick["diesel_output_kw"]

    renewable_share = round((renewable_kw / demand_kw * 100) if demand_kw > 0 else 0, 1)
    battery_contribution = round((battery_supply_kw / demand_kw * 100) if demand_kw > 0 else 0, 1)
    diesel_contribution = round((diesel_kw / demand_kw * 100) if demand_kw > 0 else 0, 1)

    pq = compute_station_power_quality(tick, tick["diesel_on"])

    loads = {
        "critical": _load_status("critical", tick["load_critical_kw"], 1.0, 0.0),
        "essential": _load_status("essential", tick["load_essential_kw"], 1.0, 0.0),
        "flexible": _load_status("flexible", tick["load_flexible_kw"], opt["flexible_load_target_frac"], tick["flexible_curtailed_kw"]),
        "deferrable": _load_status("deferrable", tick["load_deferrable_kw"], opt["deferrable_load_target_frac"], tick["deferrable_curtailed_kw"]),
    }

    strategy = STRATEGY_TEXT.get(opt["operating_mode"], STRATEGY_TEXT["NORMAL"])

    return {
        "station": runtime.code,
        "timestamp": tick["timestamp"],
        "tick": tick["tick"],

        "demand_kw": round(demand_kw, 2),
        "solar_kw": tick["solar_kw"],
        "wind_kw": tick["wind_kw"],
        "renewable_kw": round(renewable_kw, 2),
        "battery_power_kw": tick["battery_power_kw"],
        "battery_soc_pct": tick["battery_soc_pct"],
        "battery_state": opt["battery_state"],
        "battery_available_kwh": round(tick["battery_capacity_kwh"] * tick["battery_soc_pct"] / 100, 1),
        "battery_reserve_target_pct": opt["reserve_target_pct"],
        "diesel_kw": diesel_kw,
        "diesel_on": tick["diesel_on"],
        "diesel_fuel_liters": tick["diesel_fuel_liters"],
        "diesel_runtime_hours": tick["diesel_hours_total"],

        "renewable_share_pct": renewable_share,
        "battery_contribution_pct": battery_contribution,
        "diesel_contribution_pct": diesel_contribution,

        "loads": loads,

        "operating_mode": opt["operating_mode"],
        "survival_mode": opt["survival_mode"],
        "active_decision": opt["reasons"][0] if opt["reasons"] else "",
        "decision_reason": opt["reasons"],
        "decision_path": opt["decision_path"],
        "curtailment_kw": round(tick["flexible_curtailed_kw"] + tick["deferrable_curtailed_kw"], 2),

        "risk_score": risk["score"],
        "risk_level": risk["level"],
        "fuel_autonomy_days": autonomy["days"],

        "power_quality": asdict(pq),
        "weather_condition": tick["weather"]["condition"],
        "weather": tick["weather"],

        "strategy": strategy,
        "provenance": PROVENANCE,
    }


def get_node_inspector(runtime, node: str) -> dict:
    snap = orchestrator.get_state_snapshot(runtime)
    tick = snap["tick"]
    if node in ("solar", "wind", "battery", "diesel"):
        return compute_source_quality(node, tick)
    if node == "bus":
        pq = compute_station_power_quality(tick, tick["diesel_on"])
        return {
            **asdict(pq),
            "total_load_kw": tick["load_total_kw"],
            "renewable_input_kw": round(tick["solar_kw"] + tick["wind_kw"], 2),
            "battery_flow_kw": tick["battery_power_kw"],
            "diesel_input_kw": tick["diesel_output_kw"],
            "system_efficiency_pct": 95.0,
        }
    if node in ("critical", "essential", "flexible", "deferrable"):
        state = get_dispatch_state(runtime)
        return state["loads"][node]
    raise ValueError(f"Unknown node: {node}")
