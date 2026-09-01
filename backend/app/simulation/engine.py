"""
Station Simulation Engine
==========================
Produces physically-plausible, internally-consistent telemetry for a polar
research station: weather -> renewable generation -> load -> battery/diesel
dispatch state. Everything here is SIMULATED. No physical hardware is used
or required.

Design notes:
- Uses a seeded RNG so a given `run_id` + `tick` always reproduces the same
  telemetry (needed for consistent forecasting/backtesting).
- Storm events are modelled as a probabilistic process whose probability
  itself is exposed to the rest of the system (so alerts/risk/optimizer can
  react to *rising* probability before the storm actually hits).
- Solar/wind/load are all *functions of* weather and time-of-day, not
  independent random draws.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

from app.config import station_config as CFG


@dataclass
class WeatherState:
    timestamp: datetime
    temperature_c: float
    wind_speed_ms: float
    solar_irradiance_wm2: float   # 0 - ~1000
    cloud_cover_pct: float        # 0-100
    storm_probability_pct: float  # 0-100, rolling model
    storm_active: bool
    condition: str                # human label: clear/cloudy/light snow/storm


@dataclass
class StationTick:
    tick: int
    timestamp: str
    weather: dict

    load_total_kw: float
    load_critical_kw: float
    load_important_kw: float
    load_flexible_kw: float
    flexible_curtailed_kw: float

    solar_kw: float
    wind_kw: float

    battery_soc_pct: float
    battery_power_kw: float       # +charging, -discharging
    battery_capacity_kwh: float   # effective (post-degradation) capacity

    diesel_on: bool
    diesel_output_kw: float
    diesel_fuel_liters: float
    diesel_hours_total: float

    renewable_kw: float
    net_energy_kw: float          # generation - load (pre-battery/diesel)


class StationSimulator:
    """
    Stateful, tick-based simulator. Call `.step()` to advance one tick
    (default 15 simulated minutes). Deterministic given the seed + start
    time, so re-running produces identical history for forecasting/backtests.
    """

    def __init__(self, start_time: datetime | None = None, seed: int | None = None,
                 speed_multiplier: float = 1.0):
        self.rng = random.Random(seed if seed is not None else CFG.random_seed)
        self.start_time = start_time or datetime.utcnow()
        self.tick_index = 0
        self.tick_minutes = CFG.tick_minutes
        self.speed_multiplier = speed_multiplier

        # Mutable device state
        self.battery_soc_pct = 70.0
        self.battery_effective_capacity_kwh = CFG.battery_capacity_kwh
        self.battery_equivalent_full_cycles = 0.0
        self.diesel_fuel_liters = CFG.initial_fuel_liters
        self.diesel_hours_total = 0.0
        self.diesel_on = False

        # Storm process state
        self.storm_probability_pct = 8.0
        self.storm_active = False
        self.storm_ticks_remaining = 0
        self.forced_storm_countdown: int | None = None  # for triggered demo scenario

        self.history: list[StationTick] = []

    # ------------------------------------------------------------------
    # Weather model
    # ------------------------------------------------------------------
    def _weather_at(self, t: datetime) -> WeatherState:
        hour = t.hour + t.minute / 60.0
        day_of_year = t.timetuple().tm_yday

        # Base seasonal + diurnal temperature curve (Antarctic-analogue: cold, low diurnal swing)
        seasonal = -15 + 8 * math.sin(2 * math.pi * (day_of_year / 365.0))
        diurnal = -3 * math.cos(2 * math.pi * (hour / 24.0))
        temperature_c = seasonal + diurnal + self.rng.uniform(-1.5, 1.5)

        # Wind speed: gusty baseline + slow-moving system fluctuation
        wind_base = 8 + 4 * math.sin(2 * math.pi * (hour / 24.0) + 1.0)
        wind_speed_ms = max(0.0, wind_base + self.rng.uniform(-2.5, 2.5))

        # Storm probability: mean-reverting random walk, nudged by wind speed
        drift = (wind_speed_ms - 10) * 0.4
        self.storm_probability_pct = min(
            98.0,
            max(2.0, self.storm_probability_pct + drift + self.rng.uniform(-4, 4)),
        )
        if self.forced_storm_countdown is not None:
            # Demo scenario override: ramp probability up deterministically
            self.storm_probability_pct = min(98.0, self.storm_probability_pct + 6.0)

        # Storm activation (probabilistic) unless one is already running
        if not self.storm_active and self.forced_storm_countdown == 0:
            self.storm_active = True
            self.storm_ticks_remaining = int(8 * 60 / self.tick_minutes)  # ~8h storm
            self.forced_storm_countdown = None
        elif not self.storm_active and self.rng.uniform(0, 100) < (self.storm_probability_pct / 40.0):
            self.storm_active = True
            self.storm_ticks_remaining = int(self.rng.uniform(4, 10) * 60 / self.tick_minutes)

        if self.forced_storm_countdown is not None and self.forced_storm_countdown > 0:
            self.forced_storm_countdown -= 1

        if self.storm_active:
            cloud_cover_pct = min(100.0, 80 + self.rng.uniform(0, 20))
            wind_speed_ms = min(30.0, wind_speed_ms + self.rng.uniform(5, 12))
            self.storm_ticks_remaining -= 1
            if self.storm_ticks_remaining <= 0:
                self.storm_active = False
                self.storm_probability_pct = max(5.0, self.storm_probability_pct * 0.4)
        else:
            cloud_cover_pct = max(0.0, min(100.0, 30 + self.rng.uniform(-25, 35)))

        # Solar irradiance: zero at night, bell curve during day, reduced by cloud cover
        daylight = max(0.0, math.sin(math.pi * (hour - 5) / 14)) if 5 <= hour <= 19 else 0.0
        clear_sky_irradiance = 950 * daylight
        solar_irradiance_wm2 = clear_sky_irradiance * (1 - 0.85 * (cloud_cover_pct / 100.0))
        solar_irradiance_wm2 = max(0.0, solar_irradiance_wm2)

        if self.storm_active:
            condition = "storm"
        elif cloud_cover_pct > 70:
            condition = "light snow"
        elif cloud_cover_pct > 40:
            condition = "cloudy"
        else:
            condition = "clear"

        return WeatherState(
            timestamp=t,
            temperature_c=round(temperature_c, 1),
            wind_speed_ms=round(wind_speed_ms, 1),
            solar_irradiance_wm2=round(solar_irradiance_wm2, 1),
            cloud_cover_pct=round(cloud_cover_pct, 1),
            storm_probability_pct=round(self.storm_probability_pct, 1),
            storm_active=self.storm_active,
            condition=condition,
        )

    # ------------------------------------------------------------------
    # Generation / load models (functions of weather, not independent RNG)
    # ------------------------------------------------------------------
    def _solar_kw(self, weather: WeatherState) -> float:
        # Simple flat-plate model: capacity * (irradiance / STC 1000 W/m2) * temp derate
        raw = CFG.solar_capacity_kw * (weather.solar_irradiance_wm2 / 1000.0)
        temp_derate = 1.0 - max(0.0, (weather.temperature_c + 10) * 0.002)  # cold slightly helps PV, mild effect
        return round(max(0.0, raw * min(1.05, temp_derate + 0.05)), 2)

    def _wind_kw(self, weather: WeatherState) -> float:
        v = weather.wind_speed_ms
        if v < CFG.wind_cut_in_ms or v > CFG.wind_cut_out_ms:
            return 0.0
        if v >= CFG.wind_rated_ms:
            return CFG.wind_capacity_kw
        # cubic power curve between cut-in and rated speed
        frac = (v - CFG.wind_cut_in_ms) / (CFG.wind_rated_ms - CFG.wind_cut_in_ms)
        return round(CFG.wind_capacity_kw * (frac ** 3) * 1.0, 2)

    def _load_kw(self, t: datetime, weather: WeatherState):
        hour = t.hour + t.minute / 60.0
        # Station activity curve: rises in "working hours", dips overnight
        activity = 0.55 + 0.45 * max(0.0, math.sin(math.pi * (hour - 6) / 14)) if 6 <= hour <= 22 else 0.4
        # Cold snaps raise heating-linked load
        cold_factor = 1.0 + max(0.0, (-25 - weather.temperature_c)) * 0.01

        critical = CFG.critical_load_kw * (0.85 + 0.15 * self.rng.uniform(0, 1))
        important = CFG.important_load_kw * activity * cold_factor * (0.9 + 0.1 * self.rng.uniform(0, 1))
        flexible = CFG.flexible_load_kw * activity * (0.8 + 0.2 * self.rng.uniform(0, 1))

        critical = min(critical, CFG.critical_load_kw)
        important = min(important, CFG.important_load_kw)
        flexible = min(flexible, CFG.flexible_load_kw)

        base = CFG.base_load_kw
        total_uncurtailed = base * 0 + critical + important + flexible  # base folded into critical/important mix
        return round(critical, 2), round(important, 2), round(flexible, 2)

    # ------------------------------------------------------------------
    # Battery / diesel dispatch (naive baseline; overridden by optimizer for
    # the "commanded" values used in the dashboard — this provides the
    # physical envelope/state the optimizer operates within)
    # ------------------------------------------------------------------
    def _apply_battery(self, power_kw: float, hours: float):
        """Positive = charge, negative = discharge. Clamps to limits & updates SOC."""
        power_kw = max(-CFG.battery_max_discharge_kw, min(CFG.battery_max_charge_kw, power_kw))
        capacity = self.battery_effective_capacity_kwh
        if power_kw >= 0:
            energy_in = power_kw * hours * CFG.battery_charge_eff
        else:
            energy_in = power_kw * hours / CFG.battery_discharge_eff
        delta_pct = (energy_in / capacity) * 100.0
        new_soc = self.battery_soc_pct + delta_pct
        new_soc = max(0.0, min(100.0, new_soc))
        actual_delta_pct = new_soc - self.battery_soc_pct
        self.battery_soc_pct = new_soc
        # Track equivalent full cycles for degradation
        self.battery_equivalent_full_cycles += abs(actual_delta_pct) / 200.0  # /100 down + /100 up = one full cycle
        if self.battery_equivalent_full_cycles > 1.0:
            self.battery_effective_capacity_kwh *= (1 - CFG.battery_degradation_per_full_cycle_pct / 100.0)
            self.battery_equivalent_full_cycles = 0.0
        return power_kw

    def _run_diesel(self, output_kw: float, hours: float):
        output_kw = max(0.0, min(CFG.diesel_capacity_kw, output_kw))
        if output_kw <= 0.1:
            self.diesel_on = False
            return 0.0
        fuel_needed = (output_kw * hours) / CFG.diesel_efficiency_kwh_per_l
        if fuel_needed > self.diesel_fuel_liters:
            # run at whatever fuel allows
            output_kw = (self.diesel_fuel_liters * CFG.diesel_efficiency_kwh_per_l) / hours if hours > 0 else 0
            fuel_needed = self.diesel_fuel_liters
        self.diesel_fuel_liters = max(0.0, self.diesel_fuel_liters - fuel_needed)
        self.diesel_hours_total += hours
        self.diesel_on = output_kw > 0.1
        return round(output_kw, 2)

    def trigger_storm_scenario(self, lead_ticks: int = 8):
        """Manual/demo trigger: schedule a storm to begin after `lead_ticks`."""
        self.forced_storm_countdown = lead_ticks

    # ------------------------------------------------------------------
    def step(self, battery_command_kw: float | None = None,
             diesel_command_kw: float | None = None) -> StationTick:
        t = self.start_time + timedelta(minutes=self.tick_minutes * self.tick_index)
        hours = self.tick_minutes / 60.0
        weather = self._weather_at(t)

        solar_kw = self._solar_kw(weather)
        wind_kw = self._wind_kw(weather)
        renewable_kw = solar_kw + wind_kw

        critical, important, flexible = self._load_kw(t, weather)
        load_total = critical + important + flexible
        net = renewable_kw - load_total

        # Default naive dispatch if no command given (used for seeding history)
        if battery_command_kw is None:
            if net >= 0:
                battery_command_kw = min(net, CFG.battery_max_charge_kw)
            else:
                deficit = -net
                available_discharge = (self.battery_soc_pct - CFG.battery_min_soc_pct) / 100.0 * \
                    self.battery_effective_capacity_kwh / hours
                battery_command_kw = -min(deficit, CFG.battery_max_discharge_kw, max(0.0, available_discharge))

        battery_power = self._apply_battery(battery_command_kw, hours)

        # net = renewable - load. battery_power is +charging/-discharging, so
        # the battery's *contribution to supply* is -battery_power. Whatever
        # deficit remains after renewables + battery must come from diesel:
        remaining_deficit = -net + battery_power
        flexible_curtailed = 0.0
        if diesel_command_kw is None:
            diesel_command_kw = max(0.0, remaining_deficit)
        diesel_output = self._run_diesel(diesel_command_kw, hours)

        # If still short after battery+diesel, curtail flexible load first
        still_short = remaining_deficit - diesel_output
        if still_short > 0.1:
            flexible_curtailed = min(flexible, still_short)
            flexible -= flexible_curtailed
            load_total -= flexible_curtailed

        tick = StationTick(
            tick=self.tick_index,
            timestamp=t.isoformat(),
            weather=asdict(weather),
            load_total_kw=round(load_total, 2),
            load_critical_kw=round(critical, 2),
            load_important_kw=round(important, 2),
            load_flexible_kw=round(flexible, 2),
            flexible_curtailed_kw=round(flexible_curtailed, 2),
            solar_kw=solar_kw,
            wind_kw=wind_kw,
            battery_soc_pct=round(self.battery_soc_pct, 2),
            battery_power_kw=round(battery_power, 2),
            battery_capacity_kwh=round(self.battery_effective_capacity_kwh, 2),
            diesel_on=self.diesel_on,
            diesel_output_kw=diesel_output,
            diesel_fuel_liters=round(self.diesel_fuel_liters, 2),
            diesel_hours_total=round(self.diesel_hours_total, 2),
            renewable_kw=round(renewable_kw, 2),
            net_energy_kw=round(net, 2),
        )
        self.history.append(tick)
        self.tick_index += 1
        return tick

    def seed_history(self, n_ticks: int):
        for _ in range(n_ticks):
            self.step()
