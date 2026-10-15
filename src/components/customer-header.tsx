import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { AddServicesChoice } from "@/components/add-services-choice";
import { CustomerLogo } from "@/components/customer-logo";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { EditCustomerDialog } from "@/components/edit-customer-dialog";
import { StatusChip } from "@/components/record";
import {
  completedLabel,
  headerStage,
  partnerChipLabel,
  projectLabel,
  projectsNewestFirst,
  showKickoffDeckLink,
  type HeaderStage,
} from "@/lib/customer-header";
import { deriveHealth } from "@/lib/customer360-derive";
import { dealStageLabel } from "@/lib/deal-stage";
import type { Customer360, ImplementationSummary } from "@/lib/hub-types";
import { getPartnerProgress } from "@/lib/hub.functions";
import { isPartnerJourney } from "@/lib/partner-implementation";
import { cn } from "@/lib/utils";

/**
 * The persistent Customer 360 header: who the customer is, which implementation
 * is open, one stage and one health indicator, the Kickoff deck link where it
 * applies, the account actions, and the tabs. It reads only what the page
 * already loads, and it changes no data.
 */

export type HeaderTabId = "overview" | "implementation" | "resources" | "details";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function CustomerHeader({
  record,
  customerId,
  tab,
  tabs,
  selectedImplId,
}: {
  record: Customer360;
  customerId: string;
  tab: HeaderTabId;
  tabs: ReadonlyArray<{ id: HeaderTabId; label: string }>;
  selectedImplId: string | undefined;
}) {
  const { customer, implementation: impl } = record;
  const partner = impl ? isPartnerJourney(impl) : false;
  // The same read and key Current Implementation uses: one fetch, shared.
  const partnerQ = useQuery({
    queryKey: ["partner-progress", impl?.id],
    queryFn: () => getPartnerProgress({ data: { implementationId: impl?.id ?? "" } }),
    enabled: Boolean(impl) && partner,
  });
  if (!impl) return null;

  const stage = headerStage(impl, {
    progress: partnerQ.data ?? null,
    loading: partner && partnerQ.isPending,
    failed: partner && partnerQ.isError,
  });
  const health = deriveHealth(record, impl);
  const projects = projectsNewestFirst(record.implementations);
  const singleLabel = projectLabel(impl.name, customer.name);
  const completed = completedLabel(impl);
  const partnerLabel = partnerChipLabel(impl);
  const kickoff = showKickoffDeckLink(impl) && impl.deal_id ? impl.deal_id : null;

  return (
    <header className="border-b border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-2.5 sm:px-6">
        <div className="order-1 flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            to="/customers"
            search={{ sort: "days", dir: "desc" }}
            className={cn(
              "text-[12px] text-muted-foreground hover:text-foreground hover:underline",
              FOCUS_RING,
            )}
          >
            ← Customers
          </Link>
          <CustomerLogo
            customerId={customer.id}
            customerName={customer.name}
            logoUrl={customer.logo_url}
          />
          <h1 className="min-w-0 text-[20px] font-semibold leading-tight tracking-tight">
            {customer.name}
          </h1>
          {customer.industry ? (
            <span className="text-[12px] text-muted-foreground">{customer.industry}</span>
          ) : null}
        </div>
        <div className="order-3 grid w-full min-w-0 grid-cols-2 gap-2 max-sm:[&_button]:min-h-11 max-sm:[&>:last-child]:col-span-2 sm:order-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <AddServicesChoice
            customerId={customer.id}
            dealId={impl.deal_id}
            implementationId={impl.id}
          />
          <EditCustomerDialog
            customer={customer}
            implementationId={impl.id}
            ownerId={impl.owner_id}
            team={record.team}
          />
          <DeleteCustomerButton
            customerId={customer.id}
            customerName={customer.name}
            implementations={record.implementations.length}
          />
        </div>

        <div className="order-2 w-full sm:order-3">
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-1">
            {projects.length > 1 ? (
              <ProjectSwitcher
                projects={projects}
                selectedId={impl.id}
                customerId={customerId}
                customerName={customer.name}
                tab={tab}
              />
            ) : (
              <span className="min-w-0 truncate text-[14px] font-semibold" title={singleLabel}>
                {singleLabel}
              </span>
            )}
            <StagePill stage={stage} />
            <StatusChip status={health.level} />
            {completed ? <Pill muted>{completed}</Pill> : null}
            {partnerLabel ? <Pill muted>{partnerLabel}</Pill> : null}
            {kickoff ? (
              <Link
                to="/onboarding-plan/$dealId"
                params={{ dealId: kickoff }}
                title="The kickoff deck and the presenter workspace for this implementation"
                className={cn(
                  "sm:ml-auto inline-flex min-h-11 items-center rounded-full border border-primary/40 bg-card px-2.5 text-[12px] font-medium text-primary hover:text-foreground sm:min-h-8",
                  FOCUS_RING,
                )}
              >
                Kickoff deck
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        aria-label="Customer sections"
        className="mt-2 grid grid-cols-2 border-t border-border px-4 sm:flex sm:px-6"
      >
        {tabs.map((t) => {
          const on = t.id === tab;
          return (
            <Link
              key={t.id}
              to="/customers/$customerId"
              params={{ customerId }}
              search={{ tab: t.id, ...(selectedImplId ? { impl: selectedImplId } : {}) }}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center justify-center border-b-2 px-3 py-2 text-center text-[12px] font-medium transition-colors sm:min-h-0 sm:justify-start sm:py-2",
                on
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function Pill({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium",
        muted ? "bg-muted text-muted-foreground" : "bg-[#e3eefc] text-[#1c5cab]",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The one stage indicator. A loading or unavailable partner stage is announced
 * politely, so the state is not silent.
 */
function StagePill({ stage }: { stage: HeaderStage }) {
  const text =
    stage.state === "ready" && stage.position
      ? `${stage.label} · Stage ${stage.position.index} of ${stage.position.total}`
      : stage.label;
  return (
    <span
      role={stage.state === "ready" ? undefined : "status"}
      aria-live={stage.state === "ready" ? undefined : "polite"}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium",
        stage.state === "ready" ? "bg-[#e3eefc] text-[#1c5cab]" : "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}

/**
 * The implementation switcher. A button that shows the selected project, and a
 * list of the customer's projects that opens over the page without moving it.
 *
 * Keyboard: Enter or Space opens it; ArrowDown or ArrowUp open it and move
 * focus into the list; inside the list ArrowUp and ArrowDown move between
 * projects, Home and End go to the ends, Enter follows a link, Escape closes it
 * and returns focus to the button. Tab, or a click outside, closes it. Choosing
 * a project navigates to it with the same `impl` parameter the tabs keep.
 */
function ProjectSwitcher({
  projects,
  selectedId,
  customerId,
  customerName,
  tab,
}: {
  projects: ImplementationSummary[];
  selectedId: string;
  customerId: string;
  customerName: string;
  tab: HeaderTabId;
}) {
  const [open, setOpen] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    projects.findIndex((p) => p.id === selectedId),
  );
  const selected = projects[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open && focusOnOpen !== null) {
      itemRefs.current[focusOnOpen]?.focus();
      setFocusOnOpen(null);
    }
  }, [open, focusOnOpen]);

  const count = projects.length;
  const moveFrom = (from: number, delta: number) => {
    itemRefs.current[(from + delta + count) % count]?.focus();
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (open) itemRefs.current[selectedIndex]?.focus();
      else {
        setFocusOnOpen(selectedIndex);
        setOpen(true);
      }
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const i = itemRefs.current.findIndex((el) => el !== null && el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFrom(i, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFrom(i < 0 ? 0 : i, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[count - 1]?.focus();
    }
  };

  const onWrapKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  const onWrapBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 max-w-full"
      onKeyDown={onWrapKey}
      onBlur={onWrapBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className={cn(
          "inline-flex min-h-11 w-full max-w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-left text-[13px] font-semibold sm:w-auto sm:min-h-8 sm:py-0",
          FOCUS_RING,
        )}
      >
        <span
          className="min-w-0 break-words sm:truncate"
          title={projectLabel(selected?.name, customerName)}
        >
          {projectLabel(selected?.name, customerName)}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listId}
          aria-label="Projects for this customer"
          onKeyDown={onListKey}
          className="absolute left-0 top-full z-30 mt-1.5 w-max min-w-full max-w-[min(100vw-2rem,28rem)] rounded-lg border border-border bg-card p-1.5 sm:min-w-[20rem]"
          style={{ boxShadow: "0 8px 20px rgb(0 0 0 / 0.14)" }}
        >
          {projects.map((p, i) => {
            const on = p.id === selectedId;
            return (
              <li key={p.id}>
                <Link
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  to="/customers/$customerId"
                  params={{ customerId }}
                  search={{ tab, impl: p.id }}
                  aria-current={on ? "true" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-4 rounded-md px-2.5 py-2 text-[13px] sm:min-h-8",
                    on ? "bg-muted font-semibold" : "hover:bg-muted/60",
                    FOCUS_RING,
                  )}
                >
                  <span className="min-w-0 truncate">{projectLabel(p.name, customerName)}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {dealStageLabel(p.deal_stage)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
