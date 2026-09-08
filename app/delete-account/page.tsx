import type { Metadata } from "next";
import Link from "next/link";
import LegalDocLayout from "@/components/legal/LegalDocLayout";

export const metadata: Metadata = {
  title: "Delete account & data — Garage Genius AI",
  description:
    "How to delete your Garage Genius AI account and associated data from the app or by email.",
};

const SUPPORT_EMAIL = "xietian691428@gmail.com";

/**
 * Public web resource for Google Play Data safety “account deletion” URL.
 * Must work without reinstalling the app (email path) and name the product.
 */
export default function DeleteAccountPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "Garage Genius AI — account deletion request",
  )}&body=${encodeURIComponent(
    "Please delete my Garage Genius AI account and associated data.\n\nAccount email:\n\n",
  )}`;

  return (
    <LegalDocLayout title="Delete your account & data" updated="September 8, 2026">
      <section>
        <p className="mt-2">
          This page explains how to permanently delete your{" "}
          <strong className="text-slate-200">Garage Genius AI</strong> account
          and the vehicle, chat, maintenance, and inventory data we store for
          you.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          Option 1 — In the app (fastest)
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open Garage Genius AI and sign in with the account you want to
            delete.
          </li>
          <li>
            Go to <strong className="text-slate-200">Account / Settings</strong>.
          </li>
          <li>
            Tap <strong className="text-slate-200">Delete my account…</strong>,
            type <span className="font-mono text-cyan-300">DELETE</span>, and
            confirm.
          </li>
        </ol>
        <p className="mt-3">
          <Link
            href="/login?next=/app?tab=settings"
            className="text-cyan-400 hover:underline"
          >
            Sign in to open Settings
          </Link>
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          Option 2 — By email (if you uninstalled the app)
        </h2>
        <p className="mt-2">
          Email{" "}
          <a href={mailto} className="text-cyan-400 hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on your account. Use subject{" "}
          <strong className="text-slate-200">
            Garage Genius AI — account deletion request
          </strong>{" "}
          and include the account email. We process verified requests and delete
          the account and associated app data we host.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          What is deleted
        </h2>
        <p className="mt-2">
          Auth user, vehicles, chats, maintenance history, inventory, and related
          rows we store for you. Limited records required for legal, fraud, tax,
          or accounting (for example paid invoice references) may be retained.
          Stripe or Apple may keep their own billing records under their
          policies. Deletion cannot be undone.
        </p>
        <p className="mt-3">
          If you have an Apple or website subscription, cancel it separately in
          Apple ID settings or the Stripe customer portal so renewals stop.
        </p>
      </section>

      <section>
        <p className="mt-2 text-slate-400">
          Related:{" "}
          <Link href="/privacy#deletion" className="text-cyan-400 hover:underline">
            Privacy Policy — retention &amp; deletion
          </Link>
          .
        </p>
      </section>
    </LegalDocLayout>
  );
}
