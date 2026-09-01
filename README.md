# POLAR-AI

**AI-Driven Smart Energy Management System for Indian Antarctic Research Stations**

Built for **Smart India Hackathon** — Problem Statement: *"AI-Driven Smart Energy
Management System for Polar Research Stations"*
Organization: Ministry of Earth Sciences (MoES) / National Centre for Polar and Ocean
Research (NCPOR) · Category: Software · Theme: Clean & Green Technology

---

## 1. Problem Statement

Indian Antarctic research stations (Maitri, Bharati) rely on a mix of diesel
generators and renewable sources to survive extreme, remote, and highly variable
polar conditions. Operators need a way to forecast demand and renewable supply,
optimize dispatch between solar/wind/battery/diesel, protect life-critical loads
during shortages, and prepare for storms — all without adding new physical
hardware to an already hard-to-service site.

## 2. Solution

POLAR-AI is a **software-only** simulation and decision-support platform that
models a station's full energy system (weather → solar/wind → load → battery/
diesel), forecasts load and renewable generation with ML, dispatches energy using
an explainable rule-based optimizer, computes a transparent 0–100 risk score,
detects anomalies, tracks equipment health, and lets an operator run "what-if"
scenarios or trigger a full storm-response demo — all backed by a real FastAPI +
SQLite backend and a React/TypeScript dashboard.

**This is 100% software.** No sensors, ESP32/Arduino, physical solar/wind hardware,
batteries, or diesel generators are required — everything is realistically
simulated and clearly labeled as such.

## 3. Data Provenance — Read This First

POLAR-AI is explicit about what's real and what's simulated:

| Category | Status |
|---|---|
| Station identity (Maitri/Bharati names, region, approx. coordinates, founding year) | **VERIFIED PUBLIC DATA** |
| Weather (temperature, wind, irradiance, storms) | **SIMULATION FALLBACK ACTIVE** (no live feed wired in this build) |
| Electrical telemetry (load, solar/wind output, battery, diesel, fuel) | **SIMULATION** |
| Forecasts (load/solar/wind ML predictions) | **MODEL-DERIVED** |
| Risk score, fuel autonomy | **DERIVED** (computed from simulated + model-derived inputs) |
| Equipment health | **MODEL-DERIVED** |

The `/api/stations` endpoint returns this provenance map (`data_provenance`) so the
frontend (or a judge) can query it directly. **No simulated number is ever
presented as real operational station data.**

## 4. Architecture

```
                     ┌─────────────────────────────┐
                     │        React Frontend        │
                     │  (Vite + TS + Tailwind +     │
                     │   Recharts, 10 pages)         │
                     └──────────────┬────────────────┘
                                    │ REST (fetch, polling)
                     ┌──────────────▼────────────────┐
                     │        FastAPI Backend         │
                     │  /api/* routes (app/api)       │
                     └───┬─────┬─────┬─────┬─────┬────┘
                         │     │     │     │     │
      ┌──────────────────┘     │     │     │     └────────────────────┐
      ▼                        ▼     ▼     ▼                          ▼
┌───────────┐        ┌──────────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐
│ Simulation│──────▶ │ Forecasting  │ │Optimizer │ │ Risk/Fuel  │ │ Advisor │
│  Engine   │        │ (sklearn GBR)│ │(rule-based)│ Autonomy   │ │(offline)│
└─────┬─────┘        └──────────────┘ └────┬─────┘ └─────┬──────┘ └────┬────┘
      │                                     │             │             │
      ▼                                     ▼             ▼             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SQLite (telemetry, alerts, anomalies,             │
│                   equipment health, what-if history, advisor log)      │
└────────────────────────────────────────────────────────────────────────┘

DATA SIMULATION → DATA PROCESSING → AI FORECASTING → ENERGY OPTIMIZATION →
ENERGY DISPATCH → DIGITAL TWIN → DASHBOARD / ALERTS / AI ADVISOR
```

## 5. Features

- **Physically-coupled simulation**: solar depends on irradiance/cloud/time; wind
  follows a cut-in/rated/cut-out power curve; load follows a diurnal + cold-snap
  pattern; battery SOC and diesel fuel evolve from actual charge/discharge and
  generator runtime (not independent random draws).
