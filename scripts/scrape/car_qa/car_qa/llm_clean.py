"""LLM helpers: raw posts → English owner-reviews JSONL schema."""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

SYSTEM_PROMPT = """You are a data cleaner for Garage Genius AI (US DIY automotive assistant / coach corpus).

Extract structured owner Q&A from raw data (NHTSA complaints/recalls, EPA MPG, forums).
Output ONLY valid JSON: an array of objects (max 3 per input batch item group).
Write every question and answer in clear US English.

Focus topics (prefer these when the source supports them — **highest weight first**):
1. **mileage-based maintenance / prevention Q&A** (strongly prefer extracting or writing these)
   Examples: advice around 30k / 50k / 60k / 75k / 80k / 100k miles
   (or ~5万 / 8万 / 10万 km when the source uses metric — still answer in US English miles)
2. maintenance schedule / service intervals
3. safety issues and recalls
4. common problems by mileage
5. DIY tips (tools, steps, DIY vs shop)
6. realistic cost estimates (only if implied or stated in the source)
7. For Tesla / EV sources: battery degradation, charging, software updates, range, heat pump

Brand-specific coaching emphasis (when brand/model matches):
- **Luxury** (BMW, Mercedes-Benz, Audi, Lexus, Genesis, Porsche, Acura):
  prefer Q&A on maintenance cost, long-term reliability, electronics / driver-assist quirks,
  and expensive wear items — still grounded in the source; use category maintenance / reliability / luxury when fitting.
- **Hyundai / Kia**: emphasize value, warranty context, hybrid/EV notes when present, and practical DIY vs dealer cost.
- **Volvo**: emphasize safety systems and Nordic comfort/ride notes when the source supports them.

When a complaint/recall can reasonably support a preventive takeaway, prefer category **maintenance**
(or reliability) over a pure problem dump — still stay faithful to the source.

Coach-style answers (important):
- Prefer preventive maintenance coaching over only listing problems.
- When the source describes a fault, also add a short "what to do next / how to prevent recurrence"
  line grounded in that same source (do not invent OEM schedules).
- If mileage or age cues appear, frame advice as "at about X miles, prioritize …".
- Prioritize extracting or generating mileage-based maintenance / prevention Q&A
  (e.g. node suggestions at ~50k / 80k / 100k miles).

Each object MUST include at least:
  id, brand, model, year_range, category, question, answer, source
Also include when possible:
  source_url, date, upvotes, sentiment, keywords, market, language

Rules:
1. category must be one of:
   fuel_economy, reliability, comfort, space, powertrain, interior,
   maintenance, driving, safety, value, buying_advice, offroad, luxury,
   practicality, performance, handling
2. Prefer: maintenance, reliability, safety, powertrain, fuel_economy.
3. Phrase maintenance answers as actionable coaching (what/when/DIY vs shop/cost cues)
   without inventing schedules or prices not supported by the source.
4. sentiment: positive | neutral | negative
5. market: US | EU | GB (default US)
6. language: always "en"
7. id: lowercase snake, unique (brand_model_hash_shortq)
8. Skip ads, spam, off-topic, or posts without a usable owner insight.
9. Do not invent facts. NHTSA/recall answers stay factual and safety-aware;
   suggest verifying with a dealer when safety systems are involved.
10. Output is for append-only JSONL knowledge base — keep each Q&A self-contained.
11. Generate preventive coach guidance, not only a problem list.
"""


def slug_id(brand: str, model: str, year_range: str, question: str) -> str:
    base = f"{brand}_{model}_{year_range}_{question}".lower()
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]
    short_q = re.sub(r"[^a-z0-9]+", "_", question.lower())[:40].strip("_")
    return f"{re.sub(r'[^a-z0-9]+', '_', brand.lower())}_{re.sub(r'[^a-z0-9]+', '_', model.lower())}_{digest}_{short_q}"[
        :120
    ]


