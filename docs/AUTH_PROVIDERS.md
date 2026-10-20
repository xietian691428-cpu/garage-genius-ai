# Supabase Auth Providers

Garage Genius 登录页支持：

1. **Email + password**（主路径）
2. **Sign in with Apple**（iOS 必需；Web 也启用）
3. **Google**（**Web + Android**；**iOS App 隐藏**）

前端实现：

- **Web：** `hooks/useAuth.ts` → `signInWithOAuth`（Supabase PKCE）→ `/auth/callback`
- **Android 商店壳：** 同上，但 `skipBrowserRedirect` + `@capacitor/browser`（Custom Tab），回调 `garagegenius://auth/callback` → `NativeDeepLinkBridge` → `/auth/callback` → `exchangeCodeForSession`
- **iOS 原生壳：** Sign in with Apple 走 `ASAuthorization`（`lib/native-apple-auth.ts`）→ `supabase.auth.signInWithIdToken`。**不要**再用 in-app Browser + PKCE（iPad 会报 `code challenge does not match previously saved code verifier`）。Google 按钮在 iOS 上始终隐藏（`isGoogleOAuthButtonVisible`）。

开关（Vercel / `.env`，部署后生效；壳远程加载生产站，一般**不必**为 Google 单独发版）：

```
NEXT_PUBLIC_AUTH_APPLE=1
NEXT_PUBLIC_AUTH_GOOGLE=1
```

---

## 1. 通用：Redirect URLs

在 Supabase Dashboard → **Authentication** → **URL Configuration**：

| 字段 | 值 |
|------|-----|
| Site URL | `https://garagegenius.cloud` |
| Redirect URLs | 全部加入下面列表 |

```
http://localhost:3000/auth/callback
https://garagegenius.cloud/auth/callback
https://garage-genius-ai.vercel.app/auth/callback
garagegenius://auth/callback
```

客户端已配置 `flowType: "pkce"` + explicit `localStorage` auth storage（见 `lib/supabase.ts`）。Native Capacitor 使用 `garagegenius://` redirect + `@capacitor/browser`，避免 WebView 内 OAuth 卡死。

---

## 1b. Email confirmation（注册必须验证）

在 Supabase Dashboard → **Authentication** → **Providers** → **Email**：

| 设置 | 建议值 |
|------|--------|
| Enable Email provider | On |
| Confirm email | **On**（生产必须开） |
| Secure email change | On（推荐） |

Confirm email 开启后：

1. `signUp` 会发送确认邮件（链接回到 `/auth/callback` → `/app`）。
2. 未验证用户可登录，但 Chat / Coach / 升级 / 充值 / 删号会被服务端拦截（`email_unverified`）。
3. 应用内横幅与 Settings 支持 **Resend verification email**。

本地若要跳过验证（仅开发）：`REQUIRE_EMAIL_VERIFICATION=0`。

---

## 2. Sign in with Apple

### Apple Developer

1. **Identifiers → App IDs**：勾选 *Sign In with Apple*。
2. **Identifiers → Services IDs**（Web 用）：
   - 新建 Services ID（如 `com.garagegenius.web`）
   - Configure → Domains：你的域名 + Supabase 项目域名  
     `wekqoszovgityxwnvbqd.supabase.co`（以你的 project ref 为准）
   - Return URLs（**必须是 Supabase 回调**，不是自家 `/auth/callback`）：
     ```
     https://<PROJECT_REF>.supabase.co/auth/v1/callback
     ```
3. **Keys**：新建 Key，勾选 *Sign In with Apple*，下载 `.p8`（只下一次）。记下 **Key ID**、**Team ID**。

### Supabase

**Authentication → Providers → Apple → Enable**，填入：

| 字段 | 来源 |
|------|------|
| Client IDs | **逗号分隔**：Web Services ID **以及** iOS Bundle ID `com.garagegenius.ai`（原生 `signInWithIdToken` 必需） |
| Secret Key (`.p8` 内容) | 下载的密钥全文 |
| Key ID | Apple Key ID |
| Team ID | Apple Team ID |

保存后：

- **网站 / Mobile Safari：** 登录页点 Sign in with Apple → Apple → `/auth/callback`
- **iOS App：** 登录页点 Sign in with Apple → 系统授权表 → 直接进 `/app`（不经过 PKCE callback）

### 注意

- **Hide My Email**：用户可选隐藏邮箱；Supabase 仍会收到 `privaterelay.appleid.com` 地址，账号可用。
- **姓名**：Apple 仅在用户**首次**授权时返回 `fullName`；之后只有 `sub` / email。
- 本地若报 `provider is not enabled`：说明 Dashboard 里尚未 Enable Apple。

---