- **ML forecasting** (load/solar/wind, +1h/+6h/+24h) using scikit-learn Gradient
  Boosted Trees, with honest backtested MAE/RMSE shown in the UI.
- **Explainable rule-based optimizer**: every dispatch decision (battery command,
  diesel command, flexible-load allowance, Polar Survival Mode) traces to an
  explicit numeric condition — never a black box.
- **Polar Survival Mode**: auto-activates on storm probability, forecast
  renewable drop, low battery, or low fuel; also has a manual judge-control
  toggle.
- **Energy Risk Score** (0–100, SAFE/MODERATE/HIGH/CRITICAL) built from 5
  weighted, fully-explained factors.
- **Fuel Autonomy Predictor** computed from tank level + forecast load/renewables
  (never hard-coded).
- **What-If Simulator**: adjust solar/wind/load %, battery, fuel, storm
  probability/duration, temperature; recomputes a full 24h+ projection (with a
  real diurnal solar/wind profile, not a flat number) using the same physics as
  the live system.
- **Anomaly detection** (IsolationForest) across load/solar/wind/battery/diesel
  with severity, probable cause, and recommendation.
- **Predictive maintenance** health scores (0–100) for solar/wind/battery/diesel/
  power conversion.
- **Alert lifecycle**: OPEN → ACKNOWLEDGED → RESOLVED, persisted in SQLite, with
  real backend endpoints (not UI-only fake state).
- **AI Energy Advisor**: works fully offline via deterministic calculation over
  live state; optional LLM provider (Anthropic/OpenAI) can be wired in via env
  vars purely to *phrase* answers, never to invent numbers, and always falls back
  automatically on any failure.
- **Digital Twin**: live 2D SVG visualization of solar/wind/battery/diesel/load
  nodes and energy flows.
- **Two real stations** (Maitri & Bharati) with independent simulated state,
  switchable from the sidebar.
- **Built-in demo scenario**: "Approaching Polar Storm" — one click schedules a
  storm; watch risk rise, Survival Mode activate, flexible loads drop, diesel
  engage, then recovery.

## 6. Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide icons, React Router
**Backend:** Python 3.11, FastAPI, Pydantic, NumPy, pandas, scikit-learn
**Database:** SQLite (stdlib `sqlite3`)
**Optimization:** Deterministic rule-based dispatch engine (see §14 for rationale)

## 7. Folder Structure

```
POLAR-AI/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entrypoint
│   │   ├── config.py                # single source of truth for all parameters
│   │   ├── api/routes.py            # all REST endpoints
│   │   ├── schemas/models.py        # Pydantic request schemas
│   │   ├── simulation/engine.py     # weather/solar/wind/load/battery/diesel model
│   │   ├── forecasting/forecast.py  # ML forecasting pipeline
│   │   ├── optimization/optimizer.py# explainable rule-based dispatch
│   │   ├── risk/risk.py             # risk score + fuel autonomy
│   │   ├── anomaly/detector.py      # IsolationForest anomaly detection
│   │   ├── maintenance/health.py    # predictive maintenance scoring
│   │   ├── advisor/advisor.py       # deterministic + optional LLM advisor
│   │   ├── advisor/llm_provider.py  # isolated optional LLM integration
│   │   ├── services/                # station registry, orchestrator, alerts,
│   │   │                             # whatif, carbon analytics
│   │   └── database/db.py           # SQLite persistence layer
│   ├── tests/test_core.py           # 17 logic tests (no API key/network needed)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/client.ts            # typed REST client
│       ├── pages/                   # 10 dashboard pages
│       ├── components/              # Sidebar, Header, shared UI
│       └── hooks/usePolling.ts
├── data/                            # SQLite DB file lives here at runtime
├── docs/
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

## 8. Installation (Fresh Machine)

### Prerequisites
- Python 3.11+
- Node.js 18+
- (Optional) Docker + Docker Compose

### Backend Setup
```bash
cd POLAR-AI/backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env       # edit if needed; all defaults work with no API key
uvicorn app.main:app --reload --port 8000
```
Backend now running at `http://localhost:8000` — Swagger docs at
`http://localhost:8000/docs`, health check at `http://localhost:8000/health`.

### Frontend Setup
```bash
cd POLAR-AI/frontend
npm install
npm run dev
```
Frontend now running at `http://localhost:5173` (Vite dev server proxies `/api`
to the backend — see `vite.config.ts`).

