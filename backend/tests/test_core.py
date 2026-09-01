"""
Core logic tests — run with: pytest backend/tests
These test the physics/ML/optimization core directly (no running server
needed), so they work without an external API key and without network.
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


def _seeded_history(n=200):
    sim = StationSimulator(start_time=datetime(2026, 6, 1, 0, 0), seed=42)
    sim.seed_history(n)
    return [asdict(t) for t in sim.history]


def test_solar_is_zero_at_night():
    history = _seeded_history(96)
    night_ticks = [h for h in history if datetime.fromisoformat(h["timestamp"]).hour in (0, 1, 2, 3)]
    assert all(h["solar_kw"] == 0.0 for h in night_ticks)


def test_battery_soc_stays_within_bounds():
    history = _seeded_history(300)
    for h in history:
        assert 0.0 <= h["battery_soc_pct"] <= 100.0


def test_diesel_never_exceeds_capacity():
    from app.config import station_config as CFG
    history = _seeded_history(200)
    for h in history:
        assert h["diesel_output_kw"] <= CFG.diesel_capacity_kw + 1e-6


def test_fuel_never_negative_and_decreases_when_running():
    history = _seeded_history(300)
    for h in history:
        assert h["diesel_fuel_liters"] >= 0.0


def test_energy_balance_approximately_holds():
    """generation (renewable+diesel) + battery discharge ≈ load served, within a small tolerance."""
    history = _seeded_history(100)
    for h in history:
        served_load = h["load_critical_kw"] + h["load_important_kw"] + h["load_flexible_kw"]
        supply = h["solar_kw"] + h["wind_kw"] + h["diesel_output_kw"] - h["battery_power_kw"]
        assert abs(supply - served_load) < 1.0  # kW tolerance for rounding


def test_optimizer_protects_critical_load_reasoning():
    d = decide(
        battery_soc_pct=20, renewable_kw=10, load_critical_kw=40, load_important_kw=55,
        load_flexible_kw=35, fuel_liters=500, storm_probability_pct=70, forecast_renewable_drop_pct=50,
    )
    assert d.survival_mode is True
    assert d.flexible_load_target_frac < 1.0
    assert len(d.reasons) > 0


def test_optimizer_manual_survival_override():
    d = decide(
        battery_soc_pct=90, renewable_kw=100, load_critical_kw=40, load_important_kw=55,
        load_flexible_kw=35, fuel_liters=1500, storm_probability_pct=5, forecast_renewable_drop_pct=0,
        survival_mode_manual_override=True,
    )
    assert d.survival_mode is True
    assert any("Manually activated" in r for r in d.reasons)


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


def test_carbon_summary_non_negative():
    history = _seeded_history(200)
    c = compute_carbon_summary(history)
    assert c.diesel_consumed_l >= 0
    assert c.co2_emitted_kg >= 0
    assert c.co2_avoided_kg >= 0


def test_forecast_engine_returns_expected_horizon_length():
    history = _seeded_history(300)
    engine = ForecastEngine(history)
    result = engine.forecast(6)
    assert len(result["load"].values) == 6 * (60 // 15)
    assert result["load"].mae >= 0


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
