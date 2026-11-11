# Offline Trip Pack — 任务规格（按生产代码收紧）

> 状态：P0 已实现；**P1-1 / P1-4 / P1-5 已实现**（pack 过期·油液指纹 Refresh、症状快捷 chips、回网 carry codes 为 user-provided）。**P1-2 / P1-3 默认不开**（手册 chunks、云同步应急电话），除非有明确产品需求。  
> **对外口径：** 弱信号应急协助（本地规则 + 缓存规格），**不是**离线 AI 修车。  

> 依据：`VehicleInfo` fluids + 手册确认、`lib/vehicle-data/dtc-local.ts`、`lib/safety/stop-rules.ts`、`lib/drive-safety.ts`、`lib/intake/derive.ts`（过热槽位）、`lib/chat-request-error.ts`、`lib/obd.ts`、`docs/SAFETY_INVARIANTS.md`。

## 0. 一句话

有网时为 **当前 garage `vehicle_id`** 打包本地只读应急包；无网时查本车已确认规格、本地 DTC/停手规则、预存电话与自建地点；回网后唤起系统地图 / 完整 Chat。不跑 DeepSeek/视觉，不读苹果/谷歌离线地图 POI，不改 CoachScenarioPlayer。

---

## 1. 产品目标（不变，措辞对齐现网）

用户在有网时下载「当前车辆」Trip Pack；弱网/无蜂窝时可：

1. 看本车缓存档案与 **已确认** 油液/手册规格（带来源标签）
2. 本地 DTC + 症状规则分流（教育向 `check_order` + 停手）
3. 一键 `tel:` 预填救援/保险电话
4. 回网后打开系统地图搜索 / 完整 Coach

**不承诺：** 路边复杂维修、离线大模型、离线自动「附近修理厂/拖车」列表。

---

## 2. 硬约束（与 SAFETY_INVARIANTS / 现网一致）

| # | 约束 | 代码锚点 |
|---|------|----------|
| 1 | **不改** `CoachScenarioPlayer` 步进状态机 | `docs/SAFETY_INVARIANTS.md`；playbook 仅可抽只读步骤卡 |
| 2 | 安全闸 > 任何离线文案：蒸汽/过热、软刹、车底/高压等 | `content/safety/stop-rules.json` + `matchStopRules` / `formatStopRuleBlock`；`isHighRiskDrivingSituation` / `DRIVE_SAFETY_COPY`；intake 过热蒸汽槽位逻辑可 **只读复用规则结果**，勿新造平行文案体系 |
| 3 | 无缓存锚点不编造 qt / ft-lb / 粘度「必用」 | 同 Chat：仅展示 pack 内已有字段；无字段 →「查机盖盖/手册」，禁止编数字 |
| 4 | 诊断语气教育向：禁止 Replace X now / 根因断言 | 同 invariant §9；离线 UI 模板句写死 |
| 5 | 私有手册与油液仅 `user_id × vehicle_id`；pack **不得**进全局 KB/RAG | `vehicle_manuals` / chunks；pack key = `userId + vehicleId` |
| 6 | 完整 VIN 不进日志；pack 内 VIN **最多后 8 位**（或省略） | invariant §6；`VehicleInfo.vin` 可选，序列化时截断 |
| 7 | 离线路径 **零** DeepSeek/Kimi/视觉；回网前不偷偷打 `/api/chat` | `classifyChatFetchError` → `network` 时进 Offline UI，不重试到超时假加载 |
| 8 | Web：可下载 + 标明限制；Capacitor WebView：同一套 IDB/本地读优先 | 现网 **无** `@capacitor/preferences` / `filesystem` / `idb` 依赖 → 见 §5 |
| 9 | 文案 `en-US` + `es` 基础键 | `locales/en-US/common.json` + `locales/es/common.json` |
| 10 | 不引导违反商店政策的外链支付 | 同 Android Play / iOS IAP 现策 |
| 11 | **CVT ≠ ATF**：`transmissionKind === "cvt"` 必须标 CVT-specific；禁止建议 Dexron/Mercon 替代 | `VehicleInfo.transmissionKind`；手册 frame 同款规则 |
| 12 | 跨车：A 车 pack **禁止**用于 B 车；打开 Offline 时校验 `pack.vehicle_id === currentVehicle.id` | Chat 车辆隔离同精神 |
| 13 | OBD：离线读码可写本机会话；回网带入 Chat 必须是 **user-provided / offline_session**，不得标 `live` | invariant §8「No live OBD theater」 |

---

## 3. 现网可复用资产（优先组装，少造新后端）

### 3.1 车辆身份与油液（已在 `VehicleInfo` / garage 行）

打包字段（有则带，无则省略，UI 标明 missing）：

