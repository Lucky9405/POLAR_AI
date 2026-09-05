from __future__ import annotations
from fastapi import APIRouter, HTTPException

from app.services.station_registry import manager, STATIONS, DATA_PROVENANCE
from app.services import orchestrator, dispatch_state as DS
from app.services.whatif import ScenarioInput, run_scenario
from app.services.carbon import compute_carbon_summary
from app.anomaly.detector import detect_anomalies
from app.maintenance.health import compute_equipment_health, overall_health
from app.advisor.advisor import answer as advisor_answer
from app.database import db as DB
from app.schemas.models import (
    StationSwitchRequest, SimulationControlRequest, WhatIfRequest,
    AdvisorQuestion, AlertActionRequest, SurvivalModeRequest, StormScenarioRequest,
)
from dataclasses import asdict

router = APIRouter()


def _runtime():
    return manager.active()


def _runtime_for(station: str | None):
    """Read-only lookup of any station's runtime WITHOUT changing which
    station is active — used by analytics endpoints that support a
    Maitri/Bharati/Both comparison without disturbing the rest of the app."""
    if not station:
        return manager.active()
    code = station.upper()
    if code not in manager.runtimes:
        raise HTTPException(400, f"Unknown station '{station}'. Valid: {list(manager.runtimes)}")
    return manager.runtimes[code]


# ------------------------------------------------------------- station mgmt
@router.get("/stations")
def list_stations():
    return {
        "stations": [asdict(s) for s in STATIONS.values()],
        "active": manager.active_code,
        "data_provenance": DATA_PROVENANCE,
    }


@router.post("/stations/switch")
def switch_station(req: StationSwitchRequest):
    try:
        rt = manager.set_active(req.station)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"active": rt.code, "identity": asdict(rt.identity)}


# ------------------------------------------------------------------- status
@router.get("/status")
def station_status():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    state = DS.get_dispatch_state(rt)
    return {"station": rt.code, "identity": asdict(rt.identity), "mode": rt.mode, **snap,
            "dispatch_state": state, "data_provenance": DATA_PROVENANCE}


@router.get("/energy/current")
def current_energy():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    return snap["tick"]


RANGE_TICKS = {"6h": 24, "24h": 96, "7d": 672, "30d": 672}  # 30d capped to available seeded history (7d) — labeled honestly, not fabricated


@router.get("/energy/history")
def energy_history(limit: int = 200, range: str | None = None, station: str | None = None):
    """`range` (24h|7d|30d) overrides `limit` with a sensible tick count.
    `station` = MAITRI | BHARATI | BOTH (BOTH returns both stations' series
    for comparison; a single station preserves the previous flat shape)."""
    n = RANGE_TICKS.get(range, limit) if range else limit
    capped_note = None
    if range == "30d":
        capped_note = "Simulated history currently covers up to 7 days since station startup; 30D view shows the full available window rather than fabricating older data."

    if station and station.upper() == "BOTH":
        result = {code: DB.get_recent_telemetry(code, limit=n) for code in manager.runtimes}
        return {"history_by_station": result, "range": range or "custom", "note": capped_note}

    rt = _runtime_for(station)
    return {"history": DB.get_recent_telemetry(rt.code, limit=n), "range": range or "custom", "note": capped_note}


# --------------------------------------------------------------- simulation
@router.post("/simulation/control")
def simulation_control(req: SimulationControlRequest):
    rt = _runtime()
    if req.action == "start":
        rt.running = True
    elif req.action == "pause":
        rt.running = False
    elif req.action == "reset":
        from app.services.station_registry import StationRuntime
        manager.runtimes[rt.code] = StationRuntime(rt.code)
    else:
        raise HTTPException(400, "action must be start|pause|reset")
    if req.speed:
        rt.speed_multiplier = req.speed
    return {"running": rt.running, "speed": rt.speed_multiplier}


@router.post("/simulation/tick")
def simulation_tick(steps: int = 1):
    rt = _runtime()
    result = None
    for _ in range(max(1, min(steps, 50))):
        result = orchestrator.advance_tick(rt)
    return result


