/**
 * "Show test accounts" (0085). Off by default: QA rehearsals and Field
 * Fusion dry runs stay out of the list and its counts until somebody asks
 * for them. The state lives in the URL (?tests=1), so a link keeps it.
 */
export function ShowTestsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
      <input
        type="checkbox"
        className="h-3.5 w-3.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Show test accounts
    </label>
  );
}
