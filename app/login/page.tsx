"use client";

import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#111827] p-8 text-center text-slate-400">
            Loading…
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
