import { partnerOptions, type PartnerKey } from "@/lib/partner-implementation";
import { cn } from "@/lib/utils";

/**
 * Which registered partner leads a Partner Implementation. The options come from
 * the partner registry, so a partner added there appears here with no change to
 * this control. Used by the new-deal dialog and the deal's type picker.
 */
export function PartnerChoice({
  id,
  value,
  disabled,
  onChange,
  className,
}: {
  id: string;
  value: PartnerKey | null;
  disabled?: boolean;
  onChange: (key: PartnerKey) => void;
  className?: string;
}) {
  const options = partnerOptions();
  return (
    <label className="block space-y-1" htmlFor={id}>
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        Partner
      </span>
      <select
        id={id}
        name="partner"
        className={cn(
          "h-8 w-full rounded-sm border border-border bg-background px-2 text-[13px]",
          className,
        )}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PartnerKey)}
      >
        <option value="">Choose the partner…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
