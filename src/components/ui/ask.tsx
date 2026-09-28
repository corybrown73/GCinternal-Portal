import { createRoot } from "react-dom/client";
import { useEffect, useState, type ReactNode } from "react";

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
 * confirm() and prompt(), in the app's own dialog, callable from anywhere.
 *
 * A browser dialog freezes the page, cannot be styled and reads as a
 * fault. This renders the same Radix dialog the rest of the app uses into
 * its own root and resolves when the person answers — true/false for a
 * question, the typed text (or null) when `prompt` is set — so a delete
 * button inside a list needs no hook plumbing to ask first.
 */
export type AskOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  prompt?: { label: string; placeholder?: string; required?: boolean; initial?: string };
};

export function ask(opts: AskOptions): Promise<boolean | string | null> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean | string | null) => {
      resolve(v);
      // After the close animation, not before: unmounting mid-animation
      // leaves the overlay's inert state on the page.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 200);
    };
    root.render(<AskDialog opts={opts} onDone={done} />);
  });
}

/** The question, once. Used by ask() and by the useConfirm hook. */
export function AskDialog({
  opts,
  onDone,
}: {
  opts: AskOptions;
  onDone: (v: boolean | string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(opts.prompt?.initial ?? "");
  const [answered, setAnswered] = useState(false);
  const finish = (v: boolean | string | null) => {
    if (answered) return;
    setAnswered(true);
    setOpen(false);
    onDone(v);
  };
  useEffect(() => {
    // Closed by the overlay or Escape without an answer: that is "no".
    if (!open && !answered) finish(opts.prompt ? null : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const canConfirm = !opts.prompt?.required || text.trim() !== "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md !bg-card">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{opts.title}</DialogTitle>
          {opts.body ? (
            <DialogDescription className="whitespace-pre-line text-[13px] text-muted-foreground">
              {opts.body}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {opts.prompt ? (
          <label className="block text-[12px] text-muted-foreground">
            {opts.prompt.label}
            <input
              autoFocus
              className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-[13px] text-foreground"
              value={text}
              placeholder={opts.prompt.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) finish(text.trim());
              }}
            />
          </label>
        ) : null}
        <DialogFooter className="gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted"
            onClick={() => finish(opts.prompt ? null : false)}
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            autoFocus={!opts.prompt}
            className={cn(
              "inline-flex h-8 items-center rounded-sm px-3 text-[12px] font-medium disabled:opacity-50",
              opts.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            disabled={!canConfirm}
            onClick={() => finish(opts.prompt ? text.trim() : true)}
          >
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
