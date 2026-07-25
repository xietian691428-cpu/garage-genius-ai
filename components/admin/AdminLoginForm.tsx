"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminLoginAction, type ActionResult } from "@/app/admin/actions";

const initialState: ActionResult | null = null;

export default function AdminLoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    adminLoginAction,
    initialState,
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace("/admin");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-[#111827] p-8 shadow-xl"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Sign In</h1>
        <p className="mt-1 text-sm text-slate-400">
          Email: <span className="text-slate-300">ADMIN_EMAIL</span> from
          .env.local. Password is the real password you chose — not escaped
          .env syntax.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
        />
      </label>

      {state?.error && (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