### Docker (alternative)
```bash
cd POLAR-AI
docker compose up --build
```
> Note: the production Docker frontend (`serve`) does not proxy `/api` the way
> the Vite dev server does. For the smoothest judge demo, run the frontend with
> `npm run dev` (as above) against the Dockerized or locally-run backend. Wiring
> an nginx reverse proxy for the production frontend container is a documented
> follow-up (see §17).

### Database
No setup required — SQLite auto-initializes (`data/polar_ai.db`) and seeds 24h of
history per station on first run of the backend.

### Running Tests
```bash
cd POLAR-AI/backend
pip install pytest
pytest tests/ -v
```
All 17 tests exercise the simulation/optimizer/risk/whatif/forecast/anomaly/
maintenance logic directly — no API key, no network, no running server required.

### Environment Variables (`.env.example`)
```
BACKEND_PORT=8000
FRONTEND_PORT=5173
DATABASE_URL=sqlite:///./data/polar_ai.db
OPTIONAL_LLM_API_KEY=        # leave blank — app works fully without it
OPTIONAL_LLM_PROVIDER=       # "anthropic" or "openai" if you set a key above
CORS_ORIGINS=http://localhost:5173
```

## 9. AI/ML Instructions

- Forecasting models retrain on-demand from the station's own SQLite telemetry
  history each time `/api/forecast/{horizon}` is called — no pre-trained model
  file to manage.
- Anomaly detection (IsolationForest) and equipment health scoring run over the
  most recent telemetry window on each request.
- No external ML API or GPU required; everything runs on scikit-learn on a
  laptop CPU in milliseconds-to-low-seconds for the demo data volumes involved.

## 10. API Documentation

Interactive Swagger UI: `GET /docs` (auto-generated by FastAPI from the route
signatures + Pydantic schemas). Key endpoint groups:

| Group | Endpoints |
|---|---|
| Stations | `GET /api/stations`, `POST /api/stations/switch` |
| Status/Energy | `GET /api/status`, `/api/energy/current`, `/api/energy/history` |
| Simulation | `POST /api/simulation/control`, `/api/simulation/tick`, `/api/simulation/storm-scenario` |
| Risk/Fuel | `GET /api/risk`, `/api/fuel/autonomy` |
| Optimizer | `GET /api/optimizer/decision`, `POST /api/optimizer/survival-mode` |
| Forecast | `GET /api/forecast/{1\|6\|24}` |
| What-If | `POST /api/whatif/run`, `GET /api/whatif/history` |
| Anomalies/Health | `GET /api/anomalies`, `/api/equipment/health` |
| Alerts | `GET /api/alerts`, `POST /api/alerts/acknowledge`, `/api/alerts/resolve` |
| Carbon/Twin | `GET /api/analytics/carbon`, `/api/digital-twin` |
| Advisor | `POST /api/advisor/ask`, `GET /api/advisor/history` |

## 11. Demo Scenario — Approaching Polar Storm

1. Open **Risk & Resilience** → click **Launch Storm Scenario**.
2. Go to the header **▶ Play** control (or Overview) to keep the simulation
   ticking forward.
3. Watch storm probability climb in the header weather readout.
4. Once probability/forecast-drop crosses threshold, **Polar Survival Mode**
   activates automatically (visible in the header mode badge, Optimizer page,
   and a new CRITICAL alert in Alerts).
5. Flexible loads visibly drop (Overview energy-flow panel, Optimizer's Load
   Priority Status).
6. Diesel engages as renewables fall (Overview KPI + Digital Twin).
7. As the scripted storm window ends, renewables recover and the mode returns
   toward NORMAL.

For a suggested 5–10 minute judge walkthrough, see §33 of the original brief —
Overview → Forecast → Risk (launch storm) → What-If (solar −60%) → Advisor →
Digital Twin → Equipment Health → Analytics.

## 12. Testing

`backend/tests/test_core.py` covers: solar-is-zero-at-night, battery SOC bounds,
diesel capacity limits, fuel non-negativity, **energy balance** (generation +
battery discharge ≈ served load), optimizer survival-mode triggering and manual
override, risk score bounds/levels, fuel autonomy sanity, what-if renewable-drop
directionality and diurnal solar shape, carbon non-negativity, forecast horizon
length, anomaly detection execution, equipment health score ranges, and storm
trigger activation.

