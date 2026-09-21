import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isSuperAdmin, useProfile } from "@/lib/auth";
import { deleteCustomerFn } from "@/lib/customer-delete.functions";

/**
 * Delete a customer. Super admins only, and the name is typed to confirm:
 * this removes every implementation on the account and, by default, the
 * deals that made them. The rows are archived first (portal_deleted_archive)
 * so a wrong click is a restore, not a loss — but nobody should find that out.
 */
export function DeleteCustomerButton({
  customerId,
  customerName,
  implementations,
}: {
  customerId: string;
  customerName: string;
  implementations: number;
}) {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const remove = useServerFn(deleteCustomerFn);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteDeals, setDeleteDeals] = useState(true);
  const m = useMutation({
    mutationFn: () => remove({ data: { customerId, confirmName: typed.trim(), deleteDeals } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      void qc.invalidateQueries({ queryKey: ["customer360"] });
      setOpen(false);
      void navigate({ to: "/customers", search: { sort: "days", dir: "desc" } });
    },
  });
  if (!isSuperAdmin(profile?.role)) return null;
  const matches = typed.trim().toLowerCase() === customerName.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/50 hover:text-destructive"
        title="Super admin: remove this customer, its implementations and its deals"
      >
        <Trash2 className="h-3 w-3" /> Delete customer
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Delete {customerName}?</DialogTitle>
            <DialogDescription className="text-[12px]">
              This removes the customer, {implementations} implementation
              {implementations === 1 ? "" : "s"} and everything on them — stages, plans, contacts,
              work items. The rows are archived first, but nobody on the team will see them again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={deleteDeals}
                onChange={(e) => setDeleteDeals(e.target.checked)}
              />
              <span>
                Also delete the deals linked to this customer. Unticked, they stay on the pipeline
                with no customer.
              </span>
            </label>
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              Type the customer&apos;s name to confirm
              <input
                className="h-7 w-full rounded-sm border border-input bg-background px-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={customerName}
                autoFocus
              />
            </label>
            {m.isError ? (
              <p className="text-[11px] text-destructive">{(m.error as Error).message}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted"
                onClick={() => setOpen(false)}
                disabled={m.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                disabled={!matches || m.isPending}
                onClick={() => m.mutate()}
              >
                <Trash2 className="h-3 w-3" />
                {m.isPending ? "Deleting…" : "Delete for good"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
