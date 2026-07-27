import type { Metadata } from "next";
import LegalDocLayout from "@/components/legal/LegalDocLayout";

export const metadata: Metadata = {
  title: "Terms of Service — Garage Genius AI",
  description:
    "Terms for using Garage Genius AI DIY auto-repair coaching, subscriptions, and related features.",
};

export default function TermsPage() {
  return (
    <LegalDocLayout title="Terms of Service" updated="July 24, 2026">
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
          dealership, or certified repair shop. This is general guidance only.
          Always refer to your vehicle’s official owner’s manual or consult a
          qualified technician. Garage Genius AI is not responsible for any
          damage, injury, or costs resulting from DIY actions or reliance on
          this information — especially brakes, airbags, fuel systems,
          jacking/lifting, high-voltage hybrids/EVs, and structural repairs.
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
          service, or attempt to bypass Free / Pro quotas.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          4. Subscriptions &amp; billing
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            New accounts may receive a limited Pro trial as described in-app /
            on Pricing.
          </li>
          <li>
            Paid plans renew until cancelled. Manage or cancel via Stripe
            Customer Portal (Settings → Manage billing) or applicable store
            billing if you subscribed through an app store.
          </li>
          <li>
            Token packs and plan limits are described on Pricing / Recharge.
            Fees are generally non-refundable except where required by law or
            our refund policy / support process.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          5. Acceptable use
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
          6. Intellectual property
        </h2>
        <p className="mt-2">
          The app, coach playbooks, branding, and software remain our property
          (or our licensors&apos;). You retain rights to content you submit; you
          grant us a license to host and process it to operate the product.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          7. Disclaimers &amp; liability
        </h2>
        <p className="mt-2">
          The service is provided &quot;as is&quot; without warranties of
          uninterrupted or error-free operation. AI outputs may be wrong or
          incomplete. To the fullest extent permitted by law, we are not liable
          for vehicle damage, injury, or consequential losses arising from
          reliance on DIY guidance. Some jurisdictions do not allow certain
          exclusions — your rights there still apply.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          8. Changes &amp; contact
        </h2>
        <p className="mt-2">
          We may update these Terms; the &quot;Last updated&quot; date will
          change. Continued use after changes means you accept the revised
          Terms. Questions: Settings → Billing help, or the support channel on
          your store listing.
        </p>
      </section>
    </LegalDocLayout>
  );
}
