import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * A shared weekly snapshot: what we told this customer in that week, frozen.
 *
 * Same neutral failure as the plan door — expired, revoked and never-existed
 * are one message. The page renders the frozen `content` and never re-queries
 * anything, so a snapshot cannot drift into showing something the plan page
 * would not have shown.
 *
 * The PDF of the same document is served by /api/plan-snapshot/$token (a
 * server route, because a page route cannot also return application/pdf).
 */
const readSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().trim().min(8).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { snapshotForToken } = await import("@/lib/snapshots.server");
    const result = await snapshotForToken(data.token);
    // The token is not echoed back; the page addresses the PDF by the same URL
    // segment it was already given.
    return result;
  });

export const Route = createFileRoute("/plan/s/$snapshotToken")({
  head: () => ({
    meta: [
      { title: "Your weekly update — GoCanvas" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  loader: async ({ params }) => readSnapshot({ data: { token: params.snapshotToken } }),
  component: SnapshotPage,
});

function SnapshotPage() {
  const { snapshotToken } = Route.useParams();
  const result = Route.useLoaderData();

  if (result.state !== "snapshot") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-md border border-border bg-card p-6">
          <h1 className="text-[15px] font-semibold">This update isn&apos;t available</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The link may have expired or been replaced. Ask your GoCanvas contact for the latest.
          </p>
        </div>
      </div>
    );
  }

  const snap = result.content;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {snap.plan.customer_name} · week of {snap.week_start}
        </p>
        <h1 className="mt-0.5 text-[20px] font-semibold tracking-tight">
          {snap.plan.implementation_name}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Currently in <span className="font-medium text-foreground">{snap.plan.stage_label}</span>
        </p>
        <a
          className="mt-2 inline-block text-[12px] underline underline-offset-2"
          href={`/api/plan-snapshot/${snapshotToken}`}
        >
          Download as PDF
        </a>
      </header>

      {snap.attention.length ? (
        <Section title="Worth a look">
          {snap.attention.map((a, i) => (
            <li key={i} className="px-4 py-2 text-[13px]">
              {a}
            </li>
          ))}
        </Section>
      ) : null}

      <Section title="With you">
        {snap.you_owe.length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-muted-foreground">
            Nothing outstanding on your side.
          </li>
        ) : (
          snap.you_owe.map((t) => (
            <li key={t.ref} className="px-4 py-2.5 text-[13px]">
              {t.title}
              {t.due_date ? (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  due {t.due_date}
                </span>
              ) : null}
            </li>
          ))
        )}
      </Section>

      <Section title="With GoCanvas">
        {snap.we_owe.length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-muted-foreground">
            Nothing outstanding on our side.
          </li>
        ) : (
          snap.we_owe.map((c, i) => (
            <li key={i} className="px-4 py-2.5 text-[13px]">
              {c.description}
              {c.due_date ? (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  due {c.due_date}
                </span>
              ) : null}
            </li>
          ))
        )}
      </Section>

      {snap.next_milestone ? (
        <p className="text-center text-[13px]">
          Next milestone: <span className="font-medium">{snap.next_milestone.name}</span>
          {snap.next_milestone.target_date ? (
            <span className="ml-1 font-mono text-[12px] text-muted-foreground">
              {snap.next_milestone.target_date}
            </span>
          ) : null}
        </p>
      ) : null}

      {snap.contact ? (
        <p className="text-center text-[12px] text-muted-foreground">
          Questions? {snap.contact.name}
          {snap.contact.email ? ` · ${snap.contact.email}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
      </header>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}
