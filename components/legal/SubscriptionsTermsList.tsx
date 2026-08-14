"use client";

import { hideStorePurchaseUi } from "@/lib/native-platform";

/** Billing clause: 14-day trial copy is website-only (App Store 2.1(b)). */
export default function SubscriptionsTermsList() {
  const storeSafe = hideStorePurchaseUi();

  if (storeSafe) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          The iOS app does not sell subscriptions, trials, or extra AI quota.
        </li>
        <li>
          Paid plans, if any, are purchased only on the Garage Genius website.
          This app does not offer trial signup or paid upgrade.
        </li>
        <li>
          Account limits in the app follow the signed-in account. Existing
          vehicles and history remain readable.
        </li>
        <li>
          Deleting your account cancels access immediately.
        </li>
      </ul>
    );
  }

  return (
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
        Token packs and plan limits are described on Pricing / Recharge. Fees
        are generally non-refundable except where required by law or our refund
        policy / support process.
      </li>
      <li>
        Deleting your account cancels access immediately; we attempt to stop
        recurring Stripe subscriptions tied to the account, but you should also
        confirm cancellation in the Customer Portal if a charge continues.
      </li>
    </ul>
  );
}
