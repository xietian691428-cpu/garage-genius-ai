# AutoCare VCdb → AI / DeepSeek Fine-tune JSONL

## What this SQL file actually is

| Expectation | Reality |
|---|---|
| OEM part numbers | **Not present** |
| Aftermarket brands / prices | **Not present** |
| Part categories (pads, filters…) | **Not present** |
| Year / Make / Model / Engine / Trans / Drive / Brakes | **Yes — this is VCdb** |

**File:** `AutoCare_VCdb_NA_LDMDHDPS_enUS_MySQL_20260625.sql` (~176 MB)  
**Standard:** AutoCare **VCdb** (Vehicle Configuration Database)

### Critical fields extracted

| Area | Tables / fields |
|---|---|
| Identity | `YearID`, `Make.MakeName`, `Model.ModelName`, `SubModel.SubModelName` |
| Vehicle | `BaseVehicle` → `Vehicle` |
| Engine | `EngineConfig` → `EngineBase` (Liter, Cylinders, BlockType), Aspiration, FuelType |
| Driveline | `Transmission*`, `DriveType` |
| Brakes | `BrakeConfig` (front/rear type, ABS) |
| Links | `VehicleToEngineConfig`, `VehicleToTransmission`, `VehicleToDriveType`, `VehicleToBrakeConfig` |

For **OEM + brand + price** training you need **PCdb / PAdb / ACES**.

---

## Autodata corpora (DTC + CarRepairQA)

```bash
npm run train:dtc                 # → scripts/data/dtc-knowledge-seed.json
npm run seed:dtc:text             # incremental text-only insert

npm run train:car-repair-qa       # reads Desktop CarRepairQA JSONL by default
npm run seed:car-repair-qa:text
```

Details: [`scripts/data/autodata/README.md`](../data/autodata/README.md).

---

## Autodata (DTC + CarRepairQA)

```bash
npm run train:autodata          # → dtc- + car-repair-qa- knowledge seed JSON
npm run seed:autodata:text      # incremental text insert (--only-new, no embeddings)
```

See [`scripts/data/autodata/README.md`](../data/autodata/README.md). Skip the `Car/` image parquet — it is not Q&A text.

---

## Hybrid RAG (FTS + pgvector + RRF)

No OpenAI required for basic retrieval:

1. Run migration `009_hybrid_rag_fts.sql` in Supabase (adds `content_tsv`, `match_knowledge_fts`, `match_knowledge_hybrid`).
2. Chat RAG prefers **hybrid RRF**; without embeddings it degrades to **FTS-only**.
3. Optional: fill `embedding` later (OpenAI / DeepSeek / local) to unlock vector half of RRF.

`lib/rag.ts` order: hybrid → FTS → legacy `match_documents` → JS keyword fallback.

---

## VCdb runtime (vehicle picker + chat config card)

Without fine-tuning, the SQLite cache powers live fitment:

```bash
# Ensure cache exists (gitignored, ~79MB)
python3 scripts/train/vcdb_sql_to_jsonl.py \
  --sql "/path/to/AutoCare_VCdb_....sql" \
  --sqlite scripts/data/vcdb-cache.sqlite \
  --limit 100
```

API: `GET /api/vcdb?action=years|makes|models|submodels|options|resolve|status`

UI: Add Vehicle → cascading Year/Make/Model/Trim/Engine/Trans/Drive/Brakes  
Chat: `formatVehicleConfigCard()` injects authoritative config into the system prompt.

### RAG knowledge from VCdb (config + DIY templates)

```bash
npm run train:knowledge          # → scripts/data/vcdb-knowledge-seed.json
npm run train:knowledge:append   # append more vehicles

# Import into Supabase knowledge_base
npm run seed:knowledge -- --file=scripts/data/vcdb-knowledge-seed.json --file-only
# or text-only (no embeddings):
npm run seed:knowledge:file:text  # still points at knowledge-seed.json — prefer:
node --env-file=.env.local --import tsx scripts/seed-knowledge.ts -- --file=scripts/data/vcdb-knowledge-seed.json --file-only --skip-embeddings
```

Each vehicle yields 4 RAG docs: config card, brake DIY, oil service, battery basics.

---

## 1) Build SQLite cache (once)

```bash
python3 scripts/train/vcdb_sql_to_jsonl.py \
  --sql "/Users/xietian/Desktop/车库天才garage-genius-ai/训练数据/AutoCare_VCdb_NA_LDMDHDPS_enUS_MySQL_20260625.sql" \
  --sqlite scripts/data/vcdb-cache.sqlite \
  --limit 100
```

## 2) DeepSeek fine-tune JSONL (Node.js, recommended)

```bash
# Analyze schema
npm run train:analyze

# Generate 500 high-quality chat samples
npm run train:deepseek

# Append more later (deduped by content hash)
npm run train:deepseek:append
# or:
node scripts/train/vcdb-to-deepseek-jsonl.mjs --count 200 --append
```

### DeepSeek line format

```json
{
  "messages": [
    { "role": "system", "content": "<Garage Genius fine-tune system prompt>" },
    { "role": "user", "content": "…" },
    { "role": "assistant", "content": "…" }
  ]
}
```

### Sample mix (4 families)

1. **车型识别 + 配置查询** — `vehicle_identity` / `config_query_*`
2. **零件适配判断** — `parts_fitment` (config-grounded; no fake OEM)
3. **故障诊断** — `fault_diagnosis` (probabilities + Focus Mode)
4. **维修指导** — `repair_guidance` (tools / steps / safety / disclaimer)

Outputs:

- `scripts/data/deepseek-finetune.jsonl` — upload to DeepSeek fine-tune
- `scripts/data/deepseek-finetune.meta.json` — type counts / provenance
- `scripts/train/deepseek-finetune-system-prompt.txt` — system prompt template
- `scripts/train/deepseek-finetune-system-prompt.mjs` — same prompt as JS export

---

## System prompt (fine-tuned model)

Use `scripts/train/deepseek-finetune-system-prompt.txt` as the base system message in production, then append runtime vehicle + RAG context (same pattern as `lib/chat-system-prompt.ts`).

---

## Legacy Python instruction/output JSONL

```bash
python3 scripts/train/vcdb_sql_to_jsonl.py --skip-import --limit 5000
```

Produces `scripts/data/vcdb-train.jsonl` with `{instruction,response,metadata}`.
