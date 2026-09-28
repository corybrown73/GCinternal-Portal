import { useCallback, useRef, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The app's own confirm and prompt.
 *
 * A browser's confirm() freezes the page, cannot be styled and reads as a
 * fault; this is the same question asked in the app's words. `useConfirm`
 * returns a function that resolves to true/false (or the typed text for a
 * prompt, null when cancelled) and the element to render once.
 */
export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Ask for a line of text too; the promise resolves to it. */
  prompt?: { label: string; placeholder?: string; required?: boolean };
};

type Pending = ConfirmOptions & { resolve: (v: boolean | string | null) => void };

export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const settled = useRef(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    settled.current = false;
    setText("");
    return new Promise<boolean | string | null>((resolve) => setPending({ ...opts, resolve }));
  }, []);

  const finish = (v: boolean | string | null) => {
    if (settled.current) return;
    settled.current = true;
    pending?.resolve(v);
    setPending(null);
  };

  const dialog = pending ? (
    <Dialog open onOpenChange={(open) => !open && finish(pending.prompt ? null : false)}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{pending.title}</DialogTitle>
          {pending.body ? (
            <DialogDescription className="text-[13px] text-muted-foreground">
              {pending.body}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {pending.prompt ? (
          <label className="block text-[12px] text-muted-foreground">
            {pending.prompt.label}
            <input
              autoFocus
              className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-[13px] text-foreground"
              value={text}
              placeholder={pending.prompt.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (!pending.prompt?.required || text.trim()))
                  finish(text.trim());
              }}
            />
          </label>
        ) : null}
        <DialogFooter className="gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
            onClick={() => finish(pending.prompt ? null : false)}
          >
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            autoFocus={!pending.prompt}
            className={cn(
              "inline-flex h-8 items-center rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
              pending.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            disabled={Boolean(pending.prompt?.required) && !text.trim()}
            onClick={() => finish(pending.prompt ? text.trim() : true)}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, dialog };
}
