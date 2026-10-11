import { useEffect, useRef, useState } from "react";

import { canonicalIndustry, INDUSTRIES, isListedIndustry } from "@/lib/intake-answers";
import { cn } from "@/lib/utils";

const TYPE_IT = "__type_it__";

/**
 * The industry list, plus "Other — type it": a customer is whatever they
 * are, and the list is only what the form library is filed under. A typed
 * value is saved as typed (on blur or Enter), and shows as itself when the
 * field is opened again.
 */
export function IndustrySelect({
  id,
  value,
  onChange,
  className,
  disabled,
  emptyLabel = "—",
  live = false,
}: {
  id?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  /** Report every keystroke (a form's draft), not only on blur (a saved field). */
  live?: boolean;
}) {
  const typedValue = value && !isListedIndustry(value) ? value : null;
  const [typing, setTyping] = useState(Boolean(typedValue));
  const [text, setText] = useState(typedValue ?? "");
  // What this field reported itself, keystroke by keystroke (live): that
  // value coming back is not a change from outside, so typing "HVAC" does
  // not close the box under the cursor.
  const sent = useRef<string | null | undefined>(undefined);
  // The record changed under the field (a save, the AI): follow it.
  useEffect(() => {
    if (sent.current !== undefined && value === sent.current) return;
    sent.current = undefined;
    if (value && !isListedIndustry(value)) {
      setTyping(true);
      setText((t) => (t.trim() === value ? t : value));
    } else if (value) {
      setTyping(false);
    }
  }, [value]);

  // On blur or Enter. A listed industry typed in any case snaps to the list;
  // nothing typed leaves the saved value alone (clearing is the empty option).
  const commit = () => {
    const next = canonicalIndustry(text);
    if (next === null) {
      if (value && !isListedIndustry(value)) setText(value);
      else setTyping(false);
      return;
    }
    if (isListedIndustry(next)) {
      setTyping(false);
      setText("");
    } else if (next !== text) {
      setText(next);
    }
    if (next !== (value ?? null)) onChange(next);
  };

  return (
    <span className="block space-y-1">
      <select
        id={id}
        className={className}
        value={typing ? TYPE_IT : (value ?? "")}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === TYPE_IT) {
            setTyping(true);
            return;
          }
          setTyping(false);
          setText("");
          onChange(e.target.value || null);
        }}
      >
        <option value="">{emptyLabel}</option>
        {/* "Other" is the type-it option below; a value already saved as
            "Other" still shows as itself. */}
        {INDUSTRIES.filter((i) => i !== "Other" || value === "Other").map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
        <option value={TYPE_IT}>Other — type it…</option>
      </select>
      {typing ? (
        <input
          aria-label="Industry, as the customer says it"
          className={cn(className)}
          value={text}
          maxLength={80}
          disabled={disabled}
          placeholder="Landscaping, Elevator service…"
          autoFocus={!typedValue}
          onChange={(e) => {
            setText(e.target.value);
            if (live) {
              sent.current = e.target.value.trim() || null;
              onChange(sent.current);
            }
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      ) : null}
    </span>
  );
}
