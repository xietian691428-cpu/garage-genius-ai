import Link from "next/link";

/** Compact Privacy + Terms links for auth, settings, and footers. */
export default function LegalLinks({
  className = "",
  separator = "·",
}: {
  className?: string;
  separator?: string;
}) {
  return (
    <span className={className}>
      <Link href="/privacy" className="underline-offset-2 hover:underline">
        Privacy
      </Link>
      <span className="mx-1.5 opacity-50" aria-hidden>
        {separator}
      </span>
      <Link href="/terms" className="underline-offset-2 hover:underline">
        Terms
      </Link>
    </span>
  );
}