- 身份：`year` / `make` / `model` / `submodel` / `market` / `engine` / `transmission` / `name`
- 油：`oilCapacity` + `oilCapacitySource`，`oilViscosity` + `oilViscositySource`，`oilSpecsConfirmedAt`
- 冷却：`coolantSpecText` / `coolantCapacityText` / `coolantMixText` + 各 `*Source` + `coolantSpecsConfirmedAt`
- 刹车油：`brakeFluidSpecText` / `brakeFluidNotesText` + sources
- 变速箱：`transmissionKind`（`atf|cvt|unknown`）+ `atfSpecText` / `atfCapacityText` / `atfNotesText` + sources

**展示规则：**

- 来源标签：`user_manual_confirmed` → “Garage profile (from your manual)”；`user_entered` → “Garage profile (you entered)”；`vcdb` → 仅作档案参考，**离线诊断文案不得当成已确认必用规格**（与 Chat：未确认 extract 不进 `[GARAGE_PROFILE_FLUIDS]` 对齐——pack 下载时建议 **只写入 confirmed 或 user_entered**，跳过未确认 extract）。
- 手册 PDF：**默认不打包整本**。可选 P1：最多 N 个已入库 chunk（需二次确认 + 体积上限）。P0 只依赖车库结构化字段 + 手册 ready 元数据（是否有 manual、confirmedAt），不依赖 FTS 检索服务端。

### 3.2 本地 DTC（已是离线可用）

- 目录：`content/dtc/{common,us-highfreq,chassis,body,network}.json` → `lookupLocalDtc` / `lookupLocalDtcs`
- 现网规模约 **~84 unique codes**（非「全库」）。P0：**整包打进 Trip Pack**（体积很小），不必再裁「用户已见码」子集；可选附加用户本车历史码列表仅作快捷 chips。
- 未知码：沿用 `UNKNOWN_DTC_TITLE` / `UNKNOWN_DTC_SUMMARY`，禁止编 OEM 标题。
- UI 展示：`title` / `summary` / `checkOrder` / `safetyNotes` / `commonCauses`（标 Educational checks）。

### 3.3 安全卡（序列化现有规则，禁止平行文案）

Pack 内嵌：

1. **Stop rules 全文**：`listStopRules()` 的 JSON（现 7 条：`srs_airbag`, `brake_hydraulics_abs`, `hot_cooling_cap`, `battery_airbag_jump`, `hv_orange_hybrid`, `adaptive_matrix_headlight_coding`, `adas_camera_lamp_bracket`）
2. **Drive-safety 固定句**：`DRIVE_SAFETY_COPY.doNotDrive` / `noLimp`
3. 离线匹配：**直接调用**（或打包后同算法）`matchStopRules(text)` + `isHighRiskDrivingSituation(text)`；过热蒸汽优先展示 `hot_cooling_cap` + do-not-drive，再谈规格

可选只读症状卡（静态，不跑 Player）：

- 从 `content/coach-scenarios/maintenance_road_trip_production.json`、`maintenance_battery_production.json`、`maintenance_tires_production.json`、`maintenance_brakes_production.json` **摘「教育向观察步骤」** 为只读 cards  
- **禁止**挂载 `CoachScenarioPlayer`、禁止 `risk_confirm` 状态机、禁止 `/api/coach/*`

### 3.4 Chat 网络失败（现网缺口 → 本任务补齐）

现网：`classifyChatFetchError` → 往消息流塞 `⚠️ Network error…`（`ChatApp.tsx`），**没有** Offline 模式入口。

P0 要求：

- `navigator.onLine === false` **或** `code === "network"`（及可选短超时）→ 展示 Offline banner +「Open offline assist」（若有该车 pack）
- **禁止**在离线时静默重试 `/api/chat` / 视觉上传到硬超时
- 有网但上游挂：仍走现有 upstream 文案，不误进 Offline pack

### 3.5 OBD

- 本地读码：`lib/obd.ts`（BLE / Android Classic）可在无蜂窝时工作（蓝牙不依赖蜂窝）
- 离线会话缓存：本机 `sessionStorage` / pack 旁路 store；字段含 codes + `source: "offline_session"`
- 回网带入 Chat：作 **user-provided** 文本/chips，**禁止**声称 Live OBD

### 3.6 电话 / 地点（现网几乎没有）

- 现有 `insuranceProvider` / `countryRegion` 仅为 **保险教育 tip**，不是 roadside 电话
- P0 **新建**用户预填（本地为主，可选日后云同步）：`roadsidePhone`, `insurancePhone`, `emergencyNote`
- 保存地点：`{ id, label, lat?, lng? }[]` — 手动添加；直线距离仅在有定位权限时算；不声称来自 Maps POI

