"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  Car,
  Gauge,
  Mic,
  Package,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import PricingCards from "@/components/landing/PricingCards";
import {
  hideStorePurchaseUi,
  NATIVE_LANDING_CTA,
  NATIVE_LANDING_KICKER,
} from "@/lib/native-platform";

const FEATURES = [
  {
    id: "dashboard",
    title: "Vehicle dashboard",
    body: "Tap a region on your car map — brakes, battery, cooling — and get a checklist before you crawl under the chassis.",
    icon: Gauge,
  },
  {
    id: "diagnose",
    title: "AI diagnosis that knows cars",
    body: "Specialist prompts plus vehicle-aware RAG — clearer than generic chatbots when something squeaks, smells, or throws a code.",
    icon: Wrench,
  },
  {
    id: "parts",
    title: "Parts recommendations",
    body: "See what to buy, keep a garage inventory, and jump from diagnosis to the right part without tab-hopping forums.",
    icon: Package,
  },
  {
    id: "voice",
    title: "Hands-free voice coaching",
    body: "Pro / trial mic + auto-read so you can listen while your hands are greasy. Built for under-the-car DIY, not desk chat.",
    icon: Mic,
  },
] as const;

const SCENARIOS = [
  {
    title: "Brake noise before a weekend drive",
    body: "Open Dashboard, tap Brakes, and walk a short checklist before you buy pads or schedule a shop visit.",
  },
  {
    title: "Check-engine light with a code",
    body: "Paste the DTC into Chat or Coach, compare likely causes, then save parts and maintenance notes to History.",
  },
  {
    title: "Receipt after a repair",
    body: "Snap the invoice, confirm the parsed jobs, and keep the record with your vehicle so the next diagnosis has context.",
  },
] as const;

const TRIAL_COPY =
  "Free to start · 14-day Pro trial on signup (no card required) · Cancel anytime";

