"""
Station Registry & Manager
=============================
Holds the two supported Indian Antarctic research stations. Identity fields
below (name, established year, approximate coordinates, region) are
VERIFIED PUBLIC INFORMATION about these real stations. All electrical,
weather, battery, diesel and fuel figures are SIMULATION — no real
operational telemetry from these stations is used or claimed.

Switching stations swaps the entire modeled state: a fresh/continuing
StationSimulator instance, its own history, alerts, equipment health, etc.
Nothing is shared between stations except the code that models them.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime

from app.simulation.engine import StationSimulator
from app.config import station_config as CFG
from app.database import db as DB

DATA_PROVENANCE = {
    "station_identity": "VERIFIED_PUBLIC_DATA",
    "coordinates": "VERIFIED_PUBLIC_DATA",
    "weather": "SIMULATION_FALLBACK_ACTIVE",
    "electrical_telemetry": "SIMULATION",
    "forecasts": "MODEL_DERIVED",
    "risk_score": "DERIVED",
    "equipment_health": "MODEL_DERIVED",
}


@dataclass
class StationIdentity:
    code: str
    name: str
    full_name: str
    region: str
    coordinates: str
    established: str
    description: str


STATIONS: dict[str, StationIdentity] = {
    "MAITRI": StationIdentity(
        code="MAITRI",
        name="Maitri",
        full_name="Maitri Station",
        region="Schirmacher Oasis, Queen Maud Land, East Antarctica",
        coordinates="70°45'S, 11°44'E (approx.)",
        established="1989",
        description=(
            "India's second permanent Antarctic research station, built on rocky terrain "
            "in the Schirmacher Oasis. Operated by NCPOR under the Ministry of Earth Sciences."
        ),
    ),
    "BHARATI": StationIdentity(
        code="BHARATI",
        name="Bharati",
        full_name="Bharati Station",
        region="Larsemann Hills, Stornes Peninsula, East Antarctica",
        coordinates="69°24'S, 76°11'E (approx.)",
        established="2012",
        description=(
            "India's third permanent Antarctic research station, built using modular "
            "shipping-container units on the Stornes Peninsula. Operated by NCPOR under "
            "the Ministry of Earth Sciences."
        ),
    ),
}

# Slight physical-profile differences between the two real sites, expressed
# only through simulation config deltas (still clearly SIMULATION).
STATION_PROFILE_OVERRIDES = {
    "MAITRI": {"wind_capacity_kw": 65.0, "solar_capacity_kw": 80.0, "base_temp_offset": -2.0},
    "BHARATI": {"wind_capacity_kw": 75.0, "solar_capacity_kw": 95.0, "base_temp_offset": 1.5},
}


class StationRuntime:
    """Everything needed to serve one station's live state."""
    def __init__(self, code: str):
        self.code = code
        self.identity = STATIONS[code]
        seed = CFG.random_seed + (0 if code == "MAITRI" else 17)
        profile = STATION_PROFILE_OVERRIDES.get(code, {})
        self.simulator = StationSimulator(
            start_time=datetime.utcnow(), seed=seed,
            solar_capacity_kw=profile.get("solar_capacity_kw"),
            wind_capacity_kw=profile.get("wind_capacity_kw"),
            temp_offset_c=profile.get("base_temp_offset", 0.0),
        )
        self.mode = "NORMAL"  # NORMAL / WATCH / STORM_PREPARATION / SURVIVAL_MODE / RECOVERY
        self.running = False
        self.speed_multiplier = 1.0

        existing = DB.count_telemetry(code)
        if existing == 0:
            self.simulator.seed_history(CFG.history_ticks_seed)  # 7 days of 15-min history at startup
            for t in self.simulator.history:
                DB.insert_telemetry(code, _tick_to_dict(t))
        else:
            # Restore in-memory history from DB so forecasting/analytics have context.
            self.simulator.history = []  # kept empty; DB is source of truth for history
            self.restored_history = DB.get_recent_telemetry(code, limit=2000)
            if self.restored_history:
                self.simulator.tick_index = self.restored_history[-1]["tick"] + 1

    def history(self, limit: int = 500) -> list[dict]:
        return DB.get_recent_telemetry(self.code, limit=limit)


def _tick_to_dict(tick) -> dict:
    from dataclasses import asdict
    return asdict(tick)


class StationManager:
    def __init__(self):
        self.runtimes: dict[str, StationRuntime] = {code: StationRuntime(code) for code in STATIONS}
        self.active_code = "BHARATI"

    def active(self) -> StationRuntime:
        return self.runtimes[self.active_code]

    def set_active(self, code: str):
        code = code.upper()
        if code not in STATIONS:
            raise ValueError(f"Unknown station '{code}'. Valid: {list(STATIONS)}")
        self.active_code = code
        return self.runtimes[code]


manager = StationManager()
