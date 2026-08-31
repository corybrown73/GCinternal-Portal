import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { humanize, stageLabel } from "@/lib/hub-format";
import { PACE_CHIP, PACE_LABEL, PACE_TEXT, type Pace } from "@/lib/pace";

const STATUS_CLASS: Record<string, string> = {
  on_track: "bg-status-ontrack text-status-ontrack-foreground",
  at_risk: "bg-status-risk text-status-risk-foreground",
  blocked: "bg-status-blocked text-status-blocked-foreground",
  idle: "bg-status-idle text-status-idle-foreground",
  no_signal: "border border-dashed border-border bg-transparent text-muted-foreground",
};

const DOT_CLASS: Record<string, string> = {
  on_track: "bg-status-ontrack-foreground",
  at_risk: "bg-status-risk-foreground",
  blocked: "bg-status-blocked-foreground",
  idle: "bg-status-idle-foreground",
  no_signal: "bg-muted-foreground/40",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status] ?? "bg-muted-foreground")}
      />
      <span className="text-[12px]">{humanize(status)}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(status)}
    </span>
  );
}

/**
 * Pace, shown as a fact rather than a mood.
 *
 * The `reason` is on the element as both `title` and `aria-label`, so the state
 * survives a screen reader, a greyscale print and anyone who cannot separate
 * the hues. The colour is reinforcement; the words are the message.
 *
 * `quiet` renders the on-pace and unknown levels as plain text with no chrome,
 * which is what stops a table of forty rows turning into a traffic jam. Pass it
 * anywhere the pace sits inline next to other text.
 */
export function PaceChip({
  pace,
  label,
  quiet = false,
  className,
}: {
  pace: Pace;
  /** Overrides the level word — e.g. a date, or "Day 9 of 14". */
  label?: ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  const plain = pace.level === "on_pace" || pace.level === "unknown";
  const body = label ?? PACE_LABEL[pace.level];

  if (quiet && plain) {
    return (
      <span className={cn("text-[12px]", PACE_TEXT[pace.level], className)} title={pace.reason}>
        {body}
      </span>
    );
  }

  return (
    <span
      title={pace.reason}
      aria-label={`${PACE_LABEL[pace.level]}. ${pace.reason}`}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        PACE_CHIP[pace.level],
        plain && "px-0",
        className,
      )}
    >
      {/* A filled dot for the two levels that want attention; a ring for the
          rest. Shape carries the same distinction as the colour does. */}
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          pace.level === "late" && "bg-status-blocked-foreground",
          pace.level === "watch" && "bg-status-risk-foreground",
          pace.level === "done" && "bg-status-ontrack-foreground",
          plain && "border border-muted-foreground/50 bg-transparent",
        )}
      />
      {body}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-foreground">
      {stageLabel(stage)}
    </span>
  );
}

