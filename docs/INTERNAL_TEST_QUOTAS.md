# Internal: Unlimited QA vs real Free / Pro quotas

Use this when judging G1 / E3 (photo + token caps). Do not treat the Unlimited test account as Free or Pro.

## Production (`garagegenius.cloud`)

`NEXT_PUBLIC_QA_UNLOCK` is **hard-blocked** on production deploys (`lib/qa-mode.ts` → `isProductionDeploy()`). The internal test account that shows **Unlimited** is a server-side token bypass (`lib/test-token-bypass.ts`), not QA unlock.

| Surface | Unlimited internal | Real Free | Real Pro |
| --- | --- | --- | --- |
| Chat tokens | Not deducted | ~15k / month | ~150k / month |
| Photo / vision | Not deducted | **3 / UTC month** (not per day) | **30 / UTC month** |
| Cap-hit | Should not see 402/429 from quota | `ai_budget_exceeded` (402) / `vision_quota_exceeded` (429) — no silent short coach | Same codes at higher caps |
| UI leftover | ChatInput hides remaining counts | “N photo analyses left **this month**” | Same, larger N |

Composer copy lives in `components/chat/ChatInput.tsx`. Client remaining for unsigned / fallback is `features.photoRemainingThisMonth` (`hooks/useSubscription.ts`). Signed-in remaining comes from `/api` usage (`usage.visionRemaining`).

## Preview / local QA unlock

`NEXT_PUBLIC_QA_UNLOCK=true` on **non-production** only: every signed-in user looks like Pro Heavy (photos unlimited, playbooks unlimited). **G1/E3 cannot be validated** on that build.

## Hand-test rule

- I1 / A3 / D1 on Unlimited: OK for safety and isolation.
- G1 (Free quota) / E3 (photo cap): use a **real Free** account on production, or a Preview build **without** QA unlock.
