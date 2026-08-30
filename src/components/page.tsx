import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
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
    <div className="glass sticky top-0 z-30 flex items-start justify-between gap-6 rounded-none border-x-0 border-t-0 px-6 py-4">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
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
