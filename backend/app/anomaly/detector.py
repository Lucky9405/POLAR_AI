"""
Anomaly Detection
===================
Uses scikit-learn's IsolationForest over recent telemetry to flag abnormal
load spikes, renewable generation anomalies, battery irregularities and
generator inefficiency. Includes a simple rule layer to attach a
human-readable "possible cause" to each flagged point (IsolationForest
itself only tells you *that* something is unusual, not *why*).
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from sklearn.ensemble import IsolationForest


@dataclass
class Anomaly:
    timestamp: str
    severity: str
    metric: str
    value: float
    anomaly_score: float
    possible_cause: str
    recommendation: str


def _cause_and_recommendation(row: dict, feature_name: str) -> tuple[str, str]:
    if feature_name == "load_total_kw":
        return ("Unexpected load spike — possible equipment fault or unscheduled activity",
                "Inspect important/flexible load circuits for the affected timestamp")
    if feature_name == "solar_kw" and row["weather"]["solar_irradiance_wm2"] > 400:
        return ("Solar output far below expected for measured irradiance",
                "Check for panel soiling/icing or inverter fault")
    if feature_name == "wind_kw" and row["weather"]["wind_speed_ms"] > CFG_WIND_CUTIN:
        return ("Wind output inconsistent with measured wind speed",
                "Inspect turbine controller and generator health")
    if feature_name == "diesel_output_kw" and row["diesel_fuel_liters"] < 5:
        return ("Diesel output anomaly coincides with very low fuel",
                "Verify fuel gauge accuracy and generator fuel-cut behaviour")
    if feature_name == "battery_soc_pct":
        return ("Battery SOC changed faster than expected for commanded power",
                "Check battery management system telemetry for sensor drift")
    return ("Telemetry value outside normal operating envelope", "Review raw sensor/simulation logs for this timestamp")


CFG_WIND_CUTIN = 3.0


def detect_anomalies(history: list[dict], contamination: float = 0.05) -> list[Anomaly]:
    if len(history) < 20:
        return []

    features = ["load_total_kw", "solar_kw", "wind_kw", "battery_soc_pct", "diesel_output_kw"]
    X = np.array([[h[f] for f in features] for h in history])

    model = IsolationForest(contamination=contamination, random_state=42, n_estimators=150)
    model.fit(X)
    scores = model.decision_function(X)
    preds = model.predict(X)  # -1 = anomaly

    anomalies: list[Anomaly] = []
    for i, (row, pred, score) in enumerate(zip(history, preds, scores)):
        if pred != -1:
            continue
        # attribute to the feature with the largest z-score deviation
        col_means = X.mean(axis=0)
        col_stds = X.std(axis=0) + 1e-6
        z = np.abs((X[i] - col_means) / col_stds)
        worst_idx = int(np.argmax(z))
        worst_feature = features[worst_idx]
        severity = "CRITICAL" if score < -0.15 else ("HIGH" if score < -0.08 else "MODERATE")
        cause, rec = _cause_and_recommendation(row, worst_feature)
        anomalies.append(Anomaly(
            timestamp=row["timestamp"],
            severity=severity,
            metric=worst_feature,
            value=row[worst_feature],
            anomaly_score=round(float(score), 3),
            possible_cause=cause,
            recommendation=rec,
        ))
    return sorted(anomalies, key=lambda a: a.timestamp, reverse=True)[:25]
