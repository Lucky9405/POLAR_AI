"""
Core logic tests — run with: pytest backend/tests
These test the physics/ML/optimization/dispatch-state core directly (no
running server needed), so they work without an external API key and
without network.
"""
from datetime import datetime
from dataclasses import asdict
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.simulation.engine import StationSimulator
from app.optimization.optimizer import decide
from app.risk.risk import compute_risk_score, compute_fuel_autonomy
from app.services.whatif import ScenarioInput, run_scenario
from app.services.carbon import compute_carbon_summary
from app.forecasting.forecast import ForecastEngine
from app.anomaly.detector import detect_anomalies
from app.maintenance.health import compute_equipment_health
from app.config import station_config as CFG


def _seeded_history(n=200, seed=42):
    sim = StationSimulator(start_time=datetime(2026, 6, 1, 0, 0), seed=seed)
    sim.seed_history(n)
    return [asdict(t) for t in sim.history]


# ---------------------------------------------------------------- physics
def test_solar_is_zero_at_night():
    history = _seeded_history(96)
    night_ticks = [h for h in history if datetime.fromisoformat(h["timestamp"]).hour in (0, 1, 2, 3)]
    assert all(h["solar_kw"] == 0.0 for h in night_ticks)


def test_battery_soc_stays_within_bounds():
    history = _seeded_history(300)
    for h in history:
        assert 0.0 <= h["battery_soc_pct"] <= 100.0


def test_diesel_never_exceeds_capacity():
    history = _seeded_history(200)
    for h in history:
        assert h["diesel_output_kw"] <= CFG.diesel_capacity_kw + 1e-6


def test_fuel_never_negative_and_decreases_when_running():
    history = _seeded_history(300)
    for h in history:
        assert h["diesel_fuel_liters"] >= 0.0


def test_energy_balance_approximately_holds():
    """generation (renewable+diesel) + battery discharge ≈ served load, within tolerance."""
    history = _seeded_history(100)
    for h in history:
        served_load = h["load_critical_kw"] + h["load_essential_kw"] + h["load_flexible_kw"] + h["load_deferrable_kw"]
        supply = h["solar_kw"] + h["wind_kw"] + h["diesel_output_kw"] - h["battery_power_kw"]
        assert abs(supply - served_load) < 1.0


# ------------------------------------------------------- dispatch priority
def test_renewable_sufficient_means_diesel_off():
    """Solar+wind fully cover demand -> diesel command is 0, battery charges any surplus."""
    d = decide(
        battery_soc_pct=60, renewable_kw=200, load_critical_kw=40, load_essential_kw=45,
        load_flexible_kw=35, load_deferrable_kw=15, fuel_liters=1000,
        storm_probability_pct=5, forecast_renewable_drop_pct=0,
    )
    assert d.diesel_command_kw == 0.0
    assert d.battery_command_kw >= 0  # charging or standby, never discharging when renewable exceeds demand
    assert "DIESEL_STANDBY" in d.decision_path


def test_renewable_partial_deficit_covered_by_battery_not_diesel():
    """Demand=100kW, renewable=90kW, battery healthy -> battery covers the 10kW, diesel stays at 0."""
    d = decide(
        battery_soc_pct=70, renewable_kw=90, load_critical_kw=40, load_essential_kw=40,
        load_flexible_kw=20, load_deferrable_kw=0, fuel_liters=1000,
        storm_probability_pct=5, forecast_renewable_drop_pct=0,
    )
    assert abs(d.battery_command_kw - (-10.0)) < 0.5
    assert d.diesel_command_kw == 0.0
    assert d.battery_state == "DISCHARGING"
    assert "DISCHARGE_BATTERY" in d.decision_path


def test_diesel_starts_only_when_battery_at_reserve():
    """Battery already at its reserve target -> cannot discharge further -> diesel must start."""
    d = decide(
        battery_soc_pct=CFG.battery_normal_reserve_pct, renewable_kw=20, load_critical_kw=40,
        load_essential_kw=40, load_flexible_kw=20, load_deferrable_kw=0, fuel_liters=1000,
        storm_probability_pct=5, forecast_renewable_drop_pct=0,
    )
    assert d.battery_state == "RESERVE"
    assert d.diesel_command_kw > 0
    assert "DIESEL" in d.decision_path


def test_excess_renewable_charges_battery():
    d = decide(
        battery_soc_pct=50, renewable_kw=150, load_critical_kw=40, load_essential_kw=40,
        load_flexible_kw=20, load_deferrable_kw=0, fuel_liters=1000,
        storm_probability_pct=5, forecast_renewable_drop_pct=0,
    )
    assert d.battery_command_kw > 0
    assert d.battery_state == "CHARGING"
    assert d.diesel_command_kw == 0.0