**Two real bugs were caught and fixed by this test suite during development**: a
sign-convention error in both the simulator's and optimizer's energy-balance
math was double-counting the battery's contribution instead of subtracting it,
which `test_energy_balance_approximately_holds` and `test_fuel_autonomy_is_finite_and_positive`
caught immediately. This is exactly why the tests exist.

## 13. Assumptions

- Emissions factor: 2.68 kg CO₂ per litre of diesel combusted (standard,
  widely-cited automotive/generator diesel figure).
- Diesel generator efficiency: 3.5 kWh delivered per litre of fuel (demo
  parameter, configurable in `config.py`).
- Battery round-trip efficiency: 95% charge / 95% discharge (configurable).
- "Future weather" inside forecasts persists the latest observed weather
  reading rather than predicting new weather — this is a documented modeling
  simplification appropriate for a short-horizon energy forecast, not a claim of
  real meteorological forecasting skill.

## 14. Optimization Methodology

The dispatch optimizer is **deliberately rule-based/threshold-driven** rather
than a generic LP/MILP solver. This was a conscious trade-off for the
Explainable-AI requirement: every decision returned by `/api/optimizer/decision`
comes with a `reasons` list that names the exact numeric condition responsible
(e.g. *"Battery SOC 15% at/below reserve target 40%"*). A MILP formulation would
be more globally optimal but harder to explain to a non-technical judge in real
time — we chose transparency. The rules encode the load-priority hierarchy
(critical > important > flexible), reserve-target logic for Polar Survival Mode,
and diesel-dispatch-only-when-necessary behavior described in the requirements.

## 15. Explainability Strategy

Every AI-influenced number in the UI is paired with the facts that produced it:
optimizer decisions carry a `reasons[]` list, the risk score carries a 5-factor
`explanation[]` list plus a `factors{}` breakdown, and the AI Advisor answers by
reading the same computed state rather than a separate "creative" model. No
component displays an unexplained AI verdict.

## 16. Software-Only Architecture

No physical sensors, microcontrollers, or energy hardware are required at any
point. `app/simulation/engine.py` is the sole source of "hardware" behavior, and
it runs entirely as Python on a laptop CPU. Swapping in real telemetry later
(e.g. a genuine NCPOR data feed) would mean replacing calls into this module
with calls into a real data-ingestion layer — the rest of the stack (forecasting,
optimization, risk, alerts, dashboard) is unaffected because it consumes the same
`StationTick` shape either way.

## 17. Known Limitations

- Weather is simulated, not fetched from a live meteorological API (clearly
  labeled `SIMULATION_FALLBACK_ACTIVE`) — wiring a real provider (e.g.
  Open-Meteo) is straightforward future work given the `weather` field is
  already isolated in `simulation/engine.py`.
- The production Docker frontend build does not yet proxy `/api` to the backend
  container (see §8) — use `npm run dev` for the smoothest demo today, or add an
  nginx config as a follow-up.
- The MILP/OR-Tools-style optimizer described as "if practical" in the original
  brief was intentionally not used in favor of an explainable rule-based engine
  (§14) — a true multi-period LP optimizer (e.g. via SciPy's `linprog` or
  OR-Tools) is a natural next iteration for globally-optimal (vs. greedy) dispatch.
- Forecast models retrain from scratch on each request rather than being cached/
  persisted as model artifacts — fine for demo data volumes, would want caching
  for a longer-running deployment.
- Frontend has not been build-verified in this environment (no network access to
  `npm install` here) — TypeScript source was hand-reviewed for correctness; run
  `npm run build` locally to confirm before a live demo.

## 18. Future Scope

- Live meteorological data integration (Open-Meteo / IMD) with automatic
  fallback to simulation when unavailable.
- True multi-period LP/MILP optimization for globally optimal dispatch.
- Persisted/cached ML models with scheduled retraining instead of per-request
  training.
- Multi-station comparison view (Maitri vs Bharati side-by-side).
- WebSocket/SSE push updates in place of polling for lower-latency live updates.
- Historical trend analytics beyond the current session (long-term degradation
  curves, seasonal comparison).

---

*All simulated figures in this application are demonstration data for a software
prototype and do not represent real operational telemetry from any NCPOR
facility.*
