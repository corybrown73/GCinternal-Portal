import {
  OWNER_CHANGE_REASONS,
  OWNER_CHANGE_REASON_LABEL,
  type OwnerChangeReasonCode,
  type OwnerReasonDraft,
} from "@/lib/owner-change";

const FIELD =
  "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring";

/**
 * Asks why an owner is changing. Shown beside the owner picker, so a change cannot
 * be sent without the reason the record needs.
 */
export function OwnerChangeReasonFields({
  value,
  onChange,
  disabled,
}: {
  value: OwnerReasonDraft;
  onChange: (next: OwnerReasonDraft) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Why is the owner changing?</span>
      <select
        aria-label="Why the owner is changing"
        value={value.reasonCode}
        disabled={disabled}
        onChange={(e) =>
          onChange({
            reasonCode: e.target.value as OwnerChangeReasonCode | "",
            reason: value.reason,
          })
        }
        className={FIELD}
      >
        <option value="">Choose a reason…</option>
        {OWNER_CHANGE_REASONS.map((code) => (
          <option key={code} value={code}>
            {OWNER_CHANGE_REASON_LABEL[code]}
          </option>
        ))}
      </select>
      {value.reasonCode === "other" ? (
        <input
          aria-label="Explain the reason"
          value={value.reason}
          disabled={disabled}
          maxLength={500}
          placeholder="A few words"
          onChange={(e) => onChange({ reasonCode: value.reasonCode, reason: e.target.value })}
          className={`${FIELD} min-w-[12rem] flex-1`}
        />
      ) : null}
    </div>
  );
}
