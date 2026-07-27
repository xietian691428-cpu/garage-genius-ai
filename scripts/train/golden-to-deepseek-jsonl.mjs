#!/usr/bin/env node
/**
 * Export golden_qa → DeepSeek fine-tune JSONL (offline / monthly).
 *
 * Usage (with env):
 *   node --env-file=.env.local --import tsx scripts/train/golden-to-deepseek-jsonl.mjs
 *   … --mark-used   # stamp used_in_finetune_at
 *
 * Then run finetune.py (or DeepSeek console) on the output file.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const outPath = path.join(ROOT, "scripts/data/golden-finetune.jsonl");
const markUsed = process.argv.includes("--mark-used");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const system =
  "You are Garage Genius, a careful DIY auto-repair coach. Prefer safe, vehicle-aware guidance with clear next steps and disclaimers.";

const { data, error } = await admin
  .from("golden_qa")
  .select("id, question, answer")
  .is("used_in_finetune_at", null)
  .order("created_at", { ascending: true })
  .limit(2000);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
const lines = rows.map((r) =>
  JSON.stringify({
    messages: [
      { role: "system", content: system },
      { role: "user", content: r.question },
      { role: "assistant", content: r.answer },
    ],
  }),
);

fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
console.log(`Wrote ${lines.length} lines → ${outPath}`);

if (markUsed && rows.length) {
  const ids = rows.map((r) => r.id);
  const { error: updErr } = await admin
    .from("golden_qa")
    .update({ used_in_finetune_at: new Date().toISOString() })
    .in("id", ids);
  if (updErr) console.error("mark-used failed:", updErr.message);
  else console.log(`Marked ${ids.length} golden_qa as used_in_finetune`);
}

console.log("Next: python finetune.py  (point TRAINING_FILE_PATH at this JSONL)");
