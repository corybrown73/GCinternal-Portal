import { useEffect, useState } from "react";

import { INDUSTRIES, isListedIndustry } from "@/lib/intake-answers";
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
  // The record changed under the field (a save, the AI): follow it.
  useEffect(() => {
    if (value && !isListedIndustry(value)) {
      setTyping(true);
      setText((t) => (t.trim() === value ? t : value));
    } else if (value) {
      setTyping(false);
    }
  }, [value]);

  const commit = () => {
    const t = text.trim();
    if ((t || null) !== (value ?? null)) onChange(t || null);
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
        {INDUSTRIES.map((i) => (
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
            if (live) onChange(e.target.value.trim() || null);
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
