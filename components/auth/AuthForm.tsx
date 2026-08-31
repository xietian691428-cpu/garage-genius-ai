"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Car } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeNextPath, useAuth } from "@/hooks/useAuth";
import { isAppleAuthEnabled, isGoogleAuthEnabled } from "@/lib/auth-providers";
import { isGoogleOAuthButtonVisible } from "@/lib/native-apple-auth";
import { hideNativeSplash } from "@/lib/native-splash";
import { isSupabaseConfigured } from "@/lib/supabase";
import { hideStorePurchaseUi, isNativeIos } from "@/lib/native-platform";

type Mode = "signin" | "signup";

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M5.3 14.3l-.8.6-2.4 1.9C3.8 20 7.6 22.5 12 22.5c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4z"
      />
      <path
        fill="#FBBC05"
        d="M3.9 7.2C3.3 8.4 3 9.7 3 11c0 1.3.3 2.6.9 3.8l3.2-2.5C6.7 11.3 6.6 10.2 6.6 11c0-.9.2-1.7.5-2.5L3.9 7.2z"
      />
      <path
        fill="#4285F4"
        d="M12 6.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C17 3.3 14.7 2.5 12 2.5 7.6 2.5 3.8 5 2.1 9.1l3.3 2.5C6.9 8.3 9.2 6.4 12 6.4z"
      />
    </svg>
  );
}

