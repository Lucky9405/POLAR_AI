from __future__ import annotations
from pydantic import BaseModel, Field


class StationSwitchRequest(BaseModel):
    station: str = Field(..., description="MAITRI or BHARATI")


class SimulationControlRequest(BaseModel):
    action: str = Field(..., description="start | pause | reset")
    speed: float | None = Field(None, description="1, 5, or 10")


class WhatIfRequest(BaseModel):
    solar_pct_change: float = 0.0
    wind_pct_change: float = 0.0
    load_pct_change: float = 0.0
    battery_capacity_kwh: float | None = None
    starting_soc_pct: float | None = None
    fuel_liters: float | None = None
    storm_probability_pct: float | None = None
    storm_duration_hours: float = 8.0
    temperature_c_delta: float = 0.0
    horizon_hours: int = 24
    scenario_name: str | None = None


class AdvisorQuestion(BaseModel):
    question: str


class AlertActionRequest(BaseModel):
    alert_id: int


class SurvivalModeRequest(BaseModel):
    activate: bool


class StormScenarioRequest(BaseModel):
    lead_ticks: int = 8
