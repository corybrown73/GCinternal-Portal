import {
  kindFromWords,
  normalizeServiceKey,
  normalizeServices,
  type ServiceKind,
  type ServiceSpec,
} from "./onboarding-services";
import type {
  ImplementationFocusItem,
  ImplementationFocusSource,
  IntakeAnswers,
} from "./intake-answers";

/**
 * Proposed, deterministic, concrete implementation focus — never a feature
 * wishlist. SOW = commercial anchor, Intake = process truth, Gong/Sales
 * context = supporting evidence only. See proposeImplementationFocus for
 * the merge/flag rules this module implements.
 */

function formFocusText(name: string): string {
  return `Build and configure the "${name}" workflow for the field team to complete on site.`;
}

function serviceFocusText(s: Pick<ServiceSpec, "kind" | "name">): string {
  switch (s.kind) {
    case "integration":
      return `Connect approved submission data to ${s.name}.`;
    case "custom_pdf":
      return `Produce the required customer-facing PDF output: ${s.name}.`;
    case "paid_form":
      return formFocusText(s.name);
    case "analytics":
      return `Build the ${s.name} analytics output for the team to monitor.`;
    case "data_load":
      return `Load ${s.name} into the account before go-live.`;
    case "training":
      return "Prepare the field team to run the workflow on real jobs.";
    case "other":
    default:
      return s.name;
  }
}

type Draft = {
  text: string;
  sources: ImplementationFocusSource[];
  reviewFlag: "gong_only" | "conflict" | null;
  /** normalizeServiceKey's key — how a later source finds this same item rather than duplicating it. */
  key: string;
};

/**
 * A short candidate list of concrete workflow/solution areas, built only
 * from existing structured truth — never generated from raw call prose,
 * never an LLM step. Returns null when implementation_focus.validated_at
 * is already set: once Focus is agreed, a proposal refresh must not touch
 * it, so the caller does nothing rather than silently replacing agreed
 * truth (see the PR's product rules).
 *
 * SOURCE PRIORITY:
 *   A. SOW — intake.timeline.services (normalizeServices), the commercial
 *      anchor. This already includes "What was bought" from the Sales
 *      handoff (saveHandoffAnswer folds `handoff.answers.bought` into
 *      these same services the moment it's saved) and the legacy single-
 *      integration knobs, so reading it once here is reading the whole
 *      purchased scope, not just the SOW document.
 *   B. Intake — the forms named on the intake (wanted_forms): Phase 1's
 *      own form(s), process truth independent of what was purchased.
 *   C. Gong/Sales context — `handoff.answers.system_requirements`. The
 *      handoff does not record whether an answer came from a call or from
 *      Sales typing it, and this PR does not need it to: either way, a
 *      system named only here is not a sale. It is proposed with
 *      review_flag "gong_only" UNLESS it matches an existing SOW item
 *      (merged in as another source, no flag) or the SOW already bought a
 *      DIFFERENT item of the same kind (review_flag "conflict" — a real
 *      structured disagreement, not a guess from wording).
 *   D. Multiple sources on what is deterministically the same item
 *      (normalizeServiceKey match) are merged onto one item rather than
 *      duplicated. Where a match is not safe to make, items are kept
 *      separate rather than guessed together.
 */
export function proposeImplementationFocus(
  intake: Pick<
    IntakeAnswers,
    "wanted_forms" | "timeline" | "handoff" | "ai_sources" | "implementation_focus"
  >,
): ImplementationFocusItem[] | null {
  if (intake.implementation_focus.validated_at) return null;

  const drafts: Draft[] = [];
  const findByKey = (key: string) => drafts.find((d) => d.key === key);

  // A. SOW / purchased services.
  const services = normalizeServices(intake.timeline.services as ServiceSpec[], intake.timeline);
  for (const s of services) {
    drafts.push({
      text: serviceFocusText(s),
      sources: [{ type: "sow", label: s.name, quote: null }],
      reviewFlag: null,
      key: normalizeServiceKey(s.name, s.kind),
    });
  }

  // B. Intake — named forms. Matched against the SOW's own key space only
  // as a defensive merge (a core form and a paid add-on form are normally
  // different things; this just stops an accidental exact-name collision
  // from producing two items for one form).
  for (const f of intake.wanted_forms) {
    const key = normalizeServiceKey(f.name, "paid_form");
    const quote = intake.ai_sources["wanted_forms"]?.quote ?? null;
    const existing = findByKey(key);
    if (existing) {
      existing.sources.push({ type: "intake", label: f.name, quote });
      continue;
    }
    drafts.push({
      text: formFocusText(f.name),
      sources: [{ type: "intake", label: f.name, quote }],
      reviewFlag: null,
      key,
    });
  }

  // C. Gong / Sales context — systems named on the handoff that are not
  // (yet) a purchased service.
  const sysAnswer = intake.handoff.answers["system_requirements"];
  const sysValue = typeof sysAnswer?.value === "string" ? sysAnswer.value : null;
  if (sysValue) {
    const lines = sysValue
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const kind: ServiceKind = kindFromWords(line);
      const key = normalizeServiceKey(line, kind);
      const source: ImplementationFocusSource = {
        type: "gong",
        label: "Systems and requirements (handoff)",
        quote: line.slice(0, 400),
      };
      const existing = findByKey(key);
      if (existing) {
        // D. The same structured fact from a second source: merge, don't duplicate.
        existing.sources.push(source);
        continue;
      }
      // E. A conflict needs structured evidence: the SOW already bought a
      // DIFFERENT item of this same kind, not merely the absence of one.
      const conflicts = services.some((s) => s.kind === kind);
      drafts.push({
        text: serviceFocusText({ kind, name: line }),
        sources: [source],
        reviewFlag: conflicts ? "conflict" : "gong_only",
        key,
      });
    }
  }

  return drafts.map((d, i) => ({
    id: `focus-${i + 1}`,
    text: d.text,
    status: "proposed" as const,
    sources: d.sources,
    review_flag: d.reviewFlag,
  }));
}