export default function LandingPage({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const { isAuthenticated, loading } = useAuth();
  const storeSafe = forceStoreSafe || hideStorePurchaseUi();
  const primaryHref = isAuthenticated ? "/app" : "/login?next=/app";
  const primaryLabel = isAuthenticated
    ? "Open garage"
    : storeSafe
      ? NATIVE_LANDING_CTA
      : "Start free";
  const heroKicker = storeSafe ? NATIVE_LANDING_KICKER : TRIAL_COPY;

  return (
    <div className="landing-root">
      {/* Ambient layers */}
      <div className="landing-atmosphere" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <header className="landing-nav">
        <Link href="/" className="landing-brand-mark">
          <span className="landing-brand-icon" aria-hidden>
            <Car className="h-5 w-5" />
          </span>
          <span className="font-[family-name:var(--font-display)] font-semibold tracking-tight">
            Garage Genius AI
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a
            href="#features"
            className="hidden text-sm text-slate-400 transition hover:text-white sm:inline"
          >
            Features
          </a>
          {!storeSafe && (
            <a
              href="#pricing"
              className="hidden text-sm text-slate-400 transition hover:text-white sm:inline"
            >
              Pricing
            </a>
          )}
          {!loading && isAuthenticated ? (
            <Link href="/app" className="landing-nav-cta">
              Open garage
            </Link>
          ) : (
            <>
              <Link
                href="/login?next=/app"
                className="hidden text-sm text-slate-300 transition hover:text-white sm:inline"
              >
                Sign in
              </Link>
              <Link href={primaryHref} className="landing-nav-cta">
                {primaryLabel}
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero — one composition: brand, headline, support, CTAs, full-bleed visual */}
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-hero-brand font-[family-name:var(--font-display)]">
            Garage Genius AI
          </p>
          <h1 className="landing-hero-title font-[family-name:var(--font-display)]">
            DIY car repair with a coach that actually knows vehicles
          </h1>
          <p className="landing-hero-sub">
            Diagnose safer, buy the right parts, and wrench with voice guidance —
            built for US & EU weekend mechanics, not generic chatbots.
          </p>
          <div className="landing-hero-ctas">
            <Link href={primaryHref} className="landing-btn-primary">
              <Sparkles className="h-4 w-4" aria-hidden />
              {primaryLabel}
            </Link>
            <a href="#features" className="landing-btn-ghost">
              See how it works
            </a>
          </div>
          <p className="landing-hero-note">{heroKicker}</p>
        </div>

        <div className="landing-hero-visual" aria-hidden>
          <div className="landing-hero-beam landing-hero-beam-a" />
          <div className="landing-hero-beam landing-hero-beam-b" />
          <svg
            className="landing-hero-car"
            viewBox="0 0 800 320"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="body" x1="0" y1="0" x2="800" y2="320">
                <stop stopColor="#1e293b" />
                <stop offset="0.5" stopColor="#334155" />
                <stop offset="1" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id="glow" x1="400" y1="0" x2="400" y2="320">
                <stop stopColor="#22d3ee" stopOpacity="0.55" />
                <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
            <ellipse cx="400" cy="280" rx="280" ry="18" fill="url(#glow)" />
            <path
              d="M120 210c40-70 120-110 280-110s240 40 280 110l-40 40H160l-40-40z"
              fill="url(#body)"
              stroke="#22d3ee"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
            <path
              d="M220 120c50-35 120-50 180-50s130 15 180 50l-30 55H250l-30-55z"
              fill="#0f172a"
              stroke="#64748b"
              strokeOpacity="0.5"
            />
            <circle cx="230" cy="230" r="42" fill="#020617" stroke="#22d3ee" strokeOpacity="0.4" />
            <circle cx="570" cy="230" r="42" fill="#020617" stroke="#22d3ee" strokeOpacity="0.4" />
            <circle cx="230" cy="230" r="18" fill="#164e63" />
            <circle cx="570" cy="230" r="18" fill="#164e63" />
            <path
              d="M300 155h200"
              stroke="#22d3ee"
              strokeOpacity="0.25"
              strokeWidth="2"
              strokeDasharray="6 8"
            />
          </svg>
          <div className="landing-hero-scan" />
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-section-head">
          <h2 className="font-[family-name:var(--font-display)]">
            Everything you need before you turn a bolt
          </h2>
          <p>
            Instant value on open — dashboard, diagnosis, parts, and
            {storeSafe ? " optional voice coaching" : " Pro / trial voice"}{" "}
            — so you feel confident under the hood.
          </p>
        </div>

        <div className="landing-feature-list">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.id}
                className="landing-feature"
                style={{ animationDelay: `${0.05 * index}s` }}
              >
                <div className="landing-feature-icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-display)]">
                    {feature.title}
                  </h3>
                  <p>
                    {storeSafe && feature.id === "voice"
                      ? "Optional mic + auto-read on accounts that include voice coaching. Built for under-the-car DIY, not desk chat."
                      : feature.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="scenarios" className="landing-section landing-section-muted">
        <div className="landing-section-head">
          <h2 className="font-[family-name:var(--font-display)]">
            What you can do
          </h2>
          <p>
            Example workflows inside Garage Genius — not customer reviews.
          </p>
        </div>

        <div className="landing-stories">
          {SCENARIOS.map((item) => (
            <article key={item.title} className="landing-story">
              <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {!storeSafe && (
      <section id="pricing" className="landing-section">
        <div className="landing-section-head">
          <h2 className="font-[family-name:var(--font-display)]">
            Start free. Upgrade when you wrench more.
          </h2>
          <p>
            Free covers basics. Pro unlocks voice coaching and higher token
            limits. Heavy is for multi-car households.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="mt-4 h-64 animate-pulse rounded-3xl bg-slate-900/60" />
          }
        >
          <PricingCards trialHref="/login?next=/app" appHref="/app" />
        </Suspense>
      </section>
      )}

      <section className="landing-final-cta">
        <h2 className="font-[family-name:var(--font-display)]">
          Ready to wrench smarter?
        </h2>
        <p>
          Open Garage Genius AI, add your vehicle, and get a clear next step in
          minutes — with safety disclaimers on every reply.
        </p>
        <Link href={primaryHref} className="landing-btn-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
          {primaryLabel}
        </Link>
      </section>

      <footer className="landing-footer">
        <p className="font-[family-name:var(--font-display)] text-sm text-slate-300">
          Garage Genius AI
        </p>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
          Not a substitute for a licensed mechanic. Always follow safety
          procedures. Privacy-minded: we do not store raw voice audio from
          browser speech APIs.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <Link href="/pricing" className="hover:text-cyan-400">
            Pricing
          </Link>
          <Link href="/privacy" className="hover:text-cyan-400">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-cyan-400">
            Terms
          </Link>
          <Link href="/login?next=/app" className="hover:text-cyan-400">
            Sign in
          </Link>
          <Link href="/app" className="hover:text-cyan-400">
            App
          </Link>
        </div>
      </footer>
    </div>
  );
}
