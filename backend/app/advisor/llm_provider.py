from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from google import genai

load_dotenv()


def _client() -> genai.Client | None:
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        return None

    return genai.Client(api_key=api_key)


def generate_advisor_response(
    question: str,
    station_context: dict[str, Any],
) -> str | None:
    """
    Generate an AI Advisor response using Gemini.

    Returns None when Gemini is unavailable so the deterministic
    POLAR-AI advisor can safely provide the fallback response.
    """

    client = _client()

    if client is None:
        return None

    context = _format_context(station_context)

    system_instruction = """
You are POLAR-AI Energy Advisor.

You assist operators of Indian Antarctic research stations
Maitri and Bharati.

You are an advisory system for a software demonstration.
You do NOT directly control equipment.

IMPORTANT RULES:

1. Use only the station information supplied in the context.
2. Never invent telemetry, weather measurements, forecasts,
   equipment states, fuel levels, battery levels, or numerical values.
3. Treat electrical telemetry and weather as simulated/model-derived
   demonstration data unless explicitly marked otherwise.
4. Clearly distinguish simulated, derived, and model-derived information.
5. When explaining a recommendation, reference the actual factors
   supplied by POLAR-AI.
6. If the supplied data is insufficient to answer something,
   say that the available model data is insufficient.
7. Do not claim access to private NCPOR systems or real station telemetry.
8. Do not provide instructions that directly operate physical equipment.
9. Keep answers concise and useful to an operator.
10. Prefer bullet points when explaining multiple factors.
11. When discussing risk, explain WHY the risk is high rather than
    simply repeating the score.
12. When discussing diesel, battery, renewable generation or reserve,
    explain the energy-balance reason using the supplied values.
"""

    prompt = f"""
{system_instruction}

CURRENT POLAR-AI STATION CONTEXT
--------------------------------
{context}

OPERATOR QUESTION
-----------------
{question}

Answer as the POLAR-AI Energy Advisor.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        text = response.text

        if not text:
            return None

        return text.strip()

    except Exception as e:
        print(f"Gemini API error: {type(e).__name__}: {e}")
        return None


def _format_context(data: dict[str, Any]) -> str:
    lines: list[str] = []

    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"{key}:")
            for child_key, child_value in value.items():
                lines.append(f"  {child_key}: {child_value}")
        elif isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {value}")

    return "\n".join(lines)