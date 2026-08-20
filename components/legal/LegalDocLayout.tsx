import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalDocLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="page-scroll min-h-full bg-[#0a0f1c]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.14), transparent)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <Link
          href="/"
          className="text-sm text-slate-400 transition hover:text-cyan-300"
        >
          ← Garage Genius AI
        </Link>
        <header className="mt-8">
          <p className="font-[family-name:var(--font-display)] text-sm font-medium tracking-wide text-cyan-400/90">
            Garage Genius AI
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
        </header>
        <article className="legal-prose mt-10 space-y-6 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
          {children}
        </article>
        <footer className="mt-12 flex flex-wrap gap-4 border-t border-slate-800 pt-6 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-cyan-400">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-cyan-400">
            Terms of Service
          </Link>
          <Link href="/pricing" className="hover:text-cyan-400">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-cyan-400">
            Sign in
          </Link>
        </footer>
      </div>
    </div>
  );
}