@router.post("/simulation/storm-scenario")
def launch_storm_scenario(req: StormScenarioRequest):
    rt = _runtime()
    rt.simulator.trigger_storm_scenario(lead_ticks=req.lead_ticks)
    DB.insert_scenario_event(rt.code, "STORM_SCENARIO_LAUNCHED", {"lead_ticks": req.lead_ticks})
    return {"status": "scheduled", "lead_ticks": req.lead_ticks}


# -------------------------------------------------------------------- risk
@router.get("/risk")
def get_risk():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    return snap["risk"]


@router.get("/fuel/autonomy")
def get_autonomy():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    return snap["autonomy"]


# --------------------------------------------------------------- optimizer
@router.get("/optimizer/decision")
def get_optimizer_decision():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    return snap["optimizer"]


@router.post("/optimizer/survival-mode")
def set_survival_mode(req: SurvivalModeRequest):
    rt = _runtime()
    result = orchestrator.advance_tick(rt, survival_override=req.activate)
    return result


# -------------------------------------------------------------- forecasting
@router.get("/forecast/{horizon}")
def get_forecast(horizon: int):
    if horizon not in (1, 6, 24):
        raise HTTPException(400, "horizon must be 1, 6, or 24")
    rt = _runtime()
    return orchestrator.get_forecast(rt, horizon)


# ----------------------------------------------------------------- what-if
@router.post("/whatif/run")
def whatif_run(req: WhatIfRequest):
    rt = _runtime()
    recent = DB.get_recent_telemetry(rt.code, limit=200)
    if not recent:
        raise HTTPException(400, "No baseline telemetry yet")
    baseline = recent[-1]
    scenario = ScenarioInput(**{k: v for k, v in req.dict().items() if k != "scenario_name"})
    output = run_scenario(baseline, scenario, recent_history=recent)
    DB.save_whatif(rt.code, req.dict(), asdict(output))
    return {"baseline": baseline, "scenario": asdict(output)}


@router.get("/whatif/history")
def whatif_history(limit: int = 20):
    rt = _runtime()
    return {"history": DB.list_whatif(rt.code, limit=limit)}


# ---------------------------------------------------------------- anomalies
@router.get("/anomalies")
def get_anomalies():
    rt = _runtime()
    history = DB.get_recent_telemetry(rt.code, limit=500)
    anomalies = [asdict(a) for a in detect_anomalies(history)]
    DB.insert_anomalies(rt.code, anomalies)
    return {"anomalies": anomalies}


# -------------------------------------------------------------- maintenance
@router.get("/equipment/health")
def get_equipment_health():
    rt = _runtime()
    history = DB.get_recent_telemetry(rt.code, limit=200)
    items = [asdict(i) for i in compute_equipment_health(history)]
    DB.insert_equipment_health(rt.code, items)
    return {"equipment": items, "overall": overall_health(compute_equipment_health(history))}


# ------------------------------------------------------------------ alerts
@router.get("/alerts")
def get_alerts(status: str | None = None):
    rt = _runtime()
    return {"alerts": DB.list_alerts(rt.code, status=status)}


@router.post("/alerts/acknowledge")
def acknowledge_alert(req: AlertActionRequest):
    ok = DB.update_alert_status(req.alert_id, "ACKNOWLEDGED")
    if not ok:
        raise HTTPException(404, "Alert not found")
    return {"status": "ACKNOWLEDGED"}


@router.post("/alerts/resolve")
def resolve_alert(req: AlertActionRequest):
    ok = DB.update_alert_status(req.alert_id, "RESOLVED")
    if not ok:
        raise HTTPException(404, "Alert not found")
    return {"status": "RESOLVED"}


# ------------------------------------------------------------------ carbon
@router.get("/analytics/carbon")
def carbon_analytics(station: str | None = None, range: str | None = None):
    n = RANGE_TICKS.get(range, 5000) if range else 5000
    if station and station.upper() == "BOTH":
        return {code: asdict(compute_carbon_summary(DB.get_recent_telemetry(code, limit=n)))
                for code in manager.runtimes}
    rt = _runtime_for(station)
    history = DB.get_recent_telemetry(rt.code, limit=n)
    summary = asdict(compute_carbon_summary(history))
    diesel_ticks = sum(1 for h in history if h["diesel_on"])
    summary["dispatch_strategy"] = "RENEWABLE -> BATTERY -> DIESEL (last resort)"
    summary["diesel_required_pct_of_ticks"] = round((diesel_ticks / len(history) * 100) if history else 0, 1)
    return summary