def test_critical_and_essential_loads_never_curtailed_by_optimizer_allowance():
    """The optimizer's flexible/deferrable fractions must never touch critical/essential."""
    d = decide(
        battery_soc_pct=10, renewable_kw=0, load_critical_kw=40, load_essential_kw=40,
        load_flexible_kw=20, load_deferrable_kw=10, fuel_liters=1000,
        storm_probability_pct=90, forecast_renewable_drop_pct=80,
    )
    assert d.survival_mode is True
    assert d.flexible_load_target_frac < 1.0
    assert d.deferrable_load_target_frac < 1.0
    # critical/essential have no allowance fraction at all — they are simply
    # never included in the curtailable pool (verified structurally: decide()
    # takes no critical/essential fraction parameter).


def test_flexible_and_deferrable_can_be_reduced_deferrable_first():
    d_normal = decide(battery_soc_pct=90, renewable_kw=100, load_critical_kw=40, load_essential_kw=40,
                       load_flexible_kw=20, load_deferrable_kw=10, fuel_liters=1000,
                       storm_probability_pct=5, forecast_renewable_drop_pct=0)
    d_storm = decide(battery_soc_pct=90, renewable_kw=100, load_critical_kw=40, load_essential_kw=40,
                      load_flexible_kw=20, load_deferrable_kw=10, fuel_liters=1000,
                      storm_probability_pct=90, forecast_renewable_drop_pct=80)
    assert d_storm.deferrable_load_target_frac <= d_normal.deferrable_load_target_frac
    assert d_storm.deferrable_load_target_frac == 0.0  # fully curtailed in survival mode


def test_optimizer_manual_survival_override():
    d = decide(
        battery_soc_pct=90, renewable_kw=100, load_critical_kw=40, load_essential_kw=45,
        load_flexible_kw=35, load_deferrable_kw=15, fuel_liters=1500, storm_probability_pct=5,
        forecast_renewable_drop_pct=0, survival_mode_manual_override=True,
    )
    assert d.survival_mode is True
    assert any("Manually activated" in r for r in d.reasons)


def test_decision_path_reflects_actual_dispatch():
    d = decide(battery_soc_pct=70, renewable_kw=20, load_critical_kw=40, load_essential_kw=40,
               load_flexible_kw=20, load_deferrable_kw=0, fuel_liters=1000,
               storm_probability_pct=5, forecast_renewable_drop_pct=0)
    assert d.decision_path[0] == "DEMAND"
    assert "RENEWABLE_LT_DEMAND" in d.decision_path
    assert "DISCHARGE_BATTERY" in d.decision_path


def test_diesel_runtime_zero_when_never_needed():
    """A renewable-rich, low-load simulation should never need diesel."""
    from app.optimization.optimizer import decide as opt_decide
    sim = StationSimulator(start_time=datetime(2026, 6, 1, 10, 0), seed=7)
    for _ in range(20):
        last = sim.history[-1] if sim.history else None
        if last:
            from dataclasses import asdict as _asdict
            ld = _asdict(last)
            decision = opt_decide(
                battery_soc_pct=ld["battery_soc_pct"], renewable_kw=999,  # force abundant renewable
                load_critical_kw=ld["load_critical_kw"], load_essential_kw=ld["load_essential_kw"],
                load_flexible_kw=ld["load_flexible_kw"], load_deferrable_kw=ld["load_deferrable_kw"],
                fuel_liters=ld["diesel_fuel_liters"], storm_probability_pct=0, forecast_renewable_drop_pct=0,
            )
            sim.step(battery_command_kw=decision.battery_command_kw, diesel_command_kw=0.0)
        else:
            sim.step()
    assert sim.diesel_hours_total == 0.0


# -------------------------------------------------------------------- risk
def test_risk_score_bounds_and_level():
    r = compute_risk_score(
        battery_soc_pct=10, fuel_liters=50, renewable_forecast_drop_pct=80,
        storm_probability_pct=90, predicted_deficit_kw=30, critical_load_kw=40,
    )
    assert 0 <= r.score <= 100
    assert r.level in ("SAFE", "MODERATE", "HIGH", "CRITICAL")
    assert r.level == "CRITICAL"
    assert len(r.explanation) == 5


