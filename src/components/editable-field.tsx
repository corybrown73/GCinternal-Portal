import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A fact that can be corrected where it is read.
 *
 * WHY THIS EXISTS. Every fact on a record page rendered through `Field`, which
 * is read-only, so ARR, the AM owner and the SE owner could only be changed by
 * whoever originally created the deal — or not at all. The reported symptom was
 * "I cannot edit the top section", and the second half of the same report is
 * the reason it matters: an account that starts at 5k and grows to 8k is the
 * fact the whole pipeline exists to notice.
 *
 * The affordance is deliberate rather than decorative. A value that is quietly
 * clickable is a value nobody clicks: the pencil is what says "this is yours to
 * change", and it is always in the layout — reserved space, revealed on hover
 * and focus — so a row never reflows when the pointer crosses it.
 *
 * Keyboard is a first-class path, not a fallback. Enter saves, Escape cancels,
 * and the input takes focus on open, so a correction is type-Enter rather than
 * click-click-click.
 */

export type EditableFieldOption = { value: string; label: string };

export function EditableField({
  label,
  value,
  display,
  onSave,
  type = "text",
  options,
  placeholder,
  format,
  disabled,
  className,
}: {
  label: string;
  /** The raw value the editor starts from. Null renders as an em dash. */
  value: string | null;
  /** What to show when not editing. Defaults to the formatted raw value. */
  display?: ReactNode;
  onSave: (next: string | null) => Promise<unknown>;
  type?: "text" | "number" | "date" | "select";
  options?: readonly EditableFieldOption[];
  placeholder?: string;
  /** Presentation only — never applied to what is sent. */
  format?: (v: string | null) => ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // A save elsewhere (or a refetch) must not be overwritten by a stale draft.
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function open() {
    if (disabled) return;
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    setDraft(value ?? "");
  }

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    // Saving an unchanged value would write a feed row saying nothing changed.
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      // The editor stays open holding what was typed. Closing it on failure
      // loses the correction and tells the user it worked.
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const shown = format ? format(value) : (display ?? value ?? "—");

  if (!editing) {
    return (
      <div className={cn("group/ef min-w-0", className)}>
        <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px]">{shown}</span>
          {disabled ? null : (
            <button
              type="button"
              onClick={open}
              aria-label={`Edit ${label}`}
              title={`Edit ${label}`}
              className={cn(
                // Always in the layout, revealed on hover or keyboard focus:
                // the row must not reflow as the pointer crosses it.
                "shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition",
                "group-hover/ef:opacity-100 focus:opacity-100 focus-visible:opacity-100",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1">
        {type === "select" ? (
          <select
            ref={(el) => {
              inputRef.current = el;
            }}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter") void commit();
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">—</option>
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            type={type}
            value={draft}
            disabled={saving}
            placeholder={placeholder ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter") void commit();
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          aria-label={`Save ${label}`}
          title="Save (Enter)"
          className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          aria-label={`Cancel editing ${label}`}
          title="Cancel (Esc)"
          className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </dd>
      {error ? <p className="mt-0.5 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