### 3.7 「附近店铺」

- **不做**离线 POI 库
- 回网 CTA：系统 URL scheme，例如  
  - iOS: `maps://?q=tow+truck` / `http://maps.apple.com/?q=auto+repair`  
  - Android: `geo:0,0?q=tow+truck` 或 `https://www.google.com/maps/search/?api=1&query=auto+repair`  
- 文案级引导用户自行在 Apple/Google Maps 下载离线地图区域 — **不声称本 App 已集成其离线库**

---

## 4. 功能范围（P0）

### A. 出行前 — 下载 Trip Pack

**入口（建议）：**

- 车辆详情 / Chat 菜单：`Download offline trip pack`
- 短说明：`For weak signal areas (mountains, parks, coast). Not a full offline mechanic.`

**组装方式（优先纯客户端）：**

1. 用当前已同步的 `VehicleInfo`（`useVehicles` / localStorage mirror `garageGenius_vehicles`）组装 identity + fluids  
2. 嵌入全量本地 DTC catalog 快照（或 import 同一模块在离线页直接 `lookupLocalDtc`——若离线页与主包同 bundle，**可不把 DTC JSON 再复制进 pack**，只存 `dtcCatalogVersion`；若希望 pack 自描述可复制一份）  
3. 嵌入 stop-rules + drive-safety 常量版本号  
4. 用户电话/地点表单写入同一 store  
5. Manifest：`pack_version`, `user_id`, `vehicle_id`, `downloaded_at`, `content_hash`, `approx_bytes`, `fluids_fingerprint`

**体积：** 文本级目标 ≪ 1MB（无 PDF）；若 P1 含手册 chunks，硬顶可配（建议默认 2MB，上限 8MB），超限拒绝并提示去掉手册。

**不做新「离线推理」API。** 可选轻量 `GET` 仅用于拉最新车库行（有网下载时）；无网不访问。

### B. 无网运行

- 模式标签：`Offline · limited`
- 绑定：`pack.vehicle_id` 必须等于当前车；否则拒绝并提示下载该车 pack
- 可做：规格只读、DTC 查询、停手规则、电话、自建地点、OBD 本机读码入会话
- 不可做（UI 写死）：完整 Chat 流式 AI、NHTSA/召回、附近店搜索、编造规格

### C. 回网

- Banner：`You're back online — Open full coach / Find a shop`
- Find a shop / tow → 系统地图 scheme（§3.7）
- **P1-5：** 离线查到的 DTC / offline_session 码 → Chat 草稿预填为 **user-provided / not live**（`formatOfflineCodesForOnlineChat`）；禁止标 `live`

### D. 系统离线地图说明（文案）

- iPhone: Download offline maps in Apple Maps for this region  
- Android: Download offline maps in Google Maps  

---

## 5. 技术适配（按现栈修正原建议）

| 原建议 | 生产现状 | 收紧后 |
|--------|----------|--------|
| Capacitor Preferences / Filesystem / SQLite | **均未依赖** | P0：浏览器 **IndexedDB**（新增轻量封装，如 `idb-keyval`，WebView 通用）；小配置可用现有 `localStorage`；勿假设 Preferences 已存在 |
| 服务端打包 API | 车库数据已在客户端 | **优先客户端组装**；避免新后端与双源真理 |
| 复制一套 safety 文案 | 已有 stop-rules / drive-safety | **import 同源模块**；pack 可嵌 snapshot + `rulesVersion` |
| 全量手册 / 全量 DTC | DTC ~84；手册在 Supabase | DTC：用现有 catalog；手册：P0 结构化字段 only |
| Chat 失败降级 | 仅 ⚠️ 文案 | 增加 Offline assist CTA |
| Coach 应急 playbook | 有 `*_production.json` | 只读摘录；**禁止** Player |

**建议模块划分：**

```
lib/offline-trip-pack/
  types.ts          # TripPackManifest, EmergencyContacts, SavedPlace
  build-pack.ts     # from VehicleInfo + rules versions
  store.ts          # IDB get/set/delete by userId+vehicleId
  match.ts          # thin wrappers: matchStopRules, lookupLocalDtc, drive-safety
  maps-links.ts     # platform URL schemes
components/offline/
  Offline-trip-pack-download.tsx
  offline-assist-panel.tsx
locales: offlineTripPack.* keys (en-US + es)
```

**过期（P1-1 已实现）：** `downloaded_at` > 30 天或 `fluids_fingerprint` 与当前车库油液不一致 → 下载页 / Offline assist 提示 Refresh（有网高亮；无网仍用缓存包，不编造新规格）。实现：`lib/offline-trip-pack/freshness.ts`。

---

## 6. UI / UX

