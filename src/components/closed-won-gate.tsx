import { Link } from "@tanstack/react-router";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { WON_GATE_LABEL, type WonGateMissing } from "@/lib/won-gate";

/**
 * What the Closed Won gate found missing, as buttons.
 *
 * Names each missing piece and opens it — on the deal page the task itself,
 * from the board the deal. A manager gets "Move it anyway", asked in the
 * app's own dialog and recorded on the move.
 */
export function ClosedWonGateNotice({
  missing,
  dealId,
  onOpen,
  canForce,
  onForce,
  forcing,
}: {
  missing: readonly WonGateMissing[];
  dealId: string;
  /** On the deal page: open the checklist task for that piece. */
  onOpen?: (key: "notes" | "sow") => void;
  canForce: boolean;
  onForce?: () => void;
  forcing?: boolean;
}) {
  const { confirm, dialog } = useConfirm();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200"
    >
      <span>
        <b>Not ready for Closed Won</b> — the deal has no{" "}
        {missing.map((m) => WON_GATE_LABEL[m]).join(" and no ")}.
      </span>
      {missing.map((m) =>
        onOpen ? (
          <button
            key={m}
            type="button"
            className="inline-flex h-7 items-center rounded-sm bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => onOpen(m)}
          >
            {m === "notes" ? "Add the Gong brief" : "Add the SOW"}
          </button>
        ) : (
          <Link
            key={m}
            to="/deals/$dealId"
            params={{ dealId }}
            className="inline-flex h-7 items-center rounded-sm bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {m === "notes" ? "Add the Gong brief" : "Add the SOW"}
          </Link>
        ),
      )}
      {canForce && onForce ? (
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-sm border border-amber-700/40 px-2.5 text-[12px] hover:bg-amber-500/10 disabled:opacity-50"
          disabled={forcing}
          onClick={async () => {
            const ok = await confirm({
              title: "Move it to Closed Won anyway?",
              body: "Closed Won starts the clock, tells the team to claim it and builds the customer's plan from what is here. The move is recorded as made despite the check.",
              confirmLabel: "Move it anyway",
            });
            if (ok) onForce();
          }}
        >
          {forcing ? "Moving…" : "Move it anyway"}
        </button>
      ) : null}
      {dialog}
    </div>
  );
}
