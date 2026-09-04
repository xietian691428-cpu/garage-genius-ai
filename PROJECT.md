# Garage Genius AI - 整体实施架构（2026版）

## 产品定位
一站式 AI 汽修助手，针对欧美25-55岁 DIY 车主，帮助他们安全、高效地自己维修车辆。

## 长期愿景
成为欧美最专业的垂直汽车 AI 助手，最终拥有专属微调模型。

## 分阶段实施目标

### 第一阶段：Launch（当前重点）
**核心目标**：用 MVP 验证付费意愿
- **免费层**：每天有限次数基础问答 + 简单诊断 + 车辆仪表盘
- **Pro 订阅**（$9.99/月 或 $79/年）：无限使用 + 语音对话 + 完整库存管理 + 优先 RAG + 维修历史 + 年度车辆健康报告
- **限时 Pro 试用**：新用户 7-14 天完整 Pro 体验
- **核心卖点**：当前就比通用 AI 懂车（专业 Prompt + RAG + 车辆地图 + 零件推荐 + 库存 + Coach 推荐指南）

### 第二阶段：Data Collection（3-8个月）
- 通过激励机制（积分、免费时长、折扣）收集高质量用户反馈和维修数据
- 持续丰富知识库（RAG）
- 优化语音对话体验

### 第三阶段：Fine-tuning（6个月后）
- 使用积累的数据进行 LoRA 微调
- 推出 “Master Mechanic Edition” 或 Pro Plus 版本

## 技术架构(暂定.方便后期随时更换服务提供商,更灵活操作)
- 前端：Next.js + Tailwind + shadcn/ui
- 数据库：Supabase (pgvector for RAG + inventory)
- AI：DeepSeek Chat（主模型）+ Postgres FTS / 可选 pgvector 混合 RAG + Web Speech API（语音）
- 支付：Stripe
- 部署：Vercel

## 开发原则
- 每条 AI 回复必须包含免责声明
- 优先提供即时价值，再谈未来模型
- 所有功能围绕“让普通车主敢自己修车”设计
- 注重隐私和数据安全

## 欧美用户习惯（设计约束）
- 提供即时价值（打开就能用，立刻看到诊断/指引价值）
- 免费层足够有用，但不替代 Pro
- Pro 价值清晰可感知（unlimited、语音、库存、RAG、历史、年度健康报告）
- 隐私与免责声明显性可见（GDPR / CCPA 友好）

## 当前优先任务
1. 完成免费/Pro 订阅分层（Stripe）
2. 优化语音对话
3. 完善 RAG 知识库
4. Landing Page（`/` 营销页；主应用在 `/app`）

## Admin 后台需求

目标：让管理员（主要是你）方便管理：
- Affiliate Parts（零件推荐链接）
- Knowledge Base（RAG 知识条目）
- 用户反馈查看
- 简单仪表盘（订阅数、活跃用户等）

要求：
- 使用 Next.js App Router + Server Actions
- 简单身份验证（暂时用 Supabase Auth + 硬编码管理员账号）
- 界面简洁专业（深色主题）
- 支持 CRUD 操作
- 优先实现 Parts 管理和 Knowledge Base 管理

访问控制（Launch 简化版）：
- 本地环境变量 `ADMIN_EMAIL` + `ADMIN_PASSWORD_B64`（推荐）或 `ADMIN_PASSWORD` 控制登录
- 后续可升级为完整 Supabase Auth 角色体系

## 知识库 / RAG（Launch 现行）

### 检索策略（无需 OpenAI Embedding）
1. **Phase A — Postgres FTS**：`content_tsv` + `match_knowledge_fts`（migration `009_hybrid_rag_fts.sql`）
2. **Phase B — 可选向量**：有 embedding 提供商时再填 `embedding` 列（DeepSeek Chat 可用，但官方暂无 Embeddings）
3. **Phase C — 混合 RRF**：`match_knowledge_hybrid` 融合 FTS + pgvector

应用层：`lib/rag.ts` → hybrid → FTS → 旧 `match_documents` → JS 兜底。

### Prompt 融入权重（`lib/rag-prompt.ts`）
检索结果写入 System Prompt 时按优先级排序：
1. **配置相关（CONFIG）** — VCdb 配置卡 / fitment 真相
2. **维修步骤（REPAIR）** — DIY / 诊断 / TSB 风格
3. **零件推荐（PARTS）** — 购物与适配注意

