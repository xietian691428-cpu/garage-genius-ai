# Owner reviews → knowledge_base

Append real owner Q&A as **JSON Lines** to [`owner-reviews.jsonl`](./owner-reviews.jsonl).

## Required fields (per line)

| Field | Notes |
| --- | --- |
| `id` | Stable unique key → `metadata.ingest_key` (re-seed updates in place) |
| `brand` / `model` / `year_range` | Vehicle fitment |
| `category` | e.g. `fuel_economy`, `reliability`, `comfort` (Chinese labels also map) |
| `question` / `answer` | Prefer **English**. Non-English text should be translated before seed. |
| `source` | Attribution label |
| `sentiment` / `upvotes` / `keywords` | Optional metadata |
| `market` | `US` (default), `EU`, or `GB` |

## Workflow

1. Append new lines to `owner-reviews.jsonl` (English Q&A), **or** harvest + LLM-clean:
   - See [`scripts/scrape/car_qa/README.md`](../scrape/car_qa/README.md)
2. Convert + seed **only missing rows** (skips ingest_keys already in DB):

```bash
npm run seed:owner-reviews
# or text-only (no embeddings):
npm run seed:owner-reviews:text
```

Expected log shape: `skipped N already seeded` then insert ~new Q&A count only.

To rewrite existing rows (rare):

```bash
npm run seed:owner-reviews:text:force
```

Chat always answers users in **English**, even if they ask in Chinese or another language.
