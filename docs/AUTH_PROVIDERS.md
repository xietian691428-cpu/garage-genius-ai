# Supabase Auth Providers（上架预留）

Garage Genius 登录页支持：

1. **Email + password**（主路径）
2. **Sign in with Apple**（iOS 上架：若提供 Google 等第三方登录，通常必须同时提供 Apple）
3. **Google**（可选，Android / Web 友好）

前端实现：`hooks/useAuth.ts` → `signInWithOAuth`；回调页：`/auth/callback`（PKCE）。

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
```

客户端已配置 `flowType: "pkce"` + `detectSessionInUrl: true`（见 `lib/supabase.ts`）。

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
| Client IDs | Services ID（Web）；将来 iOS 原生再追加 Bundle ID，逗号分隔 |
| Secret Key (`.p8` 内容) | 下载的密钥全文 |
| Key ID | Apple Key ID |
| Team ID | Apple Team ID |

保存后，在登录页点 **Sign in with Apple** 应跳转 Apple → 再回 `/auth/callback`。

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
| `/login` 点 Apple | 跳转 Apple → `/auth/callback?code=…` → `/app` |
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
- [ ] iOS 壳上架前：Xcode 打开 Sign in with Apple capability；Services ID / Bundle ID 与 Supabase Client IDs 对齐
- [ ] 数字商品：Web Stripe 与 App 内 IAP 策略在包壳前再定（见 `PROJECT.md`）