# ------------------------------------------------------------ dispatch state
@router.get("/dispatch/state")
def dispatch_state():
    """Single source-of-truth dispatch state — every dashboard section should
    read from this endpoint (or the equivalent fields embedded in /status)
    rather than recomputing dispatch independently."""
    rt = _runtime()
    return DS.get_dispatch_state(rt)


@router.get("/power-quality")
def power_quality():
    rt = _runtime()
    state = DS.get_dispatch_state(rt)
    return state["power_quality"]


@router.get("/power-quality/history")
def power_quality_history(range: str = "24h"):
    from app.services.power_quality import compute_pq_history
    rt = _runtime()
    n = RANGE_TICKS.get(range, 96)
    history = DB.get_recent_telemetry(rt.code, limit=n)
    return {"series": compute_pq_history(history), "range": range,
            "note": "30D view shows the full available simulated window (up to 7 days)" if range == "30d" else None}


@router.get("/power-quality/events")
def power_quality_events(range: str = "7d", limit: int = 50):
    from app.services.power_quality import compute_pq_events
    rt = _runtime()
    n = RANGE_TICKS.get(range, 672)
    history = DB.get_recent_telemetry(rt.code, limit=n)
    return {"events": compute_pq_events(history, limit=limit)}


@router.get("/power-quality/sources")
def power_quality_sources():
    rt = _runtime()
    snap = orchestrator.get_state_snapshot(rt)
    tick = snap["tick"]
    from app.services.power_quality import compute_source_quality, compute_station_power_quality
    from dataclasses import asdict as _asdict
    return {
        "bus": _asdict(compute_station_power_quality(tick, tick["diesel_on"])),
        "solar": compute_source_quality("solar", tick),
        "wind": compute_source_quality("wind", tick),
        "battery": compute_source_quality("battery", tick),
        "diesel": compute_source_quality("diesel", tick),
    }


@router.get("/nodes/{node}")
def node_inspector(node: str):
    rt = _runtime()
    try:
        return DS.get_node_inspector(rt, node)
    except ValueError as e:
        raise HTTPException(404, str(e))


# ------------------------------------------------------------- digital twin
@router.get("/digital-twin")
def digital_twin():
    rt = _runtime()
    state = DS.get_dispatch_state(rt)
    loads = state["loads"]
    return {
        "station": rt.code,
        "nodes": {
            "solar": {"output_kw": state["solar_kw"], "active": state["solar_kw"] > 0.5},
            "wind": {"output_kw": state["wind_kw"], "active": state["wind_kw"] > 0.5},
            "battery": {"soc_pct": state["battery_soc_pct"], "power_kw": state["battery_power_kw"],
                        "state": state["battery_state"]},
            "diesel": {"on": state["diesel_on"], "output_kw": state["diesel_kw"],
                       "fuel_liters": state["diesel_fuel_liters"]},
            "critical_load": loads["critical"],
            "essential_load": loads["essential"],
            "flexible_load": loads["flexible"],
            "deferrable_load": loads["deferrable"],
        },
        "flows": {
            "solar_to_bus": state["solar_kw"],
            "wind_to_bus": state["wind_kw"],
            "battery_to_bus": max(0, -state["battery_power_kw"]),
            "bus_to_battery": max(0, state["battery_power_kw"]),
            "diesel_to_bus": state["diesel_kw"],
        },
        "mode": state["operating_mode"],
        "provenance": state["provenance"],
    }


# ------------------------------------------------------------------ advisor
@router.post("/advisor/ask")
def advisor_ask(req: AdvisorQuestion):
    rt = _runtime()
    carbon = compute_carbon_summary(DB.get_recent_telemetry(rt.code, limit=5000))
    state = {
        "dispatch": DS.get_dispatch_state(rt),
        "carbon": asdict(carbon),
    }
    result = advisor_answer(req.question, state)
    DB.insert_advisor_conversation(rt.code, req.question, result["answer"], result["source"])
    return result


@router.get("/advisor/history")
def advisor_history(limit: int = 50):
    rt = _runtime()
    return {"history": DB.list_advisor_conversations(rt.code, limit=limit)}