同时每次对话注入完整 **Authoritative Vehicle Configuration** 卡（`lib/vcdb/format.ts`），并做配置冲突检测（如用户说 AWD、档案是 FWD → 先纠正）。Focus Mode 优先对齐配置卡。

### 车辆档案（云端）
- 表：`user_vehicles`（migration `010_user_vehicles.sql`）— 多车、`vcdb` JSON 配置卡、`is_current`
- 应用：`lib/user-vehicles.ts` + `hooks/useVehicles`；首次登录迁移 localStorage
- Dashboard / Chat 共用车库列表与切换；配车完成后自动写入完整配置卡

### 聊天 & 维修历史（云端）
- 表：`chat_messages`、`maintenance_records`（migration `011_chat_and_maintenance.sql`）— `user_id` + `vehicle_id`
- 聊天：`lib/chat-cloud.ts`；ChatApp 读写 Supabase，首次迁移 localStorage；Free 保留最近 20 条，Pro 200 条
- 维修历史：`components/history/MaintenanceHistory`（`/app?tab=history` 或 `/app/history`）；按车过滤；Free 预览 3 条 + 升级提示，Pro 完整日志
- Coach 指南：`/app?tab=coach` — 按车辆推荐指南 + Pro 年度健康报告 PDF

### 零件推荐（Affiliate 优先）
- 匹配：`lib/affiliate-match.ts` — 按车辆 make/model/year + 症状/区域关键词查 `affiliate_parts`
- Chat：`/api/chat` 注入 Affiliate Catalog → AI 回复；回写 `<parts-data>` OEM/Brand/Price/Links
- Focus Mode：`/api/dashboard/inspect` 有 catalog 命中时，`purchaseParts` 用 affiliate 覆盖
- UI：`PartsRecommendationTable`（OEM | Brand | Price | Links）+ 一键入库（`012_inventory_items.sql`）
- Fallback：无 catalog 命中时走 RAG + AI 生成

### 知识导入流程
1. 规范化为 `KnowledgeSeedItem`（`scripts/seed-knowledge.ts`）
2. VCdb 配置知识：`npm run train:knowledge` → `scripts/data/vcdb-knowledge-seed.json`
3. 导入（无 embedding）：`npm run seed:vcdb-knowledge:text`
4. 或通用种子：`scripts/data/knowledge-seed.json` + `npm run seed:knowledge:file:text`
5. Phase 3 可用同一语料做 LoRA 微调

原则：英文为主（欧美用户）、含安全提示、尽量带车型/年份、来源可追溯；`metadata.rag_tier` = `config|repair|parts`。

## Paid data deferred; revisit when…

**现在不接入** Auto.dev / ALLDATA / 付费 TSB / 欧洲商业召回库。无 vPIC、EPA 或本地锚点时禁止编造粘度、容量、力矩、保养间隔，引导查手册。

产品日志复用已有 `token_usage_events`：Chat 用户问题打标签 `metadata.spec_gap`（`oil_viscosity_capacity` / `maintenance_interval` / `torque`）。只存标签，不含原文、不含完整 VIN。Admin → Token Usage → Spec-gap demand 看命中次数与 Chat 占比。

**仅当同时满足再开 Auto.dev POC：**

1. 某标签 ≥15% Chat 且 ≥20 次命中（30 天窗）
2. **并且** NHTSA + playbook +「查手册」仍覆盖不了同一类问题

体积触发不等于可以买库。细则见 `docs/data-sources.md`。

## 语音对话成本策略（已确认）

**原则：先免费验证体验，再为付费用户上高端语音。**

### Launch（现在）
- 浏览器 **Web Speech API**（听写）+ **speechSynthesis TTS**（朗读）
- 成本 ≈ $0（无第三方语音账单）
- 做好：一键开麦、AI 回复自动朗读、修车场景半双工（说 → AI 念 → 可再开麦）
- 作为 **Pro / 试用** 的明显差异化体验（双手不方便时的教练感）
- 隐私文案：不存储原始音频；识别可能经浏览器厂商处理（GDPR 透明告知）

### 付费用户稳定后（约 200–300 名付费订阅）
再评估升级，优先成本可控方案：
1. **Deepgram（STT）+ ElevenLabs（TTS）** — 按量计费，比 Realtime 更可控
2. **OpenAI Realtime** — 作为更高端「真实时对话」档（可选 Pro Plus）

**暂缓：** 豆包麦克风 API / 全量 Realtime（避免 Launch 阶段语音成本失控）