/** Lower case, letters and digits only, one space between words: the key two wordings of one item share. */
function normalizedText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The brief's own focus items, behind the deterministic anchors. The AI
 * reading writes the list only while it is still a proposal's — nothing
 * saved, or every id the proposal's own ("focus-…", the AI's included) and
 * no person has claimed the list — so a list a person edited by hand is
 * never touched: an added item ("manual-…"), but also a reworded or a
 * trimmed one, which keep the proposal's ids and are known only by the
 * save that put "implementation_focus" in `person_set`. An agreed list is
 * never touched either, and a refresh of the proposal keeps working as it
 * did. SOW and intake anchors come first, the brief's items after, each
 * once by its wording; an item the calls alone support keeps the Gong-only
 * flag the handoff's systems get, so it never reads as agreed by accident.
 * Null when there is nothing to write.
 */
export function focusItemsFromBrief(
  intake: Parameters<typeof proposeImplementationFocus>[0] & Pick<IntakeAnswers, "person_set">,
  briefItems: ReadonlyArray<{
    text: string;
    source_type: "sow" | "gong" | "intake";
    source_label: string;
    quote: string;
  }>,
): ImplementationFocusItem[] | null {
  const focus = intake.implementation_focus;
  if (focus.validated_at) return null;
  if (intake.person_set.includes("implementation_focus")) return null;
  if (focus.items.length && !focus.items.every((i) => i.id.startsWith("focus-"))) return null;
  if (!briefItems.length) return null;
  const anchors = proposeImplementationFocus(intake) ?? [];
  const seen = new Set(anchors.map((a) => normalizedText(a.text)));
  const ai: ImplementationFocusItem[] = [];
  for (const item of briefItems.slice(0, 8)) {
    const text = item.text.trim().slice(0, 500);
    const key = normalizedText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ai.push({
      id: `focus-ai-${ai.length + 1}`,
      text,
      status: "proposed",
      sources: [
        {
          type: item.source_type,
          label: item.source_label.trim().slice(0, 200) || null,
          quote: item.quote.trim().slice(0, 400) || null,
        },
      ],
      review_flag: item.source_type === "gong" ? "gong_only" : null,
    });
  }
  // A brief that only repeats the anchors adds nothing: the list is left
  // for "Refresh proposal", and the record does not say it was filled.
  if (!ai.length) return null;
  return [...anchors, ...ai].slice(0, 60);
}

/**
 * What "Confirm implementation focus" does to the record: every item
 * currently on the list is promoted to agreed, and validation is stamped
 * as its own explicit fact — never inferred from Kickoff, a transcript or
 * a stage move. Clearing review_flag on promotion is deliberate: once a
 * person has reviewed the item with the customer and agreed it, a
 * "Gong only" or "Conflicts with the SOW" warning no longer describes
 * anything — it would read as still-unconfirmed when it is not.
 *
 * Pure. confirmImplementationFocus (server-side) is this plus the read,
 * the save, and the non-blocking journal note.
 */
export function agreeImplementationFocus(
  items: readonly ImplementationFocusItem[],
  validatedAt: string,
  validatedBy: string,
): { items: ImplementationFocusItem[]; validated_at: string; validated_by: string } {
  return {
    items: items.map((item) => ({ ...item, status: "agreed" as const, review_flag: null })),
    validated_at: validatedAt,
    validated_by: validatedBy,
  };
}
