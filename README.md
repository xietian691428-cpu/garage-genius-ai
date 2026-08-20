# Garage Genius AI

DIY 汽车教练应用（Chat / RAG / Coach Playbooks / 车辆档案 / Stripe Free·Pro·Heavy）+ **运营 PC 后台**。

## Getting Started

```bash
npm install
cp .env.example .env.local   # 填入 Supabase / Stripe / ADMIN_* 等
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin: [http://localhost:3000/admin](http://localhost:3000/admin).

## Admin 运营后台

登录依赖 `ADMIN_EMAIL` + `ADMIN_PASSWORD_B64`（cookie `gg_admin_session`）。

| 一级菜单 | 路由 | 说明 |
|----------|------|------|
| 主页 · 数据面板 | `/admin` | 今日新增 / DAU / 充值 / AI 调用 / Pro / ARPU + 7·30 天趋势 |
| 业务管理 | `/admin/business/playbooks` · `/chats` | Coach 反馈筛选与分析、完整对话 |
| 运营管理 | `/admin/ops` | 转化漏斗、Token 成本 vs 收入、CSV 导出 |
| AI 知识库 | `/admin/knowledge*` | 条目 / 扩充入口 / 对比测试 |
| 客户管理 | `/admin/customers` | 档案、车辆、标签备注、归档 |
| 用户管理 | `/admin/staff` | 后台角色骨架 + 操作日志 |

Supabase：执行 `supabase/migrations/025_admin_ops_console.sql`（及既有 020–024）。  
集成说明见 [`INTEGRATION.md`](./INTEGRATION.md)、架构见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## Scripts

知识库 seed / Autodata 转换等见 `package.json` 的 `seed:*` / `train:*` 脚本。

安全回归种子（`content/pilot/`）= CI 契约，**禁止 auto 进 `knowledge_base`**。改 safety-topics / drift / repair 时跑 `npm run test:safety-seeds`。

## Deploy

推荐 Vercel。生产环境勿开启 `NEXT_PUBLIC_QA_UNLOCK`。清单：`DEPLOYMENT_CHECKLIST.md`。
