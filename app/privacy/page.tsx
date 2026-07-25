import type { Metadata } from "next";
import LegalDocLayout from "@/components/legal/LegalDocLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Garage Genius AI",
  description:
    "How Garage Genius AI collects, uses, and protects account, vehicle, and repair-chat data.",
};

export default function PrivacyPage() {
  return (
    <LegalDocLayout title="Privacy Policy" updated="July 24, 2026">
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          1. Who we are
        </h2>
        <p className="mt-2">
          Garage Genius AI (&quot;we&quot;, &quot;us&quot;) provides an AI DIY
          auto-repair coach for vehicle owners. This policy explains what we
          collect and why. Contact: use in-app Settings or the support email on
          your store listing / billing receipt.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          2. Data we collect
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="text-slate-200">Account:</strong> email (or Apple
            Hide My Email), user ID, auth provider.
          </li>
          <li>
            <strong className="text-slate-200">Vehicle profile:</strong> year,
            make, model, mileage, tags you enter.
          </li>
          <li>
            <strong className="text-slate-200">Product usage:</strong> chat /
            coach sessions, maintenance notes, inventory items you save, token
            usage for plan limits.
          </li>
          <li>
            <strong className="text-slate-200">Billing:</strong> Stripe customer
            / subscription IDs and status (card details are handled by Stripe,
            not stored on our servers).
          </li>
          <li>
            <strong className="text-slate-200">Optional push:</strong> web-push
            subscription endpoint if you enable reminders.
          </li>
        </ul>
        <p className="mt-3">
          We do <strong className="text-slate-200">not</strong> store raw audio
          from browser speech APIs. Voice is transcribed locally / by the OS
          speech stack when you use that feature.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          3. How we use data
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Provide diagnosis, coach playbooks, and vehicle tools.</li>
          <li>Enforce Free / Pro limits and prevent abuse.</li>
          <li>Process subscriptions, invoices, and support requests.</li>
          <li>Improve safety copy and product quality (aggregated / de-identified where practical).</li>
        </ul>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          4. Processors
        </h2>
        <p className="mt-2">
          We use trusted processors such as Supabase (auth &amp; database),
          Stripe (payments), and AI providers (e.g. DeepSeek) to generate DIY
          guidance from your prompts and vehicle context. Data is sent only as
          needed to deliver the feature you requested.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          5. Retention &amp; deletion
        </h2>
        <p className="mt-2">
          Account data is kept while your account is active. You may request
          deletion via Settings / support; we will delete or anonymize personal
          data except records we must keep for legal, fraud, or accounting
          reasons (e.g. paid invoices).
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          6. Your choices
        </h2>
        <p className="mt-2">
          You can sign out, cancel subscription via Stripe Customer Portal,
          disable push reminders, and limit what vehicle data you enter. For EU
          / UK users, you may have rights of access, correction, erasure, and
          objection under applicable law — contact support to exercise them.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          7. Children
        </h2>
        <p className="mt-2">
          Garage Genius AI is not directed at children under 16. Do not create an
          account if you are under the age required in your region.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          8. Changes
        </h2>
        <p className="mt-2">
          We may update this policy. Material changes will be reflected by the
          &quot;Last updated&quot; date on this page.
        </p>
      </section>
    </LegalDocLayout>
  );
}
