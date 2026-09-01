"""
POLAR-AI Configuration
=======================
Single source of truth for all tunable simulation / optimization / risk
parameters. Nothing in the rest of the codebase should hard-code a magic
number that belongs here.

All values are DEMO/SIMULATION defaults for a fictional Antarctic-style
research station ("Bharati Station" analogue). They are not real
engineering specifications for any actual NCPOR facility.
"""
import os
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


class StationConfig(BaseModel):
    # ---- Load profile (kW) ----
    base_load_kw: float = 60.0          # always-on baseline
    critical_load_kw: float = 40.0      # safety/comms/life-support ceiling
    important_load_kw: float = 55.0     # labs/servers/refrigeration ceiling
    flexible_load_kw: float = 35.0      # lighting/recreation ceiling

    # ---- Solar ----
    solar_capacity_kw: float = 90.0

    # ---- Wind ----
    wind_capacity_kw: float = 70.0
    wind_cut_in_ms: float = 3.0
    wind_rated_ms: float = 12.0
    wind_cut_out_ms: float = 25.0

    # ---- Battery ----
    battery_capacity_kwh: float = 400.0
    battery_max_charge_kw: float = 80.0
    battery_max_discharge_kw: float = 100.0
    battery_charge_eff: float = 0.95
    battery_discharge_eff: float = 0.95
    battery_min_soc_pct: float = 15.0        # hard floor
    battery_survival_reserve_pct: float = 40.0  # target reserve in survival mode
    battery_degradation_per_full_cycle_pct: float = 0.03  # capacity loss per equiv. full cycle

    # ---- Diesel generator ----
    diesel_capacity_kw: float = 120.0
    diesel_efficiency_kwh_per_l: float = 3.5  # kWh produced per litre of fuel
    diesel_min_load_frac: float = 0.3         # generator inefficient below this loading
    initial_fuel_liters: float = 1245.0
    fuel_tank_capacity_liters: float = 2000.0

    # ---- Carbon ----
    co2_kg_per_liter_diesel: float = 2.68  # standard diesel combustion factor (documented assumption)

    # ---- Risk thresholds ----
    risk_safe_max: int = 30
    risk_moderate_max: int = 60
    risk_high_max: int = 80
    # (81-100 = CRITICAL)

    # ---- Simulation ----
    tick_minutes: int = 15          # one simulation tick = 15 simulated minutes
    history_ticks_seed: int = 672   # 7 days of 15-min history seeded on startup (7*24*4)
    random_seed: int = 42


class AppConfig(BaseModel):
    backend_port: int = int(os.getenv("BACKEND_PORT", "8000"))
    cors_origins: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/polar_ai.db")
    optional_llm_api_key: str | None = os.getenv("GEMINI_API_KEY") or None
    optional_llm_provider: str | None = os.getenv("OPTIONAL_LLM_PROVIDER", "gemini") or None


station_config = StationConfig()
app_config = AppConfig()
