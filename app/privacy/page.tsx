import type { Metadata } from "next";
import LegalDocLayout from "@/components/legal/LegalDocLayout";
import StoreSafeText from "@/components/legal/StoreSafeText";
import {
  NATIVE_PRIVACY_BILLING,
  NATIVE_PRIVACY_CHOICES,
  NATIVE_PRIVACY_PUSH,
  NATIVE_PRIVACY_USE,
} from "@/lib/native-platform";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export const metadata: Metadata = {
  title: "Privacy Policy — Garage Genius AI",
  description:
    "How Garage Genius AI collects, uses, and protects account, vehicle, photo, and repair-chat data.",
};

export default async function PrivacyPage() {
  const storeSafe = await readForceStoreSafe();
  return (
    <LegalDocLayout title="Privacy Policy" updated="July 30, 2026">
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          1. Who we are
        </h2>
        <p className="mt-2">
          Garage Genius AI (&quot;we&quot;, &quot;us&quot;) provides an AI DIY
          auto-repair coach for vehicle owners. This policy explains what we
          collect and why. Contact:{" "}
          <a
            href="mailto:xietian691428@gmail.com"
            className="text-cyan-400 hover:underline"
          >
            xietian691428@gmail.com
          </a>
          , in-app Settings, or the support email on your store listing /
          billing receipt.
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
            make, model, mileage, market, tags, and related specs you enter or
            match. Optional fields may include country/region and an insurer
            name used only to personalize general insurance reminders — not to
            adjudicate claims or store full policy terms.
          </li>
          <li>
            <strong className="text-slate-200">Chat &amp; coach usage:</strong>{" "}
            messages, coach playbook progress, maintenance notes, inventory
            items, token usage for plan limits, and optional DIY skill
            preferences / feedback.
          </li>
          <li>
            <strong className="text-slate-200">Photos &amp; images you
            upload:</strong> garage / vehicle photos for diagnosis, OBD screen
            photos, and repair / parts receipts or invoices. Images may be stored
            with your chat or maintenance history (often as image data attached
            to those records) so the feature can work across sessions.
          </li>
          <li>
            <strong className="text-slate-200">Billing:</strong>{" "}
            <StoreSafeText
              forceStoreSafe={storeSafe}
              store={NATIVE_PRIVACY_BILLING}
              web="Stripe customer / subscription IDs and status (card details are handled by Stripe, not stored on our servers)."
            />
          </li>
          <li>
            <strong className="text-slate-200">Optional push:</strong>{" "}
            <StoreSafeText
              forceStoreSafe={storeSafe}
              store={NATIVE_PRIVACY_PUSH}
              web="web-push subscription endpoint if you enable maintenance reminders."
            />
          </li>
        </ul>
        <p className="mt-3">
          We do <strong className="text-slate-200">not</strong> store raw audio
          from browser speech APIs. Voice is transcribed locally / by the OS
          speech stack when you use that feature. We do not request device
          location/GPS for core features.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          3. How we use data
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Provide diagnosis, coach playbooks, dashboard checks, and vehicle tools.</li>
          <li>
            Show optional general reminders about modifications / non-OEM parts
            and insurance (education only — we do not determine claim coverage).
          </li>
          <li>
            Read photos / receipts you submit to extract repair context (e.g.
            symptoms, DTCs, shop invoice line items) and return guidance.
          </li>
          <li>Enforce Free / Pro limits and prevent abuse.</li>
          <li>
            <StoreSafeText
              forceStoreSafe={storeSafe}
              store={NATIVE_PRIVACY_USE}
              web="Process subscriptions, invoices, and support requests."
            />
          </li>
          <li>
            Improve safety copy and product quality (including aggregated or
            de-identified signals such as coach step feedback where practical).
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          4. AI processing
        </h2>
        <p className="mt-2">
          When you use Chat, Coach-related AI, Dashboard inspect, or vision
          features (vehicle photo, OBD photo, receipt scan), chat and coaching
          text are sent to DeepSeek. Photos or screenshots you attach are sent
          to Kimi (Moonshot) for image recognition only; DeepSeek then writes
          the educational reply from that structured description. We do not
          send photos until you agree. We send only what is needed for that
          request. Before the first AI request, the app shows a consent screen
          that names DeepSeek and Kimi, lists the data categories that may be
          sent, and requires your active agreement; if you decline, we do not
          call these providers and we do not upload photos. You can review
          details anytime in this Privacy Policy. AI outputs can be wrong or
          incomplete — treat them as DIY education, not certified repair
          advice. Providers may process data on servers outside your country;
          see their policies for retention details.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          5. Processors
        </h2>
        <p className="mt-2">
          We use trusted processors such as Supabase (auth &amp; database),
          Stripe (website payments), Apple (App Store In-App Purchases on iOS),
          Vercel (hosting), and AI providers (DeepSeek for text coaching; Kimi /
          Moonshot for photo recognition) to operate the product. Optional email
          / push providers may be used for maintenance reminders you enable.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          6. Retention &amp; deletion
        </h2>
        <p className="mt-2">
          Account data is kept while your account is active. You can permanently
          delete your account in{" "}
          <strong className="text-slate-200">Settings → Delete account</strong>.
          That removes your Auth user and cascaded app data we store for you
          (vehicles, chats, maintenance history, inventory, and related rows).
          We may retain limited records required for legal, fraud, tax, or
          accounting reasons (for example paid invoice references). Stripe may
          retain its own billing records under its policies. After deletion,
          recovery is not available.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          7. Your choices
        </h2>
        <p className="mt-2">
          <StoreSafeText
            forceStoreSafe={storeSafe}
            store={NATIVE_PRIVACY_CHOICES}
            web="You can sign out, cancel a subscription via Stripe Customer Portal (or the applicable app store), disable push reminders, limit what vehicle or photo data you enter, and delete your account."
          />{" "}
          For EU / UK
          users, you may have rights of access, correction, erasure, and
          objection under applicable law — contact{" "}
          <a
            href="mailto:xietian691428@gmail.com"
            className="text-cyan-400 hover:underline"
          >
            xietian691428@gmail.com
          </a>{" "}
          to exercise them if in-app tools are not enough.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          8. Children
        </h2>
        <p className="mt-2">
          Garage Genius AI is not directed at children under 16. Do not create an
          account if you are under the age required in your region.
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          9. Changes
        </h2>
        <p className="mt-2">
          We may update this policy. Material changes will be reflected by the
          &quot;Last updated&quot; date on this page.
        </p>
      </section>
    </LegalDocLayout>
  );
}