export function SeverityChip({ value }: { value: string }) {
  const map: Record<string, string> = {
    critical: "bg-status-blocked text-status-blocked-foreground",
    high: "bg-status-blocked text-status-blocked-foreground",
    medium: "bg-status-risk text-status-risk-foreground",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        map[value?.toLowerCase()] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

/**
 * Attention band: the strongest treatment on a page. The value carries the
 * weight, the label stays a quiet micro-label.
 */
export function AttentionBand({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md bg-muted px-4 py-4", className)}>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function PrimarySignal({
  label,
  value,
  detail,
  emphasis = "high",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** high: the single most important line. medium: strong secondary. */
  emphasis?: "high" | "medium";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-foreground",
          emphasis === "high"
            ? "text-[17px] font-semibold leading-snug tracking-tight"
            : "text-[14px] font-medium leading-snug",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

/**
 * Turns every Panel beneath it into a collapsible section.
 *
 * WHY A CONTEXT RATHER THAN A PROP ON 24 CALL SITES. The point of collapsing is
 * to see the whole set of sections at once and open the two you need — which
 * only works if ALL of them collapse. Opting each one in by hand guarantees
 * that the next section somebody adds is the one that does not, and a row of
 * foldable headers with one immovable panel in the middle looks broken.
 *
 * Scoped, so nothing outside the wrapped subtree changes behaviour.
 */
/**
 * A "collapse everything" / "expand everything" instruction.
 *
 * Versioned rather than a plain boolean so that pressing Collapse all twice
 * still reaches a section somebody re-opened in between: the panels react to a
 * NEW instruction, not to a value that has not changed.
 *
 * The counter is module-level and monotonic so that versions raised by
 * different providers are comparable — which is what lets a nested scope
 * (the account rail) obey an instruction raised by its parent.
 */
type CollapseBulk = { version: number; open: boolean };
let bulkSequence = 0;

/**
 * Which instruction a scope should obey: its own, or the one its parent raised.
 *
 * Newest wins, and versions are globally monotonic so they are comparable
 * across providers. Extracted and exported because it is the one part of this
 * with a rule worth stating — the rest is wiring — and because it decides
 * whether a nested scope (the account rail) obeys a parent's Collapse all.
 */
export function resolveBulk(
  parent: CollapseBulk | null,
  own: CollapseBulk | null,
): CollapseBulk | null {
  if (!parent) return own;
  if (!own) return parent;
  return parent.version > own.version ? parent : own;
}

const CollapseScope = createContext<{
  scope: string;
  defaultOpen: boolean;
  bulk: CollapseBulk | null;
  setBulk: (open: boolean) => void;
} | null>(null);

export function CollapsibleSections({
  scope,
  defaultOpen = true,
  children,
}: {
  /** Namespaces the remembered state, e.g. "customer:overview". */
  scope: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const parent = useContext(CollapseScope);
  const [bulk, setBulkState] = useState<CollapseBulk | null>(null);

  const setBulk = useCallback((open: boolean) => {
    bulkSequence += 1;
    setBulkState({ version: bulkSequence, open });
  }, []);

  // A nested scope obeys its parent's instruction as well as its own, newest
  // wins. Without this, "Collapse all" would fold the tab content and leave
  // the account rail beside it open, which reads as the button half-working.
  // A nested scope obeys its parent's instruction as well as its own, newest
  // wins. Without this, "Collapse all" would fold the tab content and leave
  // the account rail beside it open, which reads as the button half-working.
  const effective = resolveBulk(parent?.bulk ?? null, bulk);

  const value = useMemo(
    () => ({ scope, defaultOpen, bulk: effective, setBulk }),
    [scope, defaultOpen, effective, setBulk],
  );

  return <CollapseScope.Provider value={value}>{children}</CollapseScope.Provider>;
}

/**
 * Fold or unfold every section in the enclosing scope.
 *
 * WHAT THIS REPLACES. The old control rewrote every localStorage key under the
 * scope's prefix and reloaded the page. It could only ever reach panels that
 * had ALREADY been toggled individually — a panel nobody had clicked had no
 * stored key, so there was nothing to rewrite. On a fresh browser that is all
 * of them: the button reloaded the page and everything came back open, which
 * is indistinguishable from a button wired to nothing.
 *
 * Driving the state directly also drops the full page reload, which cost the
 * scroll position and a second of blank screen to change a piece of local UI.
 *
 * Returns a no-op outside a CollapsibleSections, so a stray control cannot
 * throw.
 */
export function useCollapseAll(): (open: boolean) => void {
  const scope = useContext(CollapseScope);
  return scope?.setBulk ?? (() => {});
}

export function Panel({
  title,
  count,
  meta,
  action,
  children,
  className,
  id,
  level = "default",
  collapsible = false,
  defaultOpen = true,
  collapseKey,
}: {
  title: ReactNode;
  count?: number;
  meta?: ReactNode;
  /** Optional header-level control, e.g. an "Add …" write action. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /**
   * Make the whole header a disclosure control.
   *
   * WHY THIS IS OPT-IN. A panel that collapses is only useful where there are
   * several of them competing for one screen — the record tabs. A lone panel
   * that can be folded away is a control that does nothing for anybody.
   */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /**
   * Remembers open/closed per person, per section, across visits. Without it
   * every navigation re-collapses the sections somebody just opened, which is
   * worse than not collapsing at all.
   */
  collapseKey?: string;
  /**
   * Visual weight only — no behaviour change.
   * primary: decision-relevant, strongest heading.
   * supporting: shaded container, quieter heading.
   * reference: no card border at all — a quiet divided section that recedes.
   */
  level?: "primary" | "default" | "supporting" | "reference";
}) {
  const bordered = level !== "reference";
  const scope = useContext(CollapseScope);

  // A `reference` panel has no card and no header band, so there is nothing to
  // click and nothing to fold. It stays as it is inside a collapsible scope.
  const isCollapsible = (collapsible || scope !== null) && bordered;

  // An explicit key wins; otherwise the title supplies it, which is why the
  // title must be a plain string for a panel to remember anything. A panel
  // whose title is markup still collapses — it just forgets between visits,
  // which is better than two panels silently sharing one key.
  const derivedKey =
    collapseKey ?? (scope && typeof title === "string" ? `${scope.scope}:${title}` : undefined);

  const [open, setOpen] = useCollapseState(
    derivedKey,
    scope ? scope.defaultOpen && defaultOpen : defaultOpen,
    isCollapsible,
    scope?.bulk ?? null,
  );

  // Rendered on the header whether or not the panel collapses, so the header's
  // layout does not jump between a collapsible section and a fixed one.
  const HeaderTag = isCollapsible ? "button" : "header";

  return (
    <section
      id={id}
      className={cn(
        // THE CURVATURE IS THE BOUNDARY. A section is an inset card at the xl
        // radius on the tinted page, and it carries no border — a 28px radius
        // and a hairline are two ways of saying "this is a section", and saying
        // it twice is what makes an interface look busy.
        //
        // What replaces the border is not nothing. Three things separate a
        // section from the page now: the surface step (card 1.0 against a 0.945
        // ground), a resting shadow that makes it an object sitting on the page
        // rather than a region of it, and the space between it and its
        // neighbours. The header band below still divides — that is an internal
        // rule inside a section, not the section's own edge, which is why it
        // survives.
        level === "supporting"
          ? "overflow-hidden rounded-xl bg-surface"
          : bordered
            ? "section-card overflow-hidden"
            : "border-t-2 border-border pt-2",
        className,
      )}
    >
      <HeaderTag
        {...(isCollapsible
          ? {
              type: "button" as const,
              onClick: () => setOpen(!open),
              "aria-expanded": open,
              ...(id ? { "aria-controls": `${id}-body` } : {}),
            }
          : {})}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left",
          bordered ? "px-3 py-2" : "px-0 py-1",
          // EVERY bordered panel now gets a filled header band, not just the
          // `primary` ones. A heading that shares its background with the rows
          // beneath it is a label; a heading on its own band is a lid, and a
          // lid is what makes a stack of panels scannable.
          bordered ? "border-b border-border bg-surface" : null,
          level === "supporting" ? "border-b border-border/70" : null,
          level === "primary" ? "py-2.5" : null,
          // The whole band is the hit target, not a 12px chevron. A disclosure
          // you have to aim at is one people stop using.
          isCollapsible ? "cursor-pointer transition-colors hover:bg-muted" : null,
        )}
      >
        <h2
          className={cn(
            "flex items-baseline gap-2",
            level === "primary"
              ? "text-[14px] font-semibold tracking-tight text-foreground"
              : level === "supporting"
                ? "text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/80"
                : level === "reference"
                  ? "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                  : "text-[12px] font-bold uppercase tracking-[0.08em] text-foreground",
          )}
        >
          {title}
          {count != null ? (
            <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-3">
          {meta ? <div className="text-[11px] text-muted-foreground">{meta}</div> : null}
          {/* The action lives inside a <button> header when collapsible, and a
              button inside a button is invalid HTML that browsers silently
              un-nest. Rendering it as a span with its own click handling would
              be a second, worse button; instead the action moves below the
              header, where it is still one click away and still legal. */}
          {action && !isCollapsible ? action : null}
          {isCollapsible ? (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                open ? null : "-rotate-90",
              )}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </HeaderTag>
      {open ? (
        <div {...(id ? { id: `${id}-body` } : {})}>
          {action && isCollapsible ? (
            <div className="flex justify-end border-b border-border px-3 py-1.5">{action}</div>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Open/closed for one collapsible section, remembered per browser.
 *
 * Reads on mount rather than during render: the server has no localStorage, so
 * initialising from it directly would make the first client render disagree
 * with the HTML that arrived and React would throw away the whole subtree.
 * Every section therefore renders at its default first and settles a frame
 * later, which is invisible and correct.
 *
 * Every access is wrapped, because storage throws outright in a few real
 * situations — Safari private browsing, a browser set to block site data — and
 * a section that cannot remember its state must still open and close.
 */
function useCollapseState(
  key: string | undefined,
  defaultOpen: boolean,
  enabled: boolean,
  bulk: { version: number; open: boolean } | null,
): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState(defaultOpen);

  useEffect(() => {
    if (!enabled || !key) return;
    try {
      const stored = window.localStorage.getItem(`panel:${key}`);
      if (stored === "0" || stored === "1") setOpenState(stored === "1");
    } catch {
      /* storage unavailable — the default stands */
    }
  }, [key, enabled]);

  // A Collapse all / Expand all instruction. Tracked by version so the same
  // panel obeys a repeated press, and persisted so the result survives the
  // next visit exactly as an individual toggle would — a bulk action that
  // forgets itself on reload is a different kind of not-working.
  const lastBulk = useRef(0);
  useEffect(() => {
    if (!enabled || !bulk || bulk.version === lastBulk.current) return;
    lastBulk.current = bulk.version;
    setOpenState(bulk.open);
    if (!key) return;
    try {
      window.localStorage.setItem(`panel:${key}`, bulk.open ? "1" : "0");
    } catch {
      /* the fold still happens; it just will not be remembered */
    }
  }, [bulk, enabled, key]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!key) return;
      try {
        window.localStorage.setItem(`panel:${key}`, next ? "1" : "0");
      } catch {
        /* the section still opens; it just will not be remembered */
      }
    },
    [key],
  );

  return [open, setOpen];
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px]">{value ?? "—"}</dd>
    </div>
  );
}

export function NoRows({ label = "No records" }: { label?: string }) {
  return <p className="px-3 py-4 text-[12px] text-muted-foreground">{label}</p>;
}

/**
 * A table that can be reached at any window width.
 *
 * THE BUG THIS FIXES. Below roughly 900px the app had no layout: a dozen
 * tables sat either in an `overflow-hidden` card or in no container at all, so
 * the columns past the fold were not merely cramped — they were CLIPPED, with
 * no scrollbar and no indication that anything had been cut. A person on a
 * laptop with a narrow window read a table that looked complete and was not.
 *
 * `min-w` rather than a mobile card layout, deliberately. These are dense
 * comparison tables — a queue, a user list, a routing matrix — and their value
 * is that the rows line up. Restacking each row into a card at 800px would
 * keep every value on screen and destroy the only reason the table exists. A
 * sideways scroll is the honest trade: nothing is hidden, and the comparison
 * survives.
 */
export function TableScroll({
  children,
  minWidth = 720,
  className,
}: {
  children: ReactNode;
  /** Below this, the table scrolls sideways instead of crushing its columns. */
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
