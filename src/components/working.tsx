import { useEffect, useState } from "react";

/**
 * A long operation's label with the seconds ticking beside it.
 *
 * "Generating… about a minute" held still for eighty seconds, which is how a
 * button gets pressed twice. A count that moves says the request is alive;
 * past the estimate it says so rather than pretending.
 */
export function Working({ label, estimateSeconds }: { label: string; estimateSeconds?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);
  const over = estimateSeconds != null && elapsed > estimateSeconds;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent"
      />
      {label}
      <span className="font-mono tabular-nums opacity-80">{elapsed}s</span>
      {over ? <span className="opacity-80">· still working</span> : null}
    </span>
  );
}
