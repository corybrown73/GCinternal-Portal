import { useEffect, useState } from "react";

import { fmtDateTime } from "@/lib/hub-format";

/**
 * An instant, in the reader's own zone.
 *
 * Pages here are server-rendered and the server cannot know the reader's
 * zone, so every timestamp used to print in UTC and say so — correct, and
 * four hours off from what the person looking at it would call the time.
 * This renders UTC on the server and on the first client paint (so the
 * hydration matches), then re-renders once in the browser's zone with the
 * zone named. A date-only value has no time of day and is left as the day.
 */
export function When({
  value,
  fallback = "—",
  className,
}: {
  value: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const zone = useReaderZone();
  if (!value) return <>{fallback}</>;
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {fmtDateTime(value, zone)}
    </time>
  );
}

let knownZone: string | null = null;

/** The browser's zone once mounted; null (meaning UTC) before that. */
export function useReaderZone(): string | null {
  const [zone, setZone] = useState<string | null>(knownZone);
  useEffect(() => {
    if (knownZone) {
      setZone(knownZone);
      return;
    }
    try {
      knownZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      knownZone = null;
    }
    setZone(knownZone);
  }, []);
  return zone;
}
