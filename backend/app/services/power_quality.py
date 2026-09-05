"""
Power Quality
===============
All values here are MODEL-DERIVED / SIMULATION — there is no real electrical
metering behind this prototype. Voltage/frequency/PF/temperature are
computed deterministically from the current dispatch tick so they move
believably with load and generation, but they are never to be presented as
measured NCPOR telemetry.
"""
from __future__ import annotations
from dataclasses import dataclass, field


NOMINAL_VOLTAGE_V = 415.0
NOMINAL_FREQUENCY_HZ = 50.0


def _quality_status(voltage_dev_pct: float, freq_dev_hz: float, pf: float) -> str:
    if abs(voltage_dev_pct) > 6 or abs(freq_dev_hz) > 0.5 or pf < 0.85:
        return "CRITICAL"
    if abs(voltage_dev_pct) > 3 or abs(freq_dev_hz) > 0.2 or pf < 0.92:
        return "WARNING"
    return "NORMAL"


@dataclass
class PowerQuality:
    voltage_v: float
    frequency_hz: float
    current_a: float
    power_factor: float
    temperature_c: float
    status: str
    thd_pct: float
    voltage_unbalance_pct: float
    active_power_kw: float
    reactive_power_kvar: float
    apparent_power_kva: float
    provenance: str = "MODEL_DERIVED"


def compute_station_power_quality(tick: dict, diesel_on: bool) -> PowerQuality:
    load_kw = tick["load_total_kw"]
    # Loading fraction relative to a nominal ~250kW station bus capacity proxy
    loading_frac = min(1.2, load_kw / 250.0)

    # Diesel running under light load, or heavy renewable intermittency,
    # nudges voltage/frequency away from nominal — a plausible, bounded model.
    voltage_dev = (-1.5 if diesel_on and loading_frac < 0.3 else 0.0) + (loading_frac - 0.5) * 2.5
    voltage = round(NOMINAL_VOLTAGE_V * (1 + voltage_dev / 100), 1)

    freq_dev = 0.05 if diesel_on else 0.0
    freq_dev += max(0.0, (loading_frac - 0.9)) * 0.6
    frequency = round(NOMINAL_FREQUENCY_HZ - freq_dev, 2)

    pf = round(0.97 - max(0.0, loading_frac - 0.8) * 0.15 - (0.03 if diesel_on and loading_frac < 0.3 else 0), 2)
    current = round((load_kw * 1000) / (voltage * 1.732 * max(pf, 0.5)), 1)  # 3-phase approx
    temperature = round(tick["weather"]["temperature_c"] * 0.1 + (25 if diesel_on else 15), 1)

    # THD rises with inverter-heavy renewable penetration and lighter loading
    # (a simplified, bounded proxy — real THD needs harmonic-domain metering
    # this software-only prototype does not have).
    renewable_frac = 0.0 if load_kw <= 0 else min(1.0, (tick["solar_kw"] + tick["wind_kw"]) / max(1.0, load_kw))
    thd_pct = round(2.0 + renewable_frac * 2.5 + max(0.0, 0.4 - loading_frac) * 3.0, 2)

    # Voltage unbalance proxy: worse under light/erratic loading, better near nominal loading
    voltage_unbalance_pct = round(0.5 + abs(loading_frac - 0.6) * 1.8, 2)

    active_power_kw = round(load_kw, 1)
    apparent_power_kva = round(active_power_kw / max(pf, 0.5), 1)
    reactive_power_kvar = round((apparent_power_kva ** 2 - active_power_kw ** 2) ** 0.5, 1)

    status = _quality_status(voltage_dev, NOMINAL_FREQUENCY_HZ - frequency, pf)
    if thd_pct > 8 or voltage_unbalance_pct > 3:
        status = "CRITICAL"
    elif status == "NORMAL" and (thd_pct > 5 or voltage_unbalance_pct > 1.5):
        status = "WARNING"

    return PowerQuality(
        voltage_v=voltage, frequency_hz=frequency, current_a=current,
        power_factor=pf, temperature_c=temperature, status=status,
        thd_pct=thd_pct, voltage_unbalance_pct=voltage_unbalance_pct,
        active_power_kw=active_power_kw, reactive_power_kvar=reactive_power_kvar,
        apparent_power_kva=apparent_power_kva,
    )


