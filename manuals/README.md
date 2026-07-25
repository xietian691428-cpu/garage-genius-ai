# Owner manuals (local PDF drop folder)

Place PDFs here for ingest, e.g.:

```bash
npm run ingest:manual -- --file=manuals/toyota_camry_2023_US.pdf --market=US --make=Toyota --model=Camry --years=2023
```

Naming tip for batch (`--dir=manuals`):

`{make}_{model}_{year}_{market}.pdf` → `toyota_camry_2023_US.pdf`

**Copyright:** Only ingest manuals you have rights to use (OEM license, purchased, or authorized DIY excerpts). Do not scrape or redistribute full commercial manuals.
