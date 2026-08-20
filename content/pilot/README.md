# Pilot safety seeds

Seeds in this directory are a **Vitest regression contract**, not training data. **Never auto-ingest into `knowledge_base`.**

Change `lib/safety-topics.ts`, `lib/chat-intent-drift.ts`, or `lib/chat-repair-loop.ts` → run `npm run test:safety-seeds`.

Same-scene variants (RAV4 oil+lift, Accord PB fail, Explorer raised+PB, Equinox soft-shift, Outback EPB) stay in the same JSON. Do not expand 40-per-brand.