def _client(provider: str):
    from openai import OpenAI

    provider = (provider or "openai").lower().strip()
    if provider == "grok":
        key = os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY")
        if not key:
            raise RuntimeError("Missing XAI_API_KEY / GROK_API_KEY for provider=grok")
        return OpenAI(
            api_key=key,
            base_url=os.getenv("XAI_BASE_URL", "https://api.x.ai/v1"),
        )
    if provider == "ollama":
        return OpenAI(
            api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
        )
    if provider == "deepseek":
        key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("Missing DEEPSEEK_API_KEY for provider=deepseek")
        return OpenAI(
            api_key=key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        )
    # openai (+ optional OPENAI_BASE_URL for compatible gateways)
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("Missing OPENAI_API_KEY for provider=openai")
    kwargs: dict[str, Any] = {"api_key": key}
    base = os.getenv("OPENAI_BASE_URL")
    if base:
        kwargs["base_url"] = base
    return OpenAI(**kwargs)


def resolve_provider_and_model(
    provider: str | None,
    model: str | None,
) -> tuple[str, str]:
    """
    Normalize provider/model.
    Using --provider=openai --model=deepseek-chat hits api.openai.com and 404s —
    auto-route deepseek-* models to provider=deepseek.
    """
    provider = (provider or os.getenv("LLM_PROVIDER") or "openai").lower().strip()
    model = (model or os.getenv("LLM_MODEL") or "").strip()

    if model.startswith("deepseek") or provider == "deepseek":
        return "deepseek", model or "deepseek-chat"
    if provider == "grok":
        return "grok", model or "grok-2-latest"
    if provider == "ollama":
        return "ollama", model or "llama3.2"
    return "openai", model or "gpt-4o-mini"


@retry(wait=wait_exponential(multiplier=1, min=2, max=20), stop=stop_after_attempt(3))
def llm_clean_batch(
    posts: list[dict[str, Any]],
    *,
    provider: str = "openai",
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Send a small batch of raw posts; return structured Q&A dicts."""
    if not posts:
        return []

    provider, model = resolve_provider_and_model(provider, model)
    client = _client(provider)

    user_payload = {
        "posts": [
            {
                "brand": p.get("brand"),
                "model": p.get("model"),
                "year_range": p.get("year_range"),
                "source": p.get("source"),
                "source_url": p.get("source_url"),
                "title": p.get("title"),
                "body": (p.get("body") or "")[:2500],
                "comments": (p.get("comments") or [])[:8],
                "score": p.get("score"),
            }
            for p in posts
        ]
    }

    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Return JSON object with key `items` (array of Q&A).\n"
                    + json.dumps(user_payload, ensure_ascii=False)
                ),
            },
        ],
    )
    text = resp.choices[0].message.content or "{}"
    data = json.loads(text)
    items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []

    cleaned: list[dict[str, Any]] = []
    for row in items:
        if not isinstance(row, dict):
            continue
        q = str(row.get("question") or "").strip()
        a = str(row.get("answer") or "").strip()
        if not q or not a:
            continue
        brand = str(row.get("brand") or posts[0].get("brand") or "").strip()
        model_name = str(row.get("model") or posts[0].get("model") or "").strip()
        years = str(row.get("year_range") or posts[0].get("year_range") or "2023-2025").strip()
        rid = str(row.get("id") or "").strip() or slug_id(brand, model_name, years, q)
        cleaned.append(
            {
                "id": rid,
                "brand": brand,
                "model": model_name,
                "year_range": years,
                "category": str(row.get("category") or "reliability").strip(),
                "question": q,
                "answer": a,
                "source": str(row.get("source") or posts[0].get("source") or "Owner reviews"),
                "source_url": str(row.get("source_url") or posts[0].get("source_url") or "multiple"),
                "date": str(row.get("date") or "2025"),
                "upvotes": int(row.get("upvotes") or posts[0].get("score") or 0),
                "sentiment": str(row.get("sentiment") or "neutral"),
                "keywords": row.get("keywords")
                if isinstance(row.get("keywords"), list)
                else [],
                "market": str(row.get("market") or "US"),
                "language": "en",
            }
        )
    return cleaned
