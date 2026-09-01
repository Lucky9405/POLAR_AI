"""
Optional LLM Provider (isolated)
==================================
Only imported/called when OPTIONAL_LLM_API_KEY + OPTIONAL_LLM_PROVIDER are
both set. Never commit real secrets — configure via environment variables
(.env, not checked into source control).

This module deliberately does the minimum: it asks the LLM to *phrase*
an answer using facts we already computed deterministically
(`fallback_facts`), not to invent its own numbers. Any failure/timeout
propagates as an exception, which `advisor.answer()` catches and falls
back to the deterministic engine — the app must always work without this.
"""
from __future__ import annotations
import os
import json
import urllib.request

from app.config import app_config

TIMEOUT_SECONDS = 8


def call_llm(question: str, state: dict, fallback_facts: str) -> str | None:
    provider = (app_config.optional_llm_provider or "").lower()
    api_key = app_config.optional_llm_api_key
    if not api_key:
        return None

    system_prompt = (
        "You are the AI Energy Advisor for POLAR-AI, a polar research station energy "
        "management system. Rephrase the following computed facts into a clear, concise "
        "operator-facing answer. Do NOT invent any numbers not present in the facts."
    )
    user_prompt = f"Question: {question}\n\nComputed facts:\n{fallback_facts}"

    if provider == "anthropic":
        return _call_anthropic(api_key, system_prompt, user_prompt)
    if provider == "openai":
        return _call_openai(api_key, system_prompt, user_prompt)
    return None


def _call_anthropic(api_key: str, system_prompt: str, user_prompt: str) -> str | None:
    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 400,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        data = json.loads(resp.read())
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text") or None


def _call_openai(api_key: str, system_prompt: str, user_prompt: str) -> str | None:
    body = json.dumps({
        "model": "gpt-4o-mini",
        "max_tokens": 400,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        data = json.loads(resp.read())
    choices = data.get("choices", [])
    return choices[0]["message"]["content"] if choices else None
