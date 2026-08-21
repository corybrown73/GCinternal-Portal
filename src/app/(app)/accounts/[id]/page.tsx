import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  Brief,
  GongReport,
  OnboardingNote,
  Profile,
  StageTransition,
  TamRequest,
} from "@/lib/types";
import { STAGE_LABELS } from "@/lib/stages";
import type { BriefJson } from "@/lib/schemas";
import { StageBadge } from "@/components/StageBadge";
import { MarkdownView } from "@/components/MarkdownView";
import { StageControl } from "@/components/account/StageControl";
import { GongReportForm } from "@/components/account/GongReportForm";
import { GenerateBriefButton } from "@/components/account/GenerateBriefButton";
import {
  addNoteAction,
  deleteGongReportAction,
  setNoteReviewAction,
  updateAccountAction,
} from "../../actions";

export const dynamic = "force-dynamic";

const TABS = ["overview", "gong", "briefs", "tam", "notes", "history"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  gong: "Gong reports",
  briefs: "Briefs",
  tam: "TAM",
  notes: "Notes",
  history: "History",
};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("portal_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle<Account>();
  if (!account) notFound();

  const [
    { data: profiles },
    { data: transitions },
    { data: reports },
    { data: briefs },
    { data: tamRequests },
    { data: notes },
  ] = await Promise.all([
    supabase.from("portal_profiles").select("*").returns<Profile[]>(),
    supabase
      .from("portal_stage_transitions")
      .select("*")
      .eq("account_id", id)
      .order("occurred_at", { ascending: false })
      .returns<StageTransition[]>(),
    supabase
      .from("portal_gong_reports")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .returns<GongReport[]>(),
    supabase
      .from("portal_briefs")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .returns<Brief[]>(),
    supabase
      .from("portal_tam_requests")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .returns<TamRequest[]>(),
    supabase
      .from("portal_onboarding_notes")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .returns<OnboardingNote[]>(),
  ]);

  const profileName = (pid: string | null) => {
    if (!pid) return null;
    const p = (profiles ?? []).find((x) => x.id === pid);
    return p?.full_name || p?.email || null;
  };

  const needsReview = (notes ?? []).filter((n) => n.review_status === "needs_review").length;
  const accountMap = (reports ?? []).find((r) => r.report_type === "account_map");
  const callNotes = (reports ?? []).filter((r) => r.report_type === "call_notes");
  const latestBrief = (briefs ?? []).find((b) => b.status === "complete");

  const tabBadges: Partial<Record<Tab, number>> = {
    gong: (reports ?? []).length,
    briefs: (briefs ?? []).length,
    tam: (tamRequests ?? []).filter((t) => t.status === "pending").length,
    notes: needsReview,
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <StageBadge stage={account.stage} />
      </div>
      <p className="mb-4 text-sm text-slate-500">
        {account.domain && <span className="mr-3">{account.domain}</span>}
        {account.salesforce_id && (
          <span className="mr-3 font-mono text-xs">SF {account.salesforce_id}</span>
        )}
        {account.arr != null && <span>${Number(account.arr).toLocaleString()} ARR</span>}
      </p>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <StageControl accountId={account.id} currentStage={account.stage} />
      </div>

      <nav className="mb-5 flex gap-1 border-b border-slate-200 text-sm dark:border-slate-700">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/accounts/${account.id}?tab=${t}`}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 font-medium ${
              tab === t
                ? "border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {TAB_LABELS[t]}
            {tabBadges[t] ? (
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">
                {tabBadges[t]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            action={updateAccountAction.bind(null, account.id)}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-sm font-semibold">Details</h2>
            <div>
              <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-500">
                Name
              </label>
              <input id="name" name="name" defaultValue={account.name} required className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="domain" className="mb-1 block text-xs font-medium text-slate-500">
                  Domain
                </label>
                <input id="domain" name="domain" defaultValue={account.domain ?? ""} className={inputCls} />
              </div>
              <div>
                <label htmlFor="arr" className="mb-1 block text-xs font-medium text-slate-500">
                  ARR ($)
                </label>
                <input id="arr" name="arr" type="number" min="0" defaultValue={account.arr ?? ""} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="salesforce_id" className="mb-1 block text-xs font-medium text-slate-500">
                Salesforce ID
              </label>
              <input
                id="salesforce_id"
                name="salesforce_id"
                defaultValue={account.salesforce_id ?? ""}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="summary" className="mb-1 block text-xs font-medium text-slate-500">
                Summary
              </label>
              <textarea id="summary" name="summary" rows={4} defaultValue={account.summary ?? ""} className={inputCls} />
            </div>
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Save details
            </button>
          </form>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold">At a glance</h2>
              <dl className="grid grid-cols-2 gap-y-2">
                <dt className="text-slate-500">In current stage since</dt>
                <dd>{new Date(account.stage_entered_at).toLocaleDateString()}</dd>
                <dt className="text-slate-500">AM owner</dt>
                <dd>{profileName(account.am_owner_id) ?? "—"}</dd>
                <dt className="text-slate-500">SE owner</dt>
                <dd>{profileName(account.se_owner_id) ?? "—"}</dd>
                <dt className="text-slate-500">Gong reports</dt>
                <dd>{(reports ?? []).length}</dd>
                <dt className="text-slate-500">Notes awaiting review</dt>
                <dd>{needsReview}</dd>
              </dl>
            </div>
            {latestBrief && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-900/20">
                <h2 className="mb-1 font-semibold">Latest account brief</h2>
                <p className="mb-2 text-slate-600 dark:text-slate-300">
                  Generated {new Date(latestBrief.created_at).toLocaleString()} (
                  {latestBrief.generator === "llm" ? "AI-synthesized" : "template"})
                </p>
                <a
                  href={`/api/internal/briefs/${latestBrief.id}/download`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Download .pptx
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "gong" && (
        <div className="space-y-5">
          <GongReportForm accountId={account.id} />
          {accountMap && (
            <div className="rounded-lg border-2 border-emerald-300 bg-white p-4 dark:border-emerald-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  📌 Account map — {accountMap.title}
                </h3>
                <span className="text-xs text-slate-400">
                  {new Date(accountMap.created_at).toLocaleDateString()}
                </span>
              </div>
              <MarkdownView>{accountMap.content_md}</MarkdownView>
            </div>
          )}
          {callNotes.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>
                    {profileName(r.uploaded_by) ?? "API"} · {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <form action={deleteGongReportAction.bind(null, account.id, r.id)}>
                    <button type="submit" className="text-red-500 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <MarkdownView>{r.content_md}</MarkdownView>
            </div>
          ))}
          {(reports ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No Gong reports yet — paste your Gong agent&apos;s output above.
            </p>
          )}
        </div>
      )}

      {tab === "briefs" && (
        <div className="space-y-5">
          <GenerateBriefButton accountId={account.id} hasReports={(reports ?? []).length > 0} />
          {(briefs ?? []).map((b) => {
            const json = b.structured_json as BriefJson | null;
            return (
              <div
                key={b.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.status === "complete"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : b.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                      }`}
                    >
                      {b.status}
                    </span>
                    <span className="text-slate-500">
                      {new Date(b.created_at).toLocaleString()}
                      {b.generator && ` · ${b.generator === "llm" ? "AI-synthesized" : "template"}`}
                    </span>
                  </div>
                  {b.status === "complete" && b.pptx_storage_path && (
                    <a
                      href={`/api/internal/briefs/${b.id}/download`}
                      className="rounded-md border border-emerald-600 px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                    >
                      Download .pptx
                    </a>
                  )}
                </div>
                {b.error && <p className="text-sm text-red-600">{b.error}</p>}
                {json && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      Discovery questions &amp; process gaps ({json.discovery_questions.length})
                    </summary>
                    <div className="mt-3 space-y-3 text-sm">
                      {json.discovery_questions.map((q, i) => (
                        <div key={i} className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                          <div className="font-medium">{q.question}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 dark:bg-slate-700">
                              {q.category}
                            </span>
                            {q.why_it_matters}
                          </div>
                        </div>
                      ))}
                      {json.process_gaps.length > 0 && (
                        <div>
                          <h4 className="mb-1 font-semibold">Process gaps</h4>
                          <ul className="ml-4 list-disc space-y-1">
                            {json.process_gaps.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
          {(briefs ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No briefs yet — generate one from the Gong reports.
            </p>
          )}
        </div>
      )}

      {tab === "tam" && (
        <div className="space-y-4">
          <Link
            href={`/tam-requests/new?account=${account.id}`}
            className="inline-block rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Request a TAM for this account
          </Link>
          {(tamRequests ?? []).map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    t.status === "approved"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                      : t.status === "declined"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                  }`}
                >
                  {t.status}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(t.created_at).toLocaleString()} · urgency {t.urgency}
                </span>
              </div>
              <p className="mb-1">{t.justification}</p>
              <p className="text-xs text-slate-500">
                Requested by {t.requester_email}
                {t.decided_at &&
                  ` · decided ${new Date(t.decided_at).toLocaleString()} via ${t.decided_via}`}
                {t.decision_note && ` — "${t.decision_note}"`}
              </p>
            </div>
          ))}
          {(tamRequests ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No TAM requests for this account.</p>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <form
            action={addNoteAction.bind(null, account.id)}
            className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <label htmlFor="note-body" className="block text-sm font-semibold">
              Add an onboarding note
            </label>
            <textarea
              id="note-body"
              name="body_md"
              rows={4}
              required
              placeholder="What happened, decisions made, open items… (markdown supported)"
              className={`${inputCls} font-mono text-xs`}
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Add note
            </button>
          </form>
          {(notes ?? []).map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border bg-white p-4 dark:bg-slate-900 ${
                n.review_status === "needs_review"
                  ? "border-amber-300 dark:border-amber-700"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {profileName(n.author_id) ?? "Unknown"} · {new Date(n.created_at).toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  {n.review_status === "needs_review" ? (
                    <>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        needs review
                      </span>
                      <form action={setNoteReviewAction.bind(null, account.id, n.id, true)}>
                        <button type="submit" className="text-emerald-700 hover:underline dark:text-emerald-400">
                          Mark reviewed
                        </button>
                      </form>
                    </>
                  ) : (
                    <span title={n.reviewed_at ? new Date(n.reviewed_at).toLocaleString() : ""}>
                      ✓ reviewed{n.reviewed_by ? ` by ${profileName(n.reviewed_by)}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <MarkdownView>{n.body_md}</MarkdownView>
            </div>
          ))}
          {(notes ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No onboarding notes yet.</p>
          )}
        </div>
      )}

      {tab === "history" && (
        <ol className="space-y-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {(transitions ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800"
            >
              <span className="mt-1 h-2 w-2 flex-none rounded-full bg-emerald-600" />
              <div>
                <div>
                  {t.from_stage ? (
                    <>
                      <b>{STAGE_LABELS[t.from_stage]}</b> → <b>{STAGE_LABELS[t.to_stage]}</b>
                    </>
                  ) : (
                    <>
                      Created in <b>{STAGE_LABELS[t.to_stage]}</b>
                    </>
                  )}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500 dark:bg-slate-800">
                    {t.source}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(t.occurred_at).toLocaleString()}
                  {t.actor_profile_id && ` · ${profileName(t.actor_profile_id)}`}
                  {t.note && ` — "${t.note}"`}
                </div>
              </div>
            </li>
          ))}
          {(transitions ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No history yet.</p>
          )}
        </ol>
      )}
    </div>
  );
}
