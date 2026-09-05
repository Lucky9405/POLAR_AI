"""
Alert Lifecycle Engine
========================
Generates OPEN alerts from real thresholds in current state (not fake UI
placeholders), avoiding duplicate OPEN alerts for the same condition.
Acknowledge/resolve transitions are handled via the DB layer and exposed
through API endpoints.
"""
from __future__ import annotations
from app.database import db as DB


def evaluate_and_raise_alerts(station: str, tick: dict, risk: dict, optimizer_decision: dict, autonomy: dict):
    candidates = []

    if tick["weather"]["storm_probability_pct"] >= 60:
        candidates.append((
            "HIGH", "weather",
            "High Storm Probability",
            f"Storm likely within the forecast window. Probability: {tick['weather']['storm_probability_pct']:.0f}%.",
            "Review Polar Survival Mode readiness and pre-charge battery.",
        ))

    if optimizer_decision.get("survival_mode"):
        candidates.append((
            "CRITICAL", "optimizer",
            "Polar Survival Mode Active",
            "Elevated risk detected — reserve target raised and flexible loads reduced. Reasons: "
            + "; ".join(optimizer_decision.get("reasons", [])[:3]),
            "Monitor battery reserve and diesel readiness until conditions ease.",
        ))

    if tick["battery_soc_pct"] < 25:
        candidates.append((
            "HIGH", "battery",
            "Low Battery Reserve",
            f"Battery SOC at {tick['battery_soc_pct']:.0f}%, approaching minimum operating threshold.",
            "Charge battery via diesel or reduce flexible loads.",
        ))

    if autonomy["days"] < 3:
        candidates.append((
            "CRITICAL", "fuel",
            "Low Fuel Autonomy",
            f"Estimated fuel autonomy has dropped to {autonomy['days']} days.",
            "Restrict diesel use to essential dispatch only and re-check resupply schedule.",
        ))

    if tick["flexible_curtailed_kw"] > 0.5:
        candidates.append((
            "MODERATE", "load",
            "Flexible Load Curtailed",
            f"{tick['flexible_curtailed_kw']:.1f} kW of flexible load curtailed to protect critical/essential loads.",
            "No action required — automatic load-priority protection in effect.",
        ))

    if tick.get("deferrable_curtailed_kw", 0) > 0.5:
        candidates.append((
            "MODERATE", "load",
            "Deferrable Load Postponed",
            f"{tick['deferrable_curtailed_kw']:.1f} kW of deferrable load postponed to protect higher-priority loads.",
            "No action required — automatic load-priority protection in effect.",
        ))

    if risk["score"] >= 81:
        candidates.append((
            "CRITICAL", "risk",
            "Critical Energy Risk",
            f"Energy risk score at {risk['score']}/100 (CRITICAL).",
            "Immediate operator review recommended.",
        ))

    created = []
    for severity, source, title, description, action in candidates:
        if not DB.alert_exists_open(station, title):
            alert_id = DB.create_alert(station, severity, source, title, description, action)
            created.append(alert_id)
    return created