def compute_source_quality(kind: str, tick: dict) -> dict:
    """Per-source (solar/wind/battery/diesel) simplified electrical quality panel."""
    if kind == "solar":
        active = tick["solar_kw"] > 0.5
        return {
            "status": "GENERATING" if active else "IDLE",
            "generation_kw": tick["solar_kw"],
            "voltage_v": round(48 + tick["solar_kw"] * 0.05, 1) if active else 0.0,
            "current_a": round((tick["solar_kw"] * 1000) / 48, 1) if active else 0.0,
            "power_factor": 1.0,
            "efficiency_pct": round(min(99, 80 + tick["weather"]["solar_irradiance_wm2"] / 100), 1),
            "temperature_c": round(tick["weather"]["temperature_c"] + (10 if active else 0), 1),
            "irradiance_wm2": tick["weather"]["solar_irradiance_wm2"],
            "quality": "NORMAL" if active or tick["weather"]["solar_irradiance_wm2"] < 5 else "WARNING",
            "provenance": "SIMULATION",
        }
    if kind == "wind":
        active = tick["wind_kw"] > 0.5
        return {
            "status": "GENERATING" if active else "IDLE",
            "generation_kw": tick["wind_kw"],
            "voltage_v": round(400 + tick["wind_kw"] * 0.1, 1) if active else 0.0,
            "current_a": round((tick["wind_kw"] * 1000) / (400 * 1.732), 1) if active else 0.0,
            "power_factor": 0.95 if active else 1.0,
            "wind_speed_ms": tick["weather"]["wind_speed_ms"],
            "temperature_c": tick["weather"]["temperature_c"],
            "efficiency_pct": round(min(95, 60 + tick["wind_kw"] / 2), 1) if active else 0.0,
            "quality": "NORMAL",
            "provenance": "SIMULATION",
        }
    if kind == "battery":
        charging = tick["battery_power_kw"] > 0.1
        discharging = tick["battery_power_kw"] < -0.1
        state = "CHARGING" if charging else "DISCHARGING" if discharging else "STANDBY"
        return {
            "state": state,
            "soc_pct": tick["battery_soc_pct"],
            "dod_pct": round(100 - tick["battery_soc_pct"], 1),
            "power_kw": tick["battery_power_kw"],
            "voltage_v": round(650 + (tick["battery_soc_pct"] - 50) * 0.4, 1),
            "current_a": round(abs(tick["battery_power_kw"] * 1000) / 650, 1),
            "temperature_c": round(tick["weather"]["temperature_c"] * 0.05 + 18, 1),
            "charge_efficiency_pct": 95.0,
            "discharge_efficiency_pct": 95.0,
            "available_energy_kwh": round(tick["battery_capacity_kwh"] * tick["battery_soc_pct"] / 100, 1),
            "capacity_kwh": tick["battery_capacity_kwh"],
            "quality": "NORMAL",
            "provenance": "SIMULATION",
        }
    if kind == "diesel":
        on = tick["diesel_on"]
        return {
            "state": "RUNNING" if on else "STANDBY",
            "output_kw": tick["diesel_output_kw"],
            "voltage_v": 415.0 if on else 0.0,
            "current_a": round((tick["diesel_output_kw"] * 1000) / (415 * 1.732), 1) if on else 0.0,
            "power_factor": 0.9 if on else 1.0,
            "frequency_hz": 50.0 if on else 0.0,
            "engine_temperature_c": round(75 + tick["diesel_output_kw"] * 0.1, 1) if on else round(tick["weather"]["temperature_c"], 1),
            "fuel_liters": tick["diesel_fuel_liters"],
            "runtime_hours_total": tick["diesel_hours_total"],
            "quality": "NORMAL" if on or tick["diesel_fuel_liters"] > 0 else "WARNING",
            "provenance": "SIMULATION",
        }
    raise ValueError(f"Unknown source kind: {kind}")


def compute_pq_history(history: list[dict]) -> list[dict]:
    """Real derived time series — computed from each historical tick, not
    randomly generated for the chart. Used by the Power Quality page's
    Voltage/Frequency/PF/THD/Voltage-Unbalance tabs and range selector."""
    from dataclasses import asdict
    series = []
    for tick in history:
        pq = compute_station_power_quality(tick, tick["diesel_on"])
        series.append({"timestamp": tick["timestamp"], **asdict(pq)})
    return series


# Thresholds mirrored from _quality_status / compute_station_power_quality so
# events are derived from the exact same rules driving the live status.
_EVENT_THRESHOLDS = {
    "voltage_v": (NOMINAL_VOLTAGE_V * 0.94, NOMINAL_VOLTAGE_V * 1.06),
    "frequency_hz": (NOMINAL_FREQUENCY_HZ - 0.5, NOMINAL_FREQUENCY_HZ + 0.5),
    "power_factor": (0.85, 1.5),
    "thd_pct": (0, 8.0),
    "voltage_unbalance_pct": (0, 3.0),
}


def compute_pq_events(history: list[dict], limit: int = 50) -> list[dict]:
    """Derives a real event history by walking the same PQ series and
    flagging threshold crossings — not a fabricated log."""
    series = compute_pq_history(history)
    events = []
    prev_status = "NORMAL"
    for point in series:
        status = point["status"]
        if status != "NORMAL" and status != prev_status:
            # find which parameter tripped it
            worst_param, worst_val, worst_thresh = None, None, None
            for param, (lo, hi) in _EVENT_THRESHOLDS.items():
                val = point[param]
                if val < lo or val > hi:
                    worst_param, worst_val, worst_thresh = param, val, (lo if val < lo else hi)
            events.append({
                "timestamp": point["timestamp"],
                "source": "Energy Bus",
                "parameter": worst_param or "composite",
                "value": worst_val if worst_val is not None else None,
                "threshold": worst_thresh,
                "severity": status,
                "state": "ACTIVE",
            })
        elif status == "NORMAL" and prev_status != "NORMAL" and events:
            events[-1] = {**events[-1], "state": "RECOVERED"}
        prev_status = status
    return list(reversed(events))[:limit]
