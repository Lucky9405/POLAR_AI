"""
AI Energy Advisor
===================
The advisor MUST work fully offline/without any API key: `answer_deterministic`
computes real answers directly from the current DISPATCH STATE (the same
single source of truth the rest of the dashboard reads) using simple intent
matching — it never invents a number that isn't in that state.

If OPTIONAL_LLM_API_KEY / OPTIONAL_LLM_PROVIDER are set (provider "gemini",
"anthropic", or "openai"), `answer` tries the LLM first to phrase things more
naturally, but the LLM is given the deterministic facts as grounding context
and instructed not to invent numbers, and any failure/timeout falls back to
the deterministic engine automatically.
"""
from __future__ import annotations
import re
from app.config import app_config


def answer_deterministic(question: str, state: dict) -> str:
    q = question.lower()
    d = state["dispatch"]
    carbon = state["carbon"]

    solar, wind, renewable = d["solar_kw"], d["wind_kw"], d["renewable_kw"]
    battery_kw, battery_soc = d["battery_power_kw"], d["battery_soc_pct"]
    diesel_kw, diesel_on = d["diesel_kw"], d["diesel_on"]
    demand = d["demand_kw"]

    if re.search(r"why.*diesel|diesel.*on|diesel.*running|diesel.*off", q):
        if diesel_on:
            curtail_note = ""
            if d["curtailment_kw"] > 0.1:
                loads = d["loads"]
                curtailed_tiers = [name for name, l in loads.items() if l["curtailed_kw"] > 0.1]
                curtail_note = (
                    f" Even with diesel running, renewable + battery + diesel together still fall short by "
                    f"{d['curtailment_kw']:.1f} kW, so {'/'.join(curtailed_tiers)} load remains curtailed — "
                    f"likely diesel capacity or fuel availability limited. Critical and essential loads remain "
                    f"fully protected ({loads['critical']['supplied_kw']} kW and {loads['essential']['supplied_kw']} kW)."
                )
            return (
                f"Diesel is ON, supplying {diesel_kw} kW. Renewable generation is {renewable:.1f} kW "
                f"(solar {solar} kW + wind {wind} kW) against demand of {demand:.1f} kW, and the battery "
                f"({'discharging' if battery_kw < 0 else 'standby'} at {battery_soc}% SOC) is at or near its "
                f"protected reserve of {d['battery_reserve_target_pct']:.0f}%, so diesel is covering the remaining "
                f"shortfall as a last resort. Reason logged: {d['active_decision']}{curtail_note}"
            )
        if d["curtailment_kw"] > 0.1:
            loads = d["loads"]
            curtailed_tiers = [name for name, l in loads.items() if l["curtailed_kw"] > 0.1]
            return (
                f"Diesel is OFF/standby, but it is NOT fully covering demand — renewable ({renewable:.1f} kW) "
                f"plus battery ({d['battery_state'].lower()} at {battery_soc}% SOC) could not cover the full "
                f"{demand:.1f} kW, so {d['curtailment_kw']:.1f} kW of {'/'.join(curtailed_tiers)} load was "
                f"curtailed instead of starting diesel. Critical and essential loads remain fully protected "
                f"({loads['critical']['supplied_kw']} kW and {loads['essential']['supplied_kw']} kW respectively). "
                f"Reason diesel didn't start: {d['active_decision']}"
            )
        return (
            f"Diesel is OFF/standby. Renewable generation ({renewable:.1f} kW) plus battery "
            f"({'charging' if battery_kw > 0 else 'available'} at {battery_soc}% SOC) is fully covering the "
            f"{demand:.1f} kW demand, so diesel is not needed right now."
        )

    if re.search(r"storm|tomorrow", q) and re.search(r"enough|energy|survive|handle", q):
        return (
            f"Storm probability is currently {d['weather']['storm_probability_pct']}%. Battery is at "
            f"{battery_soc}% SOC (reserve target {d['battery_reserve_target_pct']:.0f}%), and fuel autonomy is "
            f"~{d['fuel_autonomy_days']} days. Current risk is {d['risk_score']}/100 ({d['risk_level']}). "
            + ("Survival Mode is active — reserve raised and flexible/deferrable loads reduced to prepare."
               if d["survival_mode"] else
               "Survival Mode is not active yet; it will trigger automatically if storm probability or forecast "
               "renewable drop crosses threshold.")
        )

    if re.search(r"fuel.*save|save.*fuel", q):
        return (f"So far the station has saved an estimated {carbon['fuel_saved_l']} L of diesel "
                f"({carbon['co2_avoided_kg']} kg CO2 avoided) by using renewables, based on a "
                f"{carbon['emissions_factor_kg_per_l']} kg CO2/L diesel factor.")

    if re.search(r"risk", q):
        return f"Current energy risk score is {d['risk_score']}/100 ({d['risk_level']})."

    if re.search(r"solar.*(fall|drop|decrease)|what.*if.*solar", q):
        m = re.search(r"(\d+)\s*%", q)
        pct = m.group(1) if m else "50"
        return (f"Use the What-If Simulator with Solar Generation set to -{pct}% to get an exact "
                f"projection — it recomputes fuel required, minimum battery SOC, and risk using the same "
                f"engine behind this dashboard.")

    if re.search(r"fuel.*autonomy|how long.*fuel|days.*fuel", q):
        return f"Estimated fuel autonomy is {d['fuel_autonomy_days']} days at {d['diesel_fuel_liters']} L in tank."

    if re.search(r"battery", q):
        return (f"Battery is {d['battery_state']} at {battery_soc}% SOC ({abs(battery_kw):.1f} kW), with a "
                f"protected reserve of {d['battery_reserve_target_pct']:.0f}%.")

    if re.search(r"load|critical|essential|flexible|deferrable|priorit", q):
        loads = d["loads"]
        return (f"Critical: {loads['critical']['supplied_kw']} kW ({loads['critical']['status']}) · "
                f"Essential: {loads['essential']['supplied_kw']} kW ({loads['essential']['status']}) · "
                f"Flexible: {loads['flexible']['supplied_kw']} kW ({loads['flexible']['status']}) · "
                f"Deferrable: {loads['deferrable']['supplied_kw']} kW ({loads['deferrable']['status']}).")

    if re.search(r"mode|strategy|operating", q):
        return (f"Operating mode: {d['operating_mode']}. {d['active_decision']}")

    curtail_note = f", Curtailed: {d['curtailment_kw']:.1f} kW" if d["curtailment_kw"] > 0.1 else ""
    return (
        f"Station snapshot — Demand: {demand:.1f} kW, Solar: {solar} kW, Wind: {wind} kW "
        f"(Renewable share {d['renewable_share_pct']}%), Battery: {battery_soc}% SOC ({d['battery_state']}), "
        f"Diesel: {'ON ' + str(diesel_kw) + ' kW' if diesel_on else 'OFF'}{curtail_note}, Mode: {d['operating_mode']}, "
        f"Risk: {d['risk_score']}/100 ({d['risk_level']}). Ask me about diesel status, storm readiness, "
        f"fuel savings, load priorities, or the current strategy."
    )


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
