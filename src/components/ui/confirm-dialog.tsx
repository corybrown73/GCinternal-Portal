import { useCallback, useState } from "react";

import { AskDialog, type AskOptions } from "@/components/ui/ask";

/**
 * The hook form of ask(): for a component that wants the dialog inside its
 * own tree (a notice that owns its "Move it anyway" question). Returns the
 * asking function and the element to render once.
 */
export type ConfirmOptions = AskOptions;

export function useConfirm() {
  const [pending, setPending] = useState<{
    opts: AskOptions;
    resolve: (v: boolean | string | null) => void;
  } | null>(null);
  const confirm = useCallback(
    (opts: AskOptions) =>
      new Promise<boolean | string | null>((resolve) => setPending({ opts, resolve })),
    [],
  );
  const dialog = pending ? (
    <AskDialog
      key={pending.opts.title}
      opts={pending.opts}
      onDone={(v) => {
        pending.resolve(v);
        setPending(null);
      }}
    />
  ) : null;
  return { confirm, dialog };
}