function mapAuthError(
  message: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const m = message.toLowerCase();
  if (/invalid login credentials|invalid email or password/i.test(m)) {
    return t("auth.invalidCredentials");
  }
  if (/password.*8|at least 8/i.test(m)) return t("auth.passwordTooShort");
  if (/do not match|don't match/i.test(m)) return t("auth.passwordMismatch");
  return message || t("auth.authFailed");
}

export default function AuthForm({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const oauthErrorParam = searchParams.get("error");
  const showApple = isAppleAuthEnabled();
  const showGoogle = isGoogleOAuthButtonVisible({
    googleEnabled: isGoogleAuthEnabled(),
    nativeIos: forceStoreSafe || isNativeIos(),
  });
  const showOAuth = showApple || showGoogle;
  const {
    isAuthenticated,
    loading: authLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    resendVerificationEmail,
  } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorParam);
  const [info, setInfo] = useState<string | null>(null);
  /** Soft gate: never hide the form forever if session bootstrap stalls */
  const [sessionWaitTimedOut, setSessionWaitTimedOut] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    void hideNativeSplash();
  }, []);

  useEffect(() => {
    if (oauthErrorParam) setError(oauthErrorParam);
  }, [oauthErrorParam]);

  useEffect(() => {
    if (!authLoading) {
      setSessionWaitTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setSessionWaitTimedOut(true), 9000);
    return () => window.clearTimeout(id);
  }, [authLoading]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(nextPath);
    }
  }, [authLoading, isAuthenticated, nextPath, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      if (!isSupabaseConfigured()) {
        throw new Error(t("auth.unavailable"));
      }
      if (mode === "signup") {
        if (password.length < 8) {
          throw new Error(t("auth.passwordTooShort"));
        }
        if (password !== confirm) {
          throw new Error(t("auth.passwordMismatch"));
        }
        const { session, user } = await signUpWithEmail(email, password);
        if (!session || !user?.email_confirmed_at) {
          setInfo(t("auth.signupCheckEmail"));
          setMode("signin");
        } else {
          router.replace(nextPath);
        }
      } else {
        await signInWithEmail(email, password);
        router.replace(nextPath);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("auth.authFailed");
      setError(mapAuthError(raw, t));
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  };

  const onResendVerify = async () => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setError(null);
    setBusy(true);
    try {
      await resendVerificationEmail(email);
      setInfo(t("auth.verifyResentInfo"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.verifyResendFailed"),
      );
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  };

  const onOAuth = async (provider: "apple" | "google") => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithOAuth(provider, nextPath);
      // Native SIWA already wrote the session — hard-navigate so AuthGate
      // remounts against a persisted session (avoids soft-nav bounce to login).
      if (
        provider === "apple" &&
        result &&
        typeof result === "object" &&
        "session" in result &&
        result.session
      ) {
        window.location.assign(nextPath);
        return;
      }
      window.setTimeout(() => {
        setBusy(false);
        submittingRef.current = false;
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("auth.oauthUnavailable", {
              provider: provider === "apple" ? "Apple" : "Google",
            }),
      );
      setBusy(false);
      submittingRef.current = false;
    }
  };

  if (authLoading && !sessionWaitTimedOut) {
    return (
      <div
        data-testid="login-session-loading"
        className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#111827] p-8 text-center text-slate-400"
        role="status"
        aria-live="polite"
      >
        {t("auth.loading")}
      </div>
    );
  }

  return (
    <div
      data-testid="login-form"
      className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800 bg-[#111827] p-6 shadow-xl sm:p-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500">
          <Car className="h-5 w-5 text-black" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t("auth.appName")}</h1>
          <p className="text-xs text-cyan-400">{t("auth.tagline")}</p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white">
          {mode === "signin" ? t("auth.signInTitle") : t("auth.createAccountTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {t(
            forceStoreSafe || hideStorePurchaseUi()
              ? "auth.signInSubtitleStore"
              : "auth.signInSubtitle",
          )}
        </p>
      </div>

      {showOAuth && (
        <>
          <div className="space-y-2.5">
            {showApple && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuth("apple")}
                className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl bg-black px-4 py-3.5 text-sm font-semibold text-white ring-1 ring-slate-600 transition hover:bg-zinc-900 disabled:opacity-60"
                aria-label={t("auth.signInWithApple")}
              >
                <AppleIcon className="h-5 w-5 shrink-0" />
                {t("auth.signInWithApple")}
              </button>
            )}
            {showGoogle && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOAuth("google")}
                className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-600 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
                aria-label={t("auth.continueWithGoogle")}
              >
                <GoogleIcon className="h-5 w-5 shrink-0" />
                {t("auth.continueWithGoogle")}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-slate-700" />
            {t("auth.orEmail")}
            <div className="h-px flex-1 bg-slate-700" />
          </div>
        </>
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("auth.email")}
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-cyan-400"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("auth.password")}
          </span>
          <input
            type="password"
            required
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            enterKeyHint="go"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-cyan-400"
          />
        </label>

        {mode === "signup" && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("auth.confirmPassword")}
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:border-cyan-400"
            />
          </label>
        )}

        {error && (
          <p
            data-testid="login-error"
            role="alert"
            className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}
        {info && (
          <div className="space-y-2 rounded-2xl bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            <p>{info}</p>
            {email.trim() && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onResendVerify()}
                className="min-h-[44px] text-xs font-semibold text-cyan-300 underline hover:text-cyan-200 disabled:opacity-60"
              >
                {t("auth.resendVerification")}
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          data-testid="login-submit"
          className="min-h-[48px] w-full rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
        >
          {busy
            ? t("auth.pleaseWait")
            : mode === "signin"
              ? t("auth.signInWithEmail")
              : t("auth.createAccount")}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        {mode === "signin" ? (
          <>
            {t("auth.newHere")}{" "}
            <button
              type="button"
              className="min-h-[44px] font-medium text-cyan-400 hover:underline"
              onClick={() => {
                setMode("signup");
                setError(null);
                setInfo(null);
              }}
            >
              {t("auth.createAnAccount")}
            </button>
          </>
        ) : (
          <>
            {t("auth.alreadyHaveAccount")}{" "}
            <button
              type="button"
              className="min-h-[44px] font-medium text-cyan-400 hover:underline"
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
              }}
            >
              {t("auth.signIn")}
            </button>
          </>
        )}
      </p>

      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        {t("auth.legalPrefix")}{" "}
        <Link href="/terms" className="text-slate-400 underline">
          {t("auth.terms")}
        </Link>{" "}
        {t("auth.and")}{" "}
        <Link href="/privacy" className="text-slate-400 underline">
          {t("auth.privacy")}
        </Link>
        . {t("auth.legalSuffix")}
      </p>
    </div>
  );
}
