/**
 * The Kickoff presentation, held back. A saved slide configuration did not load
 * (a database error, or stored data that does not read). The presenter sees why,
 * and can try again; no slides, standard or otherwise, are shown in its place,
 * and presentation mode cannot be entered until the configuration loads.
 */
export function KickoffDeckBlocked({
  message,
  onRetry,
}: {
  message: string;
  onRetry: (() => void) | undefined;
}) {
  return (
    <section role="alert" className="mx-auto max-w-xl px-6 py-10 text-[14px]">
      <h2 className="text-[16px] font-semibold">The kickoff slides could not be loaded</h2>
      <p className="mt-2">{message}</p>
      <p className="mt-2 text-muted-foreground">
        The presentation is blocked until the saved slides load. The standard slides are not shown
        in their place, so the room cannot see a deck other than the one that was saved.
      </p>
      <button
        type="button"
        className="mt-4 rounded-sm border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        onClick={onRetry}
        disabled={!onRetry}
      >
        Try again
      </button>
    </section>
  );
}