## 3. Google（Web + Android — 启用步骤）

**目标端：** 网站与 Android 商店 App。  
**不做：** iOS App 显示 Google；不引入 Android 原生 Google Sign-In SDK（走 Browser + PKCE）。

### 3a. Google Cloud Console（你侧）

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**。
2. Application type：**Web application**（名称如 `Garage Genius Web`）。
3. **Authorized JavaScript origins：**
   - `https://garagegenius.cloud`
   - `http://localhost:3000`（本地联调）
4. **Authorized redirect URIs**（必须是 Supabase，**不要**填 `garagegenius.cloud/auth/callback`）：
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
   例（以当前项目为准）：`https://wekqoszovgityxwnvbqd.supabase.co/auth/v1/callback`
5. 创建后复制 **Client ID** 与 **Client Secret**。
6. 若 Google 要求配置 OAuth consent screen：选 External（或 Internal 若仅本组织），填应用名、支持邮箱、`https://garagegenius.cloud/privacy`；测试阶段把你的 Google 账号加进 Test users。

### 3b. Supabase（你侧）

1. **Authentication → Providers → Google → Enable**。
2. 粘贴 Client ID / Client Secret → Save。
3. **Authentication → URL Configuration → Redirect URLs** 确认含 §1 列表（尤其 **`garagegenius://auth/callback`**，Android Custom Tab 回跳需要）。

### 3c. Vercel / 生产环境（你侧）

1. Project → Settings → Environment Variables → **Production**（Preview 若要测也设）：
   - `NEXT_PUBLIC_AUTH_GOOGLE=1`
   - 确认 `NEXT_PUBLIC_AUTH_APPLE=1`（Web 同时露 Google 时 Apple 应可用）
2. **Redeploy** Production（`NEXT_PUBLIC_*` 需重新构建才会进客户端包）。
3. 打开 `https://garagegenius.cloud/login`：应出现 **Continue with Google**。  
   Android 商店壳加载同一 URL，也会出现该按钮（iOS 壳代码侧隐藏）。

### 3d. 前端行为（已实现，无需改原生包）

| 项 | 说明 |
|---|---|
| Scopes | `openid email profile` |
| Query | `prompt=select_account`（便于换账号） |
| Web redirect | `https://garagegenius.cloud/auth/callback`（可带 `?next=`） |
| Android redirect | `garagegenius://auth/callback` → bridge → `/auth/callback` |
| Provider 未开 | 友好错误：Google sign-in is temporarily unavailable… |

---

## 4. 应用内行为核对 / 冒烟清单

| 步骤 | 预期 |
|------|------|
| Web `/login` → Google | 选账号 → `/auth/callback?code=…` → `/app`，刷新仍登录 |
| Web `/login?next=/recharge` → Google | 回调后进入 `/recharge`（若路径在 allowlist） |
| Android App → Google | Custom Tab 打开 Google → 授权后回 App → `/app`，不丢 session |
| iOS App `/login` | **无** Google 按钮；Apple / 邮箱正常 |
| Provider 未开或密钥错 | 登录页红色错误，不白屏 |
| OAuth 取消 / 报错 | `/auth/callback` 短暂提示 → 回 `/login?error=…` |

**Android 冒烟（商店 App 或 release 壳）：**

1. 冷启动 → 登录页可见 Continue with Google。  
2. 点 Google → 系统 Custom Tab / Chrome → 选账号 → 同意。  
3. Tab 关闭，App 回到 `/app`（或 onboarding），Settings 显示 Google 邮箱。  
4. 杀进程再开 → 仍保持登录。  
5. 再测一次邮箱密码登录不受影响。

**Web 冒烟：**

1. 桌面 Chrome 无痕：`/login` → Google → `/app`。  
2. 退出后再登录可 `select_account` 换号。

---

## 5. 上架 / 运维清单（Auth）

- [ ] Supabase Email provider 开启 + Confirm email On
- [ ] Apple provider 配置并通过 Web / iOS 联调
- [ ] Google Cloud Web OAuth client + Supabase Google Enable
- [ ] Redirect URLs 含生产、本地、`garagegenius://auth/callback`
- [ ] Vercel：`NEXT_PUBLIC_AUTH_GOOGLE=1` + `NEXT_PUBLIC_AUTH_APPLE=1` 并已 Redeploy
- [ ] Web + Android 冒烟通过；iOS 确认无 Google 按钮
- [ ] Privacy Policy / Terms 链接
- [ ] iOS：Xcode Sign in with Apple；Supabase Apple Client IDs 含 `com.garagegenius.ai`
- [ ] 数字商品：iOS 仅 IAP；网站 Stripe 仅 Safari；Play 本版无 Billing