## 收费与 Token 策略（重要）

采用混合模式：
- 订阅（月费） + 包含 Token 额度
- Token 用完后支持单独充值
- 每月设置合理上限

具体方案（token 文本额度 + USD / vision 硬顶）：
- Free: 15k tokens / month · **3 photo analyses / month** · AI budget **$0.25**
- Pro: $9.99 / 150k tokens (cap 500k) · **30 photo analyses / month** · AI budget **$3.00** (~30% of list)
- Pro Heavy: $19.99 / 400k tokens (cap 1M) · **80 photo analyses / month** · AI budget **$6.50**
- Trial uses Pro limits. Kimi vision is a separate monthly call cap (not unlimited).
- 超出后按 $0.07-$0.08 / 1k tokens 充值（text top-up; does not raise vision cap）
- 硬顶：`AI_COST_HARD_CAP` 默认 ON（unset = ON）；`=0` 仅用于 staging/事故。账本 `token_usage_events` / 视图 `ai_usage_events`

## W1–W6 完成状态（safety / cost）

W1 门禁+drift+exit-under · W2 规格闸+诊断禁语 · W3 召回三态+视觉低置信 · W4 语言/保险/禁驶/配额诚实 · W5 OBD 诚实+Guide↔Chat+Report 绑车 · W6 回归包+raised stay-under 矛盾走同一 repair+观测事件。

- 回归清单：[tests/README.md](tests/README.md)
- 不变量：[docs/SAFETY_INVARIANTS.md](docs/SAFETY_INVARIANTS.md)
- 残留：[docs/RESIDUAL_RISKS.md](docs/RESIDUAL_RISKS.md)
- CI：`npm test`（Vitest）。不接 Auto.dev；不改 CoachScenarioPlayer 核心状态机。

所有 Token 消耗逻辑必须严格执行此策略。
后续可根据实际 DeepSeek / 火山引擎等成本动态调整单价。

### 定价页与 Stripe Price IDs
- UI：`/pricing`（Free / Pro / Pro Heavy，月付/年付切换）
- Checkout body：`{ plan: "pro" | "pro_heavy", interval: "monthly" | "yearly" }`
- Env（创建 Stripe Product/Price 后填入）：
  - `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY`
  - `STRIPE_PRICE_HEAVY_MONTHLY` / `STRIPE_PRICE_HEAVY_YEARLY`
- 权益门禁：`hooks/useSubscription`（车辆数、语音、RAG depth）；免费额度用尽时 Chat 弹出 Upgrade
- 迁移：`006_pro_heavy_status.sql` 允许 `profiles.subscription_status = pro_heavy`

## 分发与用户登录（当前重点）

**销售渠道（前期）**：Apple App Store（iOS）+ Google Play（Android）。
技术路径：先完成 Web/PWA 级登录与计费闭环，再用 Capacitor（或同类）包成商店 App。

### 登录方案（已落地 · 上架预留）
- 主路径：邮箱 + 密码（Supabase Auth）
- 商店合规：
  - **Sign in with Apple**（登录页主按钮；iOS 提供第三方登录时通常必需）
  - **Google Sign-In**（可选；`prompt=select_account`）
- 回调：`/auth/callback`（PKCE；处理 `code` / OAuth `error` / hash session；保留 `?next=`）
- 主应用与 `/recharge` 需登录（`AuthGate`）
- Account 页：查看邮箱、升级 Pro、充值、退出
- **配置手册**：[docs/AUTH_PROVIDERS.md](docs/AUTH_PROVIDERS.md)（Apple Services ID / Google Client / Redirect URLs）

### 上架前注意
1. 按 `docs/AUTH_PROVIDERS.md` 开启 Email + Apple（+ 可选 Google）
2. Redirect URL 加入：生产与本地的 `/auth/callback`；Apple/Google 控制台里的 Return URL 填 **Supabase** `…/auth/v1/callback`
3. 商店内购（IAP）与 Stripe Web 支付的关系：App 内数字商品最终需符合 Apple/Google IAP 规则；当前先用 Stripe 验证付费意愿，包壳上架前再切/双轨 IAP
4. 跑通 `001_profiles.sql` + `008_trial_sync.sql`：注册自动 `trialing` 14 天；到期经 `sync_my_trial_status` 降为 Free
5. 统一逻辑见 `lib/subscription.ts`；Pricing / Account 显示 Trial 倒计时，到期弹出升级提示
