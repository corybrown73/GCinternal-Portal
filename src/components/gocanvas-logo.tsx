import { cn } from "@/lib/utils";

/**
 * The GoCanvas wordmark.
 *
 * WHAT THIS IS AND IS NOT. gocanvas.com is not reachable from the build
 * environment, so this is the mark rebuilt from the marketing site rather than
 * the official asset: lowercase, "go" in the brand blue, "canvas" in navy, with
 * the Nemetschek endorsement line beneath.
 *
 * It is deliberately the FALLBACK. `logoUrl` is whatever has been uploaded
 * through Appearance settings, and when that exists it wins — dropping the real
 * SVG in there replaces this everywhere it appears, with no deploy. A hand-cut
 * approximation is the right thing to show until somebody does that, and the
 * wrong thing to leave in place afterwards.
 */
export function GoCanvasLogo({
  logoUrl,
  className,
  showEndorsement = true,
}: {
  /** An uploaded mark. When present this is used instead of the wordmark. */
  logoUrl?: string | null;
  className?: string;
  showEndorsement?: boolean;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="GoCanvas"
        className={cn("h-8 w-auto object-contain", className)}
        // Never stretched: a squashed logo is the first thing a brand-aware
        // reader notices, and this page exists to look native to them.
        style={{ objectFit: "contain" }}
      />
    );
  }

  return (
    <span className={cn("inline-flex flex-col leading-none", className)} aria-label="GoCanvas">
      <span
        className="text-[26px] font-bold tracking-[-0.03em]"
        style={{ fontFeatureSettings: '"ss01"' }}
        aria-hidden="true"
      >
        <span style={{ color: "var(--gc-blue, #1667e8)" }}>go</span>
        <span style={{ color: "var(--gc-navy, #0b2c5c)" }}>canvas</span>
      </span>
      {showEndorsement ? (
        <span
          className="mt-[3px] text-[6.5px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--gc-body, #3d5378)" }}
          aria-hidden="true"
        >
          A Nemetschek Company
        </span>
      ) : null}
    </span>
  );
}
