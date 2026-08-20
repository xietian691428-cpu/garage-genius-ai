# Supabase Auth Providers（上架预留）

Garage Genius 登录页支持：

1. **Email + password**（主路径）
2. **Sign in with Apple**（iOS 上架：若提供 Google 等第三方登录，通常必须同时提供 Apple）
3. **Google**（可选，Android / Web 友好）

前端实现：

- **Web：** `hooks/useAuth.ts` → `signInWithOAuth`（Supabase PKCE）→ `/auth/callback`
- **iOS 原生壳：** Sign in with Apple 走 `ASAuthorization`（`lib/native-apple-auth.ts`）→ `supabase.auth.signInWithIdToken`。**不要**再用 in-app Browser + PKCE（iPad 会报 `code challenge does not match previously saved code verifier`）。


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
```

Capacitor / 自定义 scheme 上架后再加，例如：

```
garagegenius://auth/callback
https://garagegenius.cloud/auth/callback
```

客户端已配置 `flowType: "pkce"` + explicit `localStorage` auth storage（见 `lib/supabase.ts`）。Native Capacitor 使用 `garagegenius://` redirect + `@capacitor/browser`，避免 WKWebView 内 OAuth 卡死。

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

## 2. Sign in with Apple（必需预留）

### Apple Developer

1. **Identifiers → App IDs**：勾选 *Sign In with Apple*（未来 iOS 壳用）。
2. **Identifiers → Services IDs**（Web / Capacitor 用）：
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

## 3. Google（可选）

### Google Cloud Console

1. 创建 OAuth 2.0 Client（**Web application**）。
2. Authorized JavaScript origins：
   - `http://localhost:3000`
   - `https://garagegenius.cloud`
3. Authorized redirect URIs：
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
4. 复制 Client ID + Client Secret。

### Supabase

**Authentication → Providers → Google → Enable**，填入 Client ID / Secret。

前端已请求 `openid email profile`，并带 `prompt=select_account` 便于切换账号。

---

## 4. 应用内行为核对

| 步骤 | 预期 |
|------|------|
| `/login` 点 Apple（网站） | 跳转 Apple → `/auth/callback?code=…` → `/app` |
| `/login` 点 Apple（iOS App） | 系统 Sign in with Apple 表 → session，无 PKCE Browser |
| `/login?next=/recharge` 点 Google | 回调后进入 `/recharge` |
| Provider 未开 | 登录页红色错误，提示见本文档 |
| OAuth 取消 / 报错 | `/auth/callback` 显示错误 → 回 `/login?error=…` |

---

## 5. 上架清单（Auth 相关）

- [ ] Supabase Email provider 开启
- [ ] Apple provider 配置并通过 Web 联调
- [ ]（可选）Google provider 联调
- [ ] Redirect URLs 含生产 + 本地 `/auth/callback`
- [ ] Privacy Policy / Terms 链接（商店审核常查）
- [ ] iOS 壳：Xcode Sign in with Apple capability；Supabase Apple **Client IDs** 含 Bundle ID `com.garagegenius.ai`
- [ ] 数字商品：iOS 仅 IAP（见 `docs/APP_STORE_REVIEW_NOTES.md`）；网站 Stripe 仅 Safari
