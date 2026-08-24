import Link from "next/link";
import {
  APPLE_STANDARD_EULA_URL,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
} from "@/lib/legal-urls";

/** Guideline 3.1.2(c): Privacy Policy + Terms of Use (EULA) on the paywall. */
export default function SubscriptionLegalLinks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <p className={className}>
      <Link href={PRIVACY_POLICY_PATH} className="underline underline-offset-2">
        Privacy Policy
      </Link>
      <span className="mx-2 opacity-40" aria-hidden>
        ·
      </span>
      <a
        href={APPLE_STANDARD_EULA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        Terms of Use (EULA)
      </a>
      <span className="mx-2 opacity-40" aria-hidden>
        ·
      </span>
      <Link href={TERMS_PATH} className="underline underline-offset-2">
        Website terms
      </Link>
    </p>
  );
}
