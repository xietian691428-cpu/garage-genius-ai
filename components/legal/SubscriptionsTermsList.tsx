"use client";

import {
  hideStorePurchaseUi,
  NATIVE_TERMS_BILLING_BULLETS,
  NATIVE_TERMS_BILLING_HEADING,
} from "@/lib/native-platform";

/** Billing clause: purchase copy is website-only (App Store 2.1(b)). */
export default function SubscriptionsTermsList({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const storeSafe = forceStoreSafe || hideStorePurchaseUi();

  return (
    <section>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
        {storeSafe
          ? NATIVE_TERMS_BILLING_HEADING
          : "5. Subscriptions & billing"}
      </h2>
      {storeSafe ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {NATIVE_TERMS_BILLING_BULLETS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            New accounts receive a limited Pro trial as described on the website /
            Pricing (typically 14 days, no card required to start).
          </li>
          <li>
            Paid plans renew until cancelled. Manage or cancel via Stripe Customer
            Portal (Settings → Manage billing).
          </li>
          <li>
            Token packs and plan limits (monthly tokens, photo analyses, and
            vehicle caps) are described on Pricing / Recharge. Fees
            are generally non-refundable except where required by law or our refund
            policy / support process.
          </li>
          <li>
            Deleting your account cancels access immediately; we attempt to stop
            recurring Stripe subscriptions tied to the account, but you should also
            confirm cancellation in the Customer Portal if a charge continues.
          </li>
        </ul>
      )}
    </section>
  );
}