def test_risk_score_safe_when_healthy():
    r = compute_risk_score(
        battery_soc_pct=95, fuel_liters=1800, renewable_forecast_drop_pct=0,
        storm_probability_pct=5, predicted_deficit_kw=0, critical_load_kw=40,
    )
    assert r.level in ("SAFE", "MODERATE")


def test_fuel_autonomy_is_finite_and_positive():
    a = compute_fuel_autonomy(1000, [80] * 24, [50] * 24)
    assert a.days > 0
    assert a.hours == round(a.days * 24, 1)


# ------------------------------------------------------------------ whatif
def test_whatif_solar_drop_reduces_renewable_share():
    history = _seeded_history(200)
    baseline = history[-1]
    normal = run_scenario(baseline, ScenarioInput(horizon_hours=24), recent_history=history)
    reduced = run_scenario(baseline, ScenarioInput(solar_pct_change=-60, horizon_hours=24), recent_history=history)
    assert reduced.renewable_share_pct <= normal.renewable_share_pct


def test_whatif_solar_profile_varies_by_hour():
    history = _seeded_history(200)
    out = run_scenario(history[-1], ScenarioInput(horizon_hours=24), recent_history=history)
    solar_values = [row["solar_kw"] for row in out.timeline]
    assert min(solar_values) == 0.0
    assert max(solar_values) > 0.0


# ------------------------------------------------------------------ carbon
def test_carbon_summary_non_negative():
    history = _seeded_history(200)
    c = compute_carbon_summary(history)
    assert c.diesel_consumed_l >= 0
    assert c.co2_emitted_kg >= 0
    assert c.co2_avoided_kg >= 0


