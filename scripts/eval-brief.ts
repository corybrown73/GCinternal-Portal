/**
 * A live check of the brief prompt on Sutton Farms, the deal Teya flagged:
 * a seats-only contract, a Google Sheets payroll export only talked about on
 * a call, a bin tally form, and a QR code on every bin and field.
 *
 * WHY THIS EXISTS. The unit tests (brief-scope.test.ts) run the code rules
 * on a brief written by hand; they cannot tell whether the MODEL, under the
 * purchase rule, still writes the form it should and leaves out what was
 * only discussed. This runs the real three passes on the fixture and checks:
 *
 *   - no Google Sheets in kickoff.integrations or welcome.focus_items;
 *   - the bin tally still in kickoff.scope and onboarding.forms (a form the
 *     calls name is core scope, even on a seats-only contract);
 *   - a QR code item in requirements.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/eval-brief.ts
 *
 * Without ANTHROPIC_API_KEY it says so and exits 0, so it never fails a
 * build. It never touches a database: the Supabase variables are cleared in
 * this process, so the usage record each call tries to write is dropped.
 */
for (const k of [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
]) {
  delete process.env[k];
}

async function main(): Promise<number> {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.log("eval-brief: ANTHROPIC_API_KEY is not set; skipped.");
    return 0;
  }

  const fixture = await import("../src/lib/__tests__/fixtures/sutton-farms-brief");
  const { prepareDocument } = await import("../src/lib/server/ai/documents");
  const { purchaseRecordOf, sharedPrefix } = await import("../src/lib/server/ai/sources");
  const { readIntake } = await import("../src/lib/intake-answers");
  const { BRIEF_SYSTEM_PROMPT } = await import("../src/lib/server/brief/prompt");
  const { runBriefPipeline } = await import("../src/lib/server/brief/pipeline");

  const account = {
    id: "00000000-0000-4000-8000-000000000000",
    name: "Sutton Farms",
    domain: null,
    arr: null,
    products: [],
    stage: "negotiate",
    summary: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  } as any;
  const reports = fixture.SUTTON_CALLS.map((c, i) => ({
    id: `r${i + 1}`,
    account_id: account.id,
    report_type: "call_notes",
    title: c.title,
    content_md: c.content_md,
    uploaded_by: null,
    created_at: `2026-10-0${i + 2}T00:00:00Z`,
  })) as any;
  const contract = await prepareDocument(
    new TextEncoder().encode(fixture.SUTTON_CONTRACT_TEXT),
    "Sutton Farms order form.txt",
    "text/plain",
    { title: "the signed contract" },
  );
  const sources = {
    account,
    intake: readIntake({}),
    reports,
    notes: [],
    sow: null,
    contract,
    team: { am: null, se: null },
    callsText: fixture.SUTTON_CALLS_TEXT,
    sourceHash: "eval-sutton-farms",
  };
  // The kept reading of the contract: seats, nothing to connect.
  const sowReading = { readable: true, seats: 25, ...fixture.SUTTON_CONTRACT_READING } as any;

  const { brief } = await runBriefPipeline({
    dealId: account.id,
    sources,
    sowReading,
    purchaseRecord: purchaseRecordOf(sources),
    prefix: sharedPrefix(sources, { sowReading }),
    system: BRIEF_SYSTEM_PROMPT,
    effort: "high",
    jobId: null,
  });

  const failures: string[] = [];
  const sheets = /google\s*sheets|\bsheets\b/i;
  const bin = /bin\s*tally/i;
  for (const line of brief.kickoff.integrations)
    if (sheets.test(line)) failures.push(`kickoff.integrations lists "${line}"`);
  for (const f of brief.welcome?.focus_items ?? [])
    if (sheets.test(f.text)) failures.push(`welcome.focus_items lists "${f.text}"`);
  if (!brief.kickoff.scope.some((r) => bin.test(r.workflow)))
    failures.push(
      `kickoff.scope has no bin tally: ${JSON.stringify(brief.kickoff.scope.map((r) => r.workflow))}`,
    );
  if (!(brief.onboarding?.forms ?? []).some((f) => bin.test(f.name)))
    failures.push(
      `onboarding.forms has no bin tally: ${JSON.stringify((brief.onboarding?.forms ?? []).map((f) => f.name))}`,
    );
  if (!(brief.requirements ?? []).some((r) => /\bqr\b/i.test(`${r.text} ${r.quote ?? ""}`)))
    failures.push(
      `requirements has no QR item: ${JSON.stringify((brief.requirements ?? []).map((r) => r.text))}`,
    );

  console.log(
    JSON.stringify(
      {
        integrations: brief.kickoff.integrations,
        scope: brief.kickoff.scope.map((r) => r.workflow),
        forms: (brief.onboarding?.forms ?? []).map((f) => f.name),
        focus_items: (brief.welcome?.focus_items ?? []).map((f) => f.text),
        requirements: (brief.requirements ?? []).map((r) => r.text),
        discussed_not_purchased: (brief.discussed_not_purchased ?? []).map((d) => d.item),
      },
      null,
      2,
    ),
  );
  if (failures.length) {
    console.error(`eval-brief: ${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    return 1;
  }
  console.log("eval-brief: all checks passed.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("eval-brief: the run failed", e);
    process.exit(1);
  },
);