- 下载进度（客户端组装可假进度：序列化 → 写 IDB → done）与失败重试  
- `Offline · limited` 醒目标签  
- 无 pack：引导下载，不假装智能诊断  
- 安全结论置顶，步骤在后  
- en 主文案简洁；es 基础键覆盖标题/按钮/空态/安全摘要  

---

## 7. 非目标（明确）

- 端侧大模型 / 离线 DeepSeek  
- 全美修理厂离线库；解析 Apple/Google 离线地图文件  
- 改变 IAP / Play Billing  
- 削弱在线安全闸与手册隔离  
- 修改 CoachScenarioPlayer  
- 把未确认 manual extract 当离线「必用」规格  

---

## 8. 测试（必须）

1. 有网下载 → 飞行模式 → 输入 `P0420` → 本地说明 + `check_order`；spy：无 `/api/chat` / DeepSeek  
2. 飞行模式「过热 + steam」→ `hot_cooling_cap` / do-not-drive **先于** 任何 coolant 规格  
3. 无 pack 飞行模式 → 明确不可用；不编 qt  
4. 已确认油液带来源标签；无规格不编数字；CVT 车不显示「通用 ATF 即可」  
5. `tel:` 救援电话可点  
6. 回网 → 可进完整 Chat；离线 OBD 会话不得同步成 live  
7. A 车 pack 打开时切 B 车 → 拒绝或提示下载 B  
8. 回归：在线 Chat、手册隔离、CVT≠ATF、stop-rules / drive-safety 单测不回退  

手测：飞行模式 + 已下载 Camry pack + DTC / 过热两路径（「优胜美地无信号」）。

---

## 9. 文档交付（随实现改）

- 本文：`docs/OFFLINE_TRIP_PACK.md`（能力边界、无附近店铺、与系统离线地图关系）  
- `docs/SAFETY_INVARIANTS.md`：增补一条 Offline Trip Pack — 有限本地诊断；停手规则仍生效；无锚点不编规格  
- `docs/RESIDUAL_RISKS.md`：离线无法替代工具与专业救援；用户可能仍无法路边修复；pack 过期/错车风险  

---

## 10. 实施顺序（收紧）

1. **Types + IDB store + `buildPack(vehicle)`**（客户端；含 manifest / hash / 体积）  
2. **Offline assist UI** + `matchStopRules` / `lookupLocalDtc` / drive-safety（安全置顶）  
3. **电话 + 保存地点** + `tel:` / 地图 scheme  
4. **Chat 网络错误 → Offline CTA**；回网 banner  
5. Vitest（纯函数 + store mock + Chat 降级）+ 文档三处更新  
6. **P1（本迭代）**
   - **P1-1** pack 过期 / fluids fingerprint → Refresh 提示（已做）
   - **P1-4** Offline assist 症状快捷 chips（过热蒸汽、软刹、P0420、爆胎、无启动）（已做）
   - **P1-5** 回网 carry codes → Chat 草稿，文案强制 user-provided（已做）
7. **P1 后续（未做）**
   - **P1-2** 可选手册 chunks（二次确认 + 体积硬顶；默认不强制打包 PDF）
   - **P1-3** 应急电话云同步（P0 仍为本地预填）
   - pack 体积仪表 / 更细的下载进度

**明确不做（本迭代）：** 离线 AI、强制手册、读取系统离线地图 POI。

---

## 11. 与原稿差异摘要

| 原稿 | 优化后 |
|------|--------|
| 暗示较重「本地诊断产品」 | 定位为 **应急只读包 + 规则引擎**，Chat AI 仍在线 only |
| Preferences/Filesystem/SQLite 任选 | 现网无这些依赖 → **IDB 为主**，可新增轻依赖 |
| DTC「子集」下载 | 全量本地 catalog 已很小 → **整包复用** `dtc-local` |
| 新造安全文案风险 | **强制**复用 stop-rules / drive-safety 模块 |
| 应急 playbook 易误接 Player | 只读摘录 `*_production.json`；禁 Player |
| 救援电话「可选云同步」并列 | P0 **本地**；云同步降为 P1 |
| Chat 离线仅原则 | 明确改 `ChatApp` network 分支，避免假加载 |
| 存储「5–15MB」 | 无 PDF 时通常 ≪1MB；有 chunks 再设硬顶 |
| 保险字段复用 | 现有 insurance 字段 **不是电话** → 新 contact 字段 |

---

## 12. 验收清单（交付物）

- [ ] 下载 / 本地只读诊断 / 安全卡 / 预存电话与地点 / 回网入口  
- [ ] 测试与改动文件列表  
- [ ] 体积说明 + 「离线不调用 AI」实现说明（Chat spy / 无 fetch）  
- [ ] 三份文档更新  