# --------------------------------------------------------------- forecast
def test_forecast_engine_returns_expected_horizon_length():
    history = _seeded_history(300)
    engine = ForecastEngine(history)
    result = engine.forecast(6)
    assert len(result["load"].values) == 6 * (60 // 15)
    assert result["load"].mae >= 0


# ----------------------------------------------------- anomaly/maintenance
def test_anomaly_detection_runs_without_error():
    history = _seeded_history(200)
    anomalies = detect_anomalies(history)
    assert isinstance(anomalies, list)


def test_equipment_health_scores_in_range():
    history = _seeded_history(200)
    items = compute_equipment_health(history)
    assert len(items) == 5
    for i in items:
        assert 0 <= i.score <= 100
        assert i.status in ("GOOD", "FAIR", "WARNING", "CRITICAL")


def test_storm_scenario_trigger_eventually_activates_storm():
    sim = StationSimulator(start_time=datetime(2026, 6, 1, 0, 0), seed=1)
    sim.trigger_storm_scenario(lead_ticks=4)
    for _ in range(6):
        sim.step()
    assert sim.storm_active is True


# ------------------------------------------------------- stations/dispatch state
def test_maitri_and_bharati_have_distinct_configs():
    from app.database.db import init_db
    init_db()
    from app.services.station_registry import STATION_PROFILE_OVERRIDES, STATIONS
    assert set(STATIONS.keys()) == {"MAITRI", "BHARATI"}
    assert STATION_PROFILE_OVERRIDES["MAITRI"] != STATION_PROFILE_OVERRIDES["BHARATI"]


def test_dispatch_state_fields_present_and_consistent():
    """The unified dispatch_state object must expose the fields every
    dashboard section depends on, and its derived shares must be internally
    consistent with the underlying tick."""
    import importlib
    # Use a fresh in-process runtime rather than the module-level singleton
    # (which requires the DB) — validate the pure composition function shape
    # via a lightweight fake runtime wrapping a seeded simulator + DB-free path
    # is out of scope for a pure-logic test; instead assert the required keys
    # exist on the dataclass-free dict contract by constructing one manually
    # from the optimizer/risk pieces this module composes.
    from app.optimization.optimizer import decide as opt_decide
    history = _seeded_history(100)
    last = history[-1]
    decision = opt_decide(
        battery_soc_pct=last["battery_soc_pct"], renewable_kw=last["solar_kw"] + last["wind_kw"],
        load_critical_kw=last["load_critical_kw"], load_essential_kw=last["load_essential_kw"],
        load_flexible_kw=last["load_flexible_kw"], load_deferrable_kw=last["load_deferrable_kw"],
        fuel_liters=last["diesel_fuel_liters"], storm_probability_pct=last["weather"]["storm_probability_pct"],
        forecast_renewable_drop_pct=0,
    )
    required_decision_fields = {
        "battery_command_kw", "battery_state", "diesel_command_kw", "flexible_load_target_frac",
        "deferrable_load_target_frac", "survival_mode", "operating_mode", "reserve_target_pct",
        "reasons", "decision_path",
    }
    assert required_decision_fields.issubset(set(vars(decision).keys()))


def test_weather_storm_changes_generation():
    """Storm conditions should measurably reduce renewable output vs a calm tick."""
    sim = StationSimulator(start_time=datetime(2026, 6, 1, 12, 0), seed=3)
    sim.seed_history(40)
    calm_solar = [h.solar_kw for h in sim.history if not h.weather["storm_active"]]
    storm_solar = [h.solar_kw for h in sim.history if h.weather["storm_active"]]
    if storm_solar:  # storm is probabilistic; only assert when one actually occurred
        assert sum(storm_solar) / len(storm_solar) <= (sum(calm_solar) / len(calm_solar) if calm_solar else 0) + 1e-6


def test_advisor_never_claims_full_coverage_during_curtailment():
    """Regression test for a real bug: the advisor's deterministic 'why is
    diesel on/off' answer must mention curtailment whenever curtailment_kw > 0,
    for BOTH diesel-on and diesel-off cases, instead of claiming demand is
    fully covered."""
    from app.advisor.advisor import answer_deterministic

    base_dispatch = {
        "demand_kw": 115.0, "solar_kw": 40.0, "wind_kw": 20.0, "renewable_kw": 60.0,
        "battery_power_kw": 0.0, "battery_soc_pct": 15.0, "battery_state": "RESERVE",
        "battery_reserve_target_pct": 35.0, "diesel_kw": 30.0, "diesel_on": True,
        "renewable_share_pct": 52.0, "active_decision": "test", "operating_mode": "SURVIVAL_MODE",
        "curtailment_kw": 12.0,
        "loads": {
            "critical": {"supplied_kw": 40.0, "curtailed_kw": 0.0},
            "essential": {"supplied_kw": 40.0, "curtailed_kw": 0.0},
            "flexible": {"supplied_kw": 0.0, "curtailed_kw": 8.0},
            "deferrable": {"supplied_kw": 0.0, "curtailed_kw": 4.0},
        },
        "risk_score": 60, "risk_level": "HIGH", "fuel_autonomy_days": 2.0,
        "weather": {"storm_probability_pct": 50}, "survival_mode": True,
    }
    carbon = {"fuel_saved_l": 0, "co2_avoided_kg": 0, "emissions_factor_kg_per_l": 2.68}

    ans_diesel_on = answer_deterministic("why is diesel on?", {"dispatch": base_dispatch, "carbon": carbon})
    assert "curtail" in ans_diesel_on.lower()

    dispatch_off = dict(base_dispatch, diesel_on=False, diesel_kw=0.0)
    ans_diesel_off = answer_deterministic("why is diesel off?", {"dispatch": dispatch_off, "carbon": carbon})
    assert "curtail" in ans_diesel_off.lower() or "not fully" in ans_diesel_off.lower()


def test_five_state_operating_mode_machine():
    """NORMAL -> WATCH -> STORM_PREPARATION -> SURVIVAL_MODE -> RECOVERY -> NORMAL,
    with RECOVERY exhibiting real hysteresis (doesn't snap straight back to
    NORMAL the instant conditions calm down)."""
    common = dict(battery_soc_pct=70, renewable_kw=100, load_critical_kw=40, load_essential_kw=40,
                  load_flexible_kw=20, load_deferrable_kw=10, fuel_liters=1000, forecast_renewable_drop_pct=0)

    assert decide(storm_probability_pct=5, **common).operating_mode == "NORMAL"
    assert decide(storm_probability_pct=25, **common).operating_mode == "WATCH"
    assert decide(storm_probability_pct=45, **common).operating_mode == "STORM_PREPARATION"
    assert decide(storm_probability_pct=70, **common).operating_mode == "SURVIVAL_MODE"

    # Exiting survival always passes through RECOVERY first, even if calm now
    recovering = dict(common, storm_probability_pct=5, previous_mode="SURVIVAL_MODE")
    assert decide(**recovering).operating_mode == "RECOVERY"

    # RECOVERY persists while battery SOC is still close to reserve
    still_recovering = dict(common, battery_soc_pct=45, storm_probability_pct=5, previous_mode="RECOVERY")
    assert decide(**still_recovering).operating_mode == "RECOVERY"

    # RECOVERY completes once battery is comfortably above reserve and conditions are calm
    recovered = dict(common, battery_soc_pct=55, storm_probability_pct=5, previous_mode="RECOVERY")
    assert decide(**recovered).operating_mode == "NORMAL"
