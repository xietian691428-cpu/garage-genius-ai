import type { Metadata } from "next";
import { headers } from "next/headers";
import LegalDocLayout from "@/components/legal/LegalDocLayout";
import SubscriptionsTermsList from "@/components/legal/SubscriptionsTermsList";
import { userAgentLooksNative } from "@/lib/native-platform";

export const metadata: Metadata = {
  title: "Terms of Service — Garage Genius AI",
  description:
    "Terms for using Garage Genius AI DIY auto-repair coaching and related features.",
};

export default async function TermsPage() {
  const storeSafe = userAgentLooksNative((await headers()).get("user-agent"));
  return (
    <LegalDocLayout title="Terms of Service" updated="July 30, 2026">
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          1. Agreement
        </h2>
        <p className="mt-2">
          By creating an account or using Garage Genius AI, you agree to these
          Terms and our{" "}
          <a href="/privacy" className="text-cyan-400 underline">
            Privacy Policy
          </a>
          . If you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          2. Not professional advice
        </h2>
        <p className="mt-2">
          Garage Genius AI provides <strong className="text-slate-200">general DIY
          educational guidance only</strong>. It is not a licensed mechanic,
          dealership, or certified repair shop. It does{" "}
          <strong className="text-slate-200">not</strong> provide insurance or
          legal advice and never determines whether a claim will be covered.
          Reminders about modifications or non-OEM parts are general information
          only — always check your policy or contact your insurer. This is
          general guidance only. Always refer to your vehicle’s official owner’s
          manual or consult a qualified technician. Garage Genius AI is not
          responsible for any damage, injury, or costs resulting from DIY actions
          or reliance on this information — especially brakes, airbags, fuel
          systems, jacking/lifting, high-voltage hybrids/EVs, and structural
          repairs.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          3. Accounts
        </h2>
        <p className="mt-2">
          You are responsible for your login credentials and for activity under
          your account. Provide accurate vehicle information when using
          fitment-sensitive features. Do not abuse rate limits, scrape the
          service, or attempt to bypass Free / Pro quotas. You may delete your
          account at any time in Settings; deletion is permanent and ends access
          to stored chats, vehicles, and history we host for you.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          4. Photos, receipts, and AI features
        </h2>
        <p className="mt-2">
          If you upload vehicle photos, OBD screen captures, or repair receipts,
          you confirm you have the right to share them and that they do not
          contain unnecessary personal data of others. You understand images and
          related text may be processed by AI providers to deliver the feature
          you requested. AI results are probabilistic and may omit hazards —
          always verify with official manuals and safe shop practices.
        </p>
      </section>

      <SubscriptionsTermsList forceStoreSafe={storeSafe} />

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          6. Acceptable use
        </h2>
        <p className="mt-2">
          Do not use the service for unlawful activity, to harm others, to
          reverse-engineer safety systems in a dangerous way, or to generate
          content that facilitates fraud. We may suspend accounts that violate
          these Terms or create abuse risk.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          7. Intellectual property
        </h2>
        <p className="mt-2">
          The app, coach playbooks, branding, and software remain our property
          (or our licensors&apos;). You retain rights to content you submit; you
          grant us a license to host and process it to operate the product.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          8. Disclaimers &amp; liability
        </h2>
        <p className="mt-2">
          The service is provided &quot;as is&quot; without warranties of
          uninterrupted or error-free operation. AI outputs, playbook steps, and
          part suggestions may be wrong or incomplete. Illustrations or media may
          be unavailable for some coach steps; text instructions remain the
          source of truth. To the fullest extent permitted by law, we are not
          liable for vehicle damage, injury, or consequential losses arising from
          reliance on DIY guidance. Some jurisdictions do not allow certain
          exclusions — your rights there still apply.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          9. Changes &amp; contact
        </h2>
        <p className="mt-2">
          We may update these Terms; the &quot;Last updated&quot; date will
          change. Continued use after changes means you accept the revised
          Terms. Questions:{" "}
          <a
            href="mailto:xietian691428@gmail.com"
            className="text-cyan-400 hover:underline"
          >
            xietian691428@gmail.com
          </a>
          , Settings → Billing help, or the support channel on your store
          listing.
        </p>
      </section>
    </LegalDocLayout>
  );
}
