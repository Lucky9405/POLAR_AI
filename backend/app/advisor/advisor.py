"""
AI Energy Advisor
===================
The advisor MUST work fully offline/without any API key: `answer_deterministic`
computes real answers directly from current application state using simple
intent matching. If OPTIONAL_LLM_API_KEY / OPTIONAL_LLM_PROVIDER are set,
`answer` will try the LLM first (to phrase things more naturally) but always
falls back to the deterministic engine on any error/timeout, and the LLM is
given the same computed facts as context — it is never allowed to invent
numbers.
"""
from __future__ import annotations
import re
from app.config import app_config


def _fmt(v, unit=""):
    return f"{v}{unit}"


def answer_deterministic(question: str, state: dict) -> str:
    q = question.lower()

    tick = state["latest_tick"]
    risk = state["risk"]
    autonomy = state["autonomy"]
    optimizer = state["optimizer"]
    carbon = state["carbon"]

    if re.search(r"why.*diesel|diesel.*on|diesel.*running", q):
        if tick["diesel_on"]:
            return ("Diesel is ON because: " + "; ".join(optimizer["reasons"]) +
                    f". Current diesel output is {tick['diesel_output_kw']} kW.")
        return "Diesel is currently OFF/standby — renewables and battery are covering demand without it."

    if re.search(r"storm|tomorrow", q) and re.search(r"enough|energy|survive|handle", q):
        return (
            f"Storm probability is currently {tick['weather']['storm_probability_pct']}%. "
            f"Battery reserve is {tick['battery_soc_pct']}% and fuel autonomy is "
            f"~{autonomy['days']} days ({autonomy['fuel_in_tank_l']} L in tank). "
            f"Current energy risk is {risk['score']}/100 ({risk['level']}). "
            + ("Survival Mode is active, increasing reserve and cutting flexible loads to prepare."
               if optimizer["survival_mode"] else
               "Survival Mode is not yet active; it will trigger automatically if storm probability "
               "or forecast renewable drop crosses threshold.")
        )

    if re.search(r"fuel.*save|save.*fuel", q):
        return (f"So far the station has saved an estimated {carbon['fuel_saved_l']} L of diesel "
                f"({carbon['co2_avoided_kg']} kg CO2 avoided) by using renewables, based on a "
                f"{carbon['emissions_factor_kg_per_l']} kg CO2/L diesel factor.")

    if re.search(r"risk", q):
        return (f"Current energy risk score is {risk['score']}/100 ({risk['level']}). Key factors: "
                + "; ".join(risk["explanation"]))

    if re.search(r"solar.*(fall|drop|decrease)|what.*if.*solar", q):
        m = re.search(r"(\d+)\s*%", q)
        pct = m.group(1) if m else "50"
        return (f"Use the What-If Simulator with Solar Generation set to -{pct}% to get an exact "
                f"projection — it will recompute fuel required, minimum battery SOC, and risk score "
                f"for that scenario using the same engine as the live dashboard.")

    if re.search(r"fuel.*autonomy|how long.*fuel|days.*fuel", q):
        return (f"Estimated fuel autonomy is {autonomy['days']} days ({autonomy['autonomy_range_low_days']}"
                f"-{autonomy['autonomy_range_high_days']} day range), based on {autonomy['fuel_in_tank_l']} L "
                f"in tank and a predicted consumption of {autonomy['predicted_daily_consumption_l']} L/day.")

    if re.search(r"battery", q):
        return (f"Battery is at {tick['battery_soc_pct']}% SOC, "
                f"{'charging' if tick['battery_power_kw'] > 0 else 'discharging' if tick['battery_power_kw'] < 0 else 'idle'} "
                f"at {abs(tick['battery_power_kw'])} kW. Effective capacity is {tick['battery_capacity_kwh']} kWh "
                f"after simulated degradation.")

    return (f"Here's the current station snapshot — Load: {tick['load_total_kw']} kW, "
            f"Solar: {tick['solar_kw']} kW, Wind: {tick['wind_kw']} kW, Battery: {tick['battery_soc_pct']}%, "
            f"Diesel: {'ON' if tick['diesel_on'] else 'OFF'}, Fuel: {tick['diesel_fuel_liters']} L, "
            f"Risk: {risk['score']}/100 ({risk['level']}). Ask me about diesel status, storm readiness, "
            f"fuel savings, risk factors, or a specific what-if scenario.")


def answer(question: str, state: dict) -> dict:
    """Returns {answer, source} — source is 'llm' or 'deterministic'."""
    if app_config.optional_llm_api_key and app_config.optional_llm_provider:
        try:
            from app.advisor.llm_provider import call_llm  # isolated, optional import
            fallback_facts = answer_deterministic(question, state)
            llm_text = call_llm(question, state, fallback_facts)
            if llm_text:
                return {"answer": llm_text, "source": "llm"}
        except Exception:
            pass  # fall through to deterministic — app must always work
    return {"answer": answer_deterministic(question, state), "source": "deterministic"}
