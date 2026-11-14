import Link from "next/link";

export default function HomeTrustStrip() {
  return (
    <p
      data-testid="home-trust-strip"
      className="text-center text-[11px] leading-relaxed text-slate-600"
    >
      Educational guidance — not OEM-certified. Verify specs in your manual and
      with a qualified technician.{" "}
      <Link
        href="/#proof"
        className="text-cyan-500/90 underline-offset-2 hover:text-cyan-300 hover:underline"
      >
        See Example sourced answers
      </Link>
    </p>
  );
}
