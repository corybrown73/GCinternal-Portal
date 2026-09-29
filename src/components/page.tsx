import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  sticky = true,
  size = "md",
  hero,
}: {
  /**
   * ReactNode, not string: a record page puts the customer's logo beside their
   * name, and that belongs in the heading rather than pushed into `actions`
   * where it would sit next to the buttons.
   */
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Off for a long record page, where the header only costs height. */
  sticky?: boolean;
  /** "lg" for a landing page: the title is the page. */
  size?: "md" | "lg";
  /**
   * A hero band beside the title: a quiet image-like wash with a line of
   * type on it. For the landing page only — a record page has no room for
   * decoration.
   */
  hero?: { tagline: string };
}) {
  return (
    // A floating overlay layer, so it is glass: it sticks to the top of the
    // viewport and the content scrolls under it. That is the whole argument for
    // the material here — you can see that something is passing beneath the bar
    // rather than disappearing at a hard edge.
    //
    // Glass is allowed here precisely because this surface is sparse. A title,
    // a line of description and two buttons sit over the blur; a table would
    // not, because blur samples whatever is behind it and dense text cannot
    // afford contrast that varies with the content underneath.
    // flex-wrap, so a header with a long title and two buttons stacks rather
    // than pushing the actions off the right edge on a narrow window.
    <div
      className={cn(
        "glass flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-none border-x-0 border-t-0 px-4 py-4 sm:px-6",
        sticky && "sticky top-0 z-30",
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            "font-semibold tracking-tight",
            size === "lg" ? "text-[28px] leading-tight sm:text-[32px]" : "text-[15px]",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "mt-1 max-w-2xl text-muted-foreground",
              size === "lg" ? "text-[14px]" : "text-[13px]",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      {hero ? <Hero tagline={hero.tagline} /> : null}
    </div>
  );
}

/**
 * The hero: a wash in the brand's blues with a line of script on it. Drawn
 * in CSS so it costs no request and needs no photo licence; a deployment
 * that wants its own picture sets it under Appearance later.
 */
function Hero({ tagline }: { tagline: string }) {
  return (
    <div
      aria-hidden
      className="relative hidden h-[112px] w-[320px] shrink-0 overflow-hidden rounded-lg lg:block"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.42 0.12 250) 0%, oklch(0.62 0.10 235) 45%, oklch(0.88 0.03 90) 100%)",
      }}
    >
      <svg
        className="absolute inset-x-0 bottom-0 h-[62%] w-full"
        viewBox="0 0 320 70"
        preserveAspectRatio="none"
      >
        <path
          d="M0 70 L0 44 L38 22 L70 40 L104 14 L140 36 L172 24 L206 46 L236 30 L268 48 L296 38 L320 52 L320 70 Z"
          fill="oklch(0.30 0.06 250 / 0.55)"
        />
        <path
          d="M0 70 L0 56 L30 48 L64 58 L98 44 L132 56 L168 50 L200 60 L240 52 L276 62 L320 58 L320 70 Z"
          fill="oklch(0.22 0.05 250 / 0.7)"
        />
      </svg>
      <p
        className="absolute right-4 top-4 max-w-[150px] text-right text-[17px] italic leading-snug text-white/95"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        {tagline}
      </p>
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  // Narrower gutters on a small window: at 820px, 24px of padding either side
  // is 6% of the viewport spent on nothing.
  return <div className={cn("px-4 py-5 sm:px-6", className)}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">{description}</p>
      {hint ? (
        <p className="mx-auto mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
