# Autodata → knowledge_base

Converters for ModelScope / Desktop autodata packs used by Garage Genius RAG.

| Dataset | Source | Converter | Seed output |
|---|---|---|---|
| DTC definitions | `scripts/data/autodata/DTC_dtc_definitions.csv` | `scripts/train/dtc-csv-to-knowledge.mjs` | `scripts/data/dtc-knowledge-seed.json` |
| CarRepairQA | Desktop `…/CarRepairQA/dataset.jsonl` (or `--in=`) | `scripts/train/car-repair-qa-to-knowledge.mjs` | `scripts/data/car-repair-qa-knowledge-seed.json` |
| car_fault | `scripts/data/autodata/car_fault/*.txt` | `scripts/train/car-fault-to-knowledge.mjs` | `scripts/data/car-fault-knowledge-seed.json` |
| carBrands50 | `scripts/data/autodata/carBrands50/classname.txt` | `scripts/train/car-brands50-to-knowledge.mjs` | `scripts/data/car-brands50-knowledge-seed.json` |

```bash
# Convert only
npm run train:dtc
npm run train:car-repair-qa
npm run train:car-fault
npm run train:car-brands
# or all:
npm run train:autodata

# Incremental text insert (skip existing ingest_key; no embeddings)
npm run seed:dtc:text
npm run seed:car-repair-qa:text
npm run seed:car-fault:text
npm run seed:car-brands:text
# or all:
npm run seed:autodata:text
```

Notes:
- **Car/** parquet images and **carBrands50** train/val JPGs are skipped (not text RAG). Brands list only.
- CarRepairQA / car_fault stay **Chinese** symptoms (`metadata.language=zh`); DTC / brands are **English**.
- car_fault answers are **system triage + DIY first checks** (labels are classification classes, not full repair manuals).
- Use `:force` scripts only to rewrite existing rows.
