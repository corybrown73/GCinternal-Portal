import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, KeyRound, Link2, RotateCw, ShieldOff } from "lucide-react";

import { NoRows, Panel } from "@/components/record";
import { SharedPlanView } from "@/components/shared-plan-view";
import {
  generatePlanSnapshot,
  getPlanPreview,
  getPlanSnapshots,
  getSharePanel,
  issuePlanLink,
  revokePlanLink,
  revokePlanSnapshotShare,
  rotatePlanLink,
  setPlanLinkPasscode,
  sharePlanSnapshot,
} from "@/lib/external-share.functions";
import { fmtDate, fmtDateTime, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * Issue, revoke, rotate and watch the customer-facing links for one
 * implementation — plus a preview of exactly what the customer sees.
 *
 * Two things this panel is careful about:
 *  - a freshly minted link is shown ONCE and never stored, so the row can only
 *    ever tell you its prefix; and
 *  - "opened" here is the recorded beacon from a rendered page, not a GET, so
 *    an email scanner following the link does not show up as engagement.
 */
export function ExternalSharePanel({ implementationId }: { implementationId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"links" | "preview" | "updates">("links");
  const [issued, setIssued] = useState<{ url: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [canComplete, setCanComplete] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  const panel = useQuery({
    queryKey: ["external-share", implementationId],
    queryFn: () => getSharePanel({ data: { implementationId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["external-share", implementationId] });

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  // The server refuses before it reads any of 0019-0022's schema, so this is
  // also what renders on a deploy whose migrations have not been applied yet.
  if (panel.data && !panel.data.enabled) {
    return (
      <Panel title="Customer plan links">
        <NoRows label="Sharing the plan with customers is not switched on yet." />
      </Panel>
    );
  }

  return (
    <Panel
      title="Customer plan links"
      meta="Signed links, revocable · the customer never sees an internal field"
      action={
        <div className="flex gap-1">
          {(["links", "preview", "updates"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-sm border px-2 py-0.5 text-[11px]",
                tab === t ? "border-foreground" : "border-border text-muted-foreground",
              )}
            >
              {t === "links" ? "Links" : t === "preview" ? "Preview" : "Weekly updates"}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <p role="alert" className="px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      {tab === "links" ? (
        <div>
          {issued ? (
            <div className="m-3 rounded-md border border-border bg-surface p-3">
              <p className="text-[12px] font-medium">
                Copy this link now — it is not stored and cannot be shown again.
              </p>
              <div className="mt-1.5 flex gap-2">
                <input
                  readOnly
                  value={issued.url}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(issued.url)}
                  className="rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  <Copy className="mr-1 inline h-3 w-3 align-[-2px]" />
                  Copy
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Expires {fmtDate(issued.expires_at)}.
              </p>
            </div>
          ) : null}

          <form
            className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void guard(async () => {
                const result = await issuePlanLink({
                  data: {
                    implementationId,
                    contactId: contactId || null,
                    email: contactId ? null : email || null,
                    name: name || null,
                    canComplete,
                    passcode: passcode || null,
                    sendEmailToContact: true,
                  },
                });
                setIssued({ url: result.url, expires_at: result.expires_at });
                setEmail("");
                setName("");
                setPasscode("");
                setContactId("");
                await refresh();
              });
            }}
          >
            <label className="text-[11px] text-muted-foreground">
              Contact
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="mt-0.5 block rounded-md border border-border bg-background px-2 py-1 text-[12px]"
              >
                <option value="">New person…</option>
                {(panel.data?.contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {contactId ? null : (
              <>
                <label className="text-[11px] text-muted-foreground">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-0.5 block rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-0.5 block rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                  />
                </label>
              </>
            )}
            <label className="text-[11px] text-muted-foreground">
              Passcode (optional)
              <input
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="delivered separately"
                className="mt-0.5 block rounded-md border border-border bg-background px-2 py-1 text-[12px]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={canComplete}
                onChange={(e) => setCanComplete(e.target.checked)}
              />
              Can complete tasks
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-[12px] disabled:opacity-40"
            >
              <Link2 className="mr-1 inline h-3 w-3 align-[-2px]" />
              Issue link
            </button>
          </form>

          {panel.data && panel.data.grants.length === 0 ? (
            <NoRows label="No links issued yet." />
          ) : null}

          <ul className="divide-y divide-border">
            {(panel.data?.grants ?? []).map((g) => (
              <li key={g.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[13px]">{g.contact_name ?? g.email}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {g.token_prefix}…
                    </span>
                    {g.has_passcode ? (
                      <span className="ml-2 rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
                        passcode
                      </span>
                    ) : null}
                    {g.created_via === "reassign" ? (
                      <span className="ml-2 rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
                        reassigned
                      </span>
                    ) : null}
                    {!g.can_complete ? (
                      <span className="ml-2 rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
                        read-only
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {g.live ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void guard(async () => {
                              const result = await rotatePlanLink({ data: { grantId: g.id } });
                              setIssued({ url: result.url, expires_at: result.expires_at });
                              await refresh();
                            })
                          }
                          className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]"
                        >
                          <RotateCw className="mr-1 inline h-3 w-3 align-[-2px]" />
                          Rotate
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void guard(async () => {
                              const next = window.prompt(
                                "New passcode (leave blank to clear it):",
                                "",
                              );
                              if (next === null) return;
                              await setPlanLinkPasscode({
                                data: { grantId: g.id, passcode: next.trim() || null },
                              });
                              await refresh();
                            })
                          }
                          className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]"
                        >
                          <KeyRound className="mr-1 inline h-3 w-3 align-[-2px]" />
                          Passcode
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void guard(async () => {
                              await revokePlanLink({ data: { grantId: g.id } });
                              await refresh();
                            })
                          }
                          className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]"
                        >
                          <ShieldOff className="mr-1 inline h-3 w-3 align-[-2px]" />
                          Revoke
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {g.revoked_at
                          ? `revoked${g.revoke_reason ? ` · ${humanize(g.revoke_reason)}` : ""}`
                          : "expired"}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  expires {fmtDate(g.expires_at)} · opened {g.open_count}×
                  {g.last_opened_at ? ` · last ${fmtDateTime(g.last_opened_at)}` : ""}
                  {g.created_by_name ? ` · issued by ${g.created_by_name}` : ""}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-t border-border px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Recent activity
            </p>
            {(panel.data?.events ?? []).length === 0 ? (
              <p className="mt-1 text-[12px] text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {(panel.data?.events ?? []).slice(0, 12).map((e) => (
                  <li key={e.id} className="font-mono text-[11px] text-muted-foreground">
                    {fmtDateTime(e.at)} · {humanize(e.event)}
                    {e.who ? ` · ${e.who}` : ""}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === "preview" ? <PreviewTab implementationId={implementationId} /> : null}
      {tab === "updates" ? (
        <UpdatesTab implementationId={implementationId} busy={busy} guard={guard} />
      ) : null}
    </Panel>
  );
}

/**
 * Staff see the customer's view without any exception to the auth model: the
 * AuthGate still bounces internal users off /portal/*, and this renders the
 * same component from the same projection with a read-only viewer.
 */
function PreviewTab({ implementationId }: { implementationId: string }) {
  const preview = useQuery({
    queryKey: ["external-preview", implementationId],
    queryFn: () => getPlanPreview({ data: { implementationId } }),
  });

  if (preview.isError) {
    return <NoRows label="Could not render the preview." />;
  }
  if (!preview.data) return <NoRows label="Loading the customer's view…" />;

  return (
    <div className="bg-surface">
      <SharedPlanView
        plan={preview.data}
        banner={
          <p className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
            <Eye className="mr-1 inline h-3 w-3 align-[-2px]" />
            Preview — this is exactly what the customer sees. Actions are disabled here.
          </p>
        }
      />
    </div>
  );
}

function UpdatesTab({
  implementationId,
  busy,
  guard,
}: {
  implementationId: string;
  busy: boolean;
  guard: (fn: () => Promise<void>) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const snapshots = useQuery({
    queryKey: ["plan-snapshots", implementationId],
    queryFn: () => getPlanSnapshots({ data: { implementationId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plan-snapshots", implementationId] });

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[12px] text-muted-foreground">
          A snapshot is frozen when it is generated. Corrections add a new version; the original is
          never edited.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void guard(async () => {
              await generatePlanSnapshot({ data: { implementationId } });
              await refresh();
            })
          }
          className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] disabled:opacity-40"
        >
          Generate now
        </button>
      </div>

      {shareUrl ? (
        <p className="border-b border-border px-3 py-2 font-mono text-[11px]">{shareUrl}</p>
      ) : null}

      {(snapshots.data ?? []).length === 0 ? <NoRows label="No weekly updates yet." /> : null}
      <ul className="divide-y divide-border">
        {(snapshots.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px]">
              Week of {s.week_start}
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {fmtDateTime(s.generated_at)}
                {s.generated_by_name ? ` · ${s.generated_by_name}` : " · scheduled"}
                {s.superseded ? " · superseded" : ""}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {s.share_prefix_live ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      await revokePlanSnapshotShare({ data: { snapshotId: s.id } });
                      setShareUrl(null);
                      await refresh();
                    })
                  }
                  className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]"
                >
                  Revoke share
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      const result = await sharePlanSnapshot({ data: { snapshotId: s.id } });
                      setShareUrl(result.url);
                      await refresh();
                    })
                  }
                  className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]"
                >
                  Share
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
