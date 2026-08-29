import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import {
  addApproval,
  addCommitment,
  addDecision,
  addEscalation,
  addEvidence,
  addIssue,
  addRequirement,
  addRisk,
  setApproval,
  setCommitment,
  setDecision,
  setEscalation,
  setEvidence,
  setIssue,
  setRequirement,
  setRisk,
} from "@/lib/hub.functions";
import { APPROVAL_STATUSES, EVIDENCE_TYPES } from "@/lib/evidence-input";
import {
  COMMITMENT_AUDIENCES,
  COMMITMENT_STATUSES,
  DECISION_STATUSES,
  ESCALATION_SEVERITIES,
  ESCALATION_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_SCOPE_STATUSES,
  REQUIREMENT_STATUSES,
  RISK_LIKELIHOODS,
  RISK_SEVERITIES,
  RISK_STATUSES,
} from "@/lib/delivery-input";

import { humanize } from "@/lib/hub-format";

/* ---------------- shared shell (same deferred Save/Cancel pattern) ---------------- */

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

export type TeamOption = { id: string; name: string; role: string };
export type LinkOption = { id: string; title: string };

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());
const dateOnly = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

function useInvalidate(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{children}</div>;
}

function Text({
  label,
  value,
  onChange,
  disabled,
  span,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  span?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block space-y-0.5 ${span ?? ""}`}>
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "Optional"}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-0.5 md:col-span-4">
      <span className={labelClass}>{label}</span>
      <textarea
        className={areaClass}
        aria-label={label}
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="Optional"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={labelClass}>{label}</span>
      <input
        type="date"
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Enum({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {humanize(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Person({
  label,
  value,
  team,
  onChange,
  disabled,
  emptyLabel = "Unassigned",
}: {
  label: string;
  value: string;
  team: TeamOption[];
  onChange: (v: string) => void;
  disabled: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.role}
          </option>
        ))}
      </select>
    </label>
  );
}

function LinkField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: LinkOption[];
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Not linked</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Generic shell for the deferred write interaction only — the fields, labels
 * and vocabulary stay specific to each record type (this is not a universal
 * record editor).
 */
function WriteShell<D>({
  mode,
  addLabel,
  empty,
  from,
  canSave,
  submit,
  render,
  customerId,
}: {
  mode: "add" | "edit";
  addLabel: string;
  empty: () => D;
  from?: () => D;
  canSave: (draft: D) => boolean;
  submit: (draft: D) => Promise<unknown>;
  render: (draft: D, set: (patch: Partial<D>) => void, disabled: boolean) => ReactNode;
  customerId: string;
}) {
  const initial = mode === "edit" && from ? from : empty;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<D>(initial);
  const invalidate = useInvalidate(customerId);

  const mutation = useMutation({
    mutationFn: () => submit(draft),
    onSuccess: async () => {
      // Refetch the Customer 360 record so the new/updated row renders immediately.
      await invalidate();
      if (mode === "add") setDraft(empty());
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(initial());
          setOpen(true);
        }}
      >
        {mode === "add" ? <Plus className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
        {mode === "add" ? addLabel : "Edit"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      {render(draft, (patch) => setDraft({ ...draft, ...patch }), mutation.isPending)}
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={!canSave(draft) || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- Requirements ---------------- */

type RequirementDraft = {
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  scopeStatus: string;
  source: string;
  createdBy: string;
};

const emptyRequirement = (): RequirementDraft => ({
  title: "",
  description: "",
  category: "",
  priority: "must_have",
  status: "open",
  scopeStatus: "original",
  source: "",
  createdBy: "",
});

const requirementPayload = (d: RequirementDraft) => ({
  title: d.title.trim(),
  description: nullable(d.description),
  category: nullable(d.category),
  priority: d.priority as any,
  status: d.status as any,
  scopeStatus: d.scopeStatus as any,
  source: nullable(d.source),
  createdBy: nullable(d.createdBy),
});

function RequirementFields(
  draft: RequirementDraft,
  set: (p: Partial<RequirementDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
) {
  return (
    <Grid>
      <Text
        label="Requirement title"
        span="md:col-span-2"
        placeholder="What the customer needs"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Text
        label="Category"
        value={draft.category}
        onChange={(category) => set({ category })}
        disabled={disabled}
      />
      <Text
        label="Source"
        placeholder="SOW, kickoff, workshop…"
        value={draft.source}
        onChange={(source) => set({ source })}
        disabled={disabled}
      />
      <Enum
        label="Priority"
        value={draft.priority}
        options={REQUIREMENT_PRIORITIES}
        onChange={(priority) => set({ priority })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={REQUIREMENT_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Enum
        label="Scope status"
        value={draft.scopeStatus}
        options={REQUIREMENT_SCOPE_STATUSES}
        onChange={(scopeStatus) => set({ scopeStatus })}
        disabled={disabled}
      />
      <Person
        label="Captured by"
        value={draft.createdBy}
        team={team}
        onChange={(createdBy) => set({ createdBy })}
        disabled={disabled}
        emptyLabel="Not recorded"
      />
      <Area
        label="Description"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddRequirement({
  customerId,
  implementationId,
  team,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
}) {
  const save = useServerFn(addRequirement);
  return (
    <WriteShell<RequirementDraft>
      mode="add"
      addLabel="Add requirement"
      customerId={customerId}
      empty={emptyRequirement}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...requirementPayload(d) } })}
      render={(d, set, disabled) => RequirementFields(d, set, disabled, team)}
    />
  );
}

export function EditRequirement({
  customerId,
  requirement,
  team,
}: {
  customerId: string;
  requirement: any;
  team: TeamOption[];
}) {
  const save = useServerFn(setRequirement);
  return (
    <WriteShell<RequirementDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyRequirement}
      from={() => ({
        title: requirement.title ?? "",
        description: requirement.description ?? "",
        category: requirement.category ?? "",
        priority: requirement.priority ?? "must_have",
        status: requirement.status ?? "open",
        scopeStatus: requirement.scope_status ?? "original",
        source: requirement.source ?? "",
        createdBy: requirement.created_by ?? "",
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: requirement.id, ...requirementPayload(d) } })}
      render={(d, set, disabled) => RequirementFields(d, set, disabled, team)}
    />
  );
}

/* ---------------- Risks ---------------- */

type RiskDraft = {
  title: string;
  description: string;
  severity: string;
  likelihood: string;
  status: string;
  ownerId: string;
  impact: string;
  mitigation: string;
  resolvedAt: string;
};

const emptyRisk = (): RiskDraft => ({
  title: "",
  description: "",
  severity: "medium",
  likelihood: "medium",
  status: "open",
  ownerId: "",
  impact: "",
  mitigation: "",
  resolvedAt: "",
});

const riskPayload = (d: RiskDraft) => ({
  title: d.title.trim(),
  description: nullable(d.description),
  severity: d.severity as any,
  likelihood: d.likelihood as any,
  status: d.status as any,
  ownerId: nullable(d.ownerId),
  impact: nullable(d.impact),
  mitigation: nullable(d.mitigation),
  resolvedAt: nullable(d.resolvedAt),
});

function RiskFields(
  draft: RiskDraft,
  set: (p: Partial<RiskDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
) {
  return (
    <Grid>
      <Text
        label="Risk title"
        span="md:col-span-2"
        placeholder="What could go wrong"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Enum
        label="Severity"
        value={draft.severity}
        options={RISK_SEVERITIES}
        onChange={(severity) => set({ severity })}
        disabled={disabled}
      />
      <Enum
        label="Likelihood"
        value={draft.likelihood}
        options={RISK_LIKELIHOODS}
        onChange={(likelihood) => set({ likelihood })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={RISK_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Person
        label="Risk owner"
        value={draft.ownerId}
        team={team}
        onChange={(ownerId) => set({ ownerId })}
        disabled={disabled}
      />
      <DateField
        label="Resolved on"
        value={draft.resolvedAt}
        onChange={(resolvedAt) => set({ resolvedAt })}
        disabled={disabled}
      />
      <Text
        label="Impact if it happens"
        value={draft.impact}
        onChange={(impact) => set({ impact })}
        disabled={disabled}
      />
      <Area
        label="Description"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
      <Area
        label="Mitigation"
        value={draft.mitigation}
        onChange={(mitigation) => set({ mitigation })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddRisk({
  customerId,
  implementationId,
  team,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
}) {
  const save = useServerFn(addRisk);
  return (
    <WriteShell<RiskDraft>
      mode="add"
      addLabel="Add risk"
      customerId={customerId}
      empty={emptyRisk}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...riskPayload(d) } })}
      render={(d, set, disabled) => RiskFields(d, set, disabled, team)}
    />
  );
}

export function EditRisk({
  customerId,
  risk,
  team,
}: {
  customerId: string;
  risk: any;
  team: TeamOption[];
}) {
  const save = useServerFn(setRisk);
  return (
    <WriteShell<RiskDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyRisk}
      from={() => ({
        title: risk.title ?? "",
        description: risk.description ?? "",
        severity: risk.severity ?? "medium",
        likelihood: risk.likelihood ?? "medium",
        status: risk.status ?? "open",
        ownerId: risk.owner_id ?? "",
        impact: risk.impact ?? "",
        mitigation: risk.mitigation ?? "",
        resolvedAt: dateOnly(risk.resolved_at),
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: risk.id, ...riskPayload(d) } })}
      render={(d, set, disabled) => RiskFields(d, set, disabled, team)}
    />
  );
}

/* ---------------- Issues ---------------- */

type IssueDraft = {
  title: string;
  description: string;
  severity: string;
  status: string;
  ownerId: string;
  resolution: string;
  resolvedAt: string;
};

const emptyIssue = (): IssueDraft => ({
  title: "",
  description: "",
  severity: "medium",
  status: "open",
  ownerId: "",
  resolution: "",
  resolvedAt: "",
});

const issuePayload = (d: IssueDraft) => ({
  title: d.title.trim(),
  description: nullable(d.description),
  severity: d.severity as any,
  status: d.status as any,
  ownerId: nullable(d.ownerId),
  resolution: nullable(d.resolution),
  resolvedAt: nullable(d.resolvedAt),
});

function IssueFields(
  draft: IssueDraft,
  set: (p: Partial<IssueDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
) {
  return (
    <Grid>
      <Text
        label="Issue title"
        span="md:col-span-2"
        placeholder="What is currently broken or blocked"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Enum
        label="Severity"
        value={draft.severity}
        options={ISSUE_SEVERITIES}
        onChange={(severity) => set({ severity })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={ISSUE_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Person
        label="Issue owner"
        value={draft.ownerId}
        team={team}
        onChange={(ownerId) => set({ ownerId })}
        disabled={disabled}
      />
      <DateField
        label="Resolved on"
        value={draft.resolvedAt}
        onChange={(resolvedAt) => set({ resolvedAt })}
        disabled={disabled}
      />
      <Area
        label="Description"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
      <Area
        label="Resolution"
        value={draft.resolution}
        onChange={(resolution) => set({ resolution })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddIssue({
  customerId,
  implementationId,
  team,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
}) {
  const save = useServerFn(addIssue);
  return (
    <WriteShell<IssueDraft>
      mode="add"
      addLabel="Add issue"
      customerId={customerId}
      empty={emptyIssue}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...issuePayload(d) } })}
      render={(d, set, disabled) => IssueFields(d, set, disabled, team)}
    />
  );
}

export function EditIssue({
  customerId,
  issue,
  team,
}: {
  customerId: string;
  issue: any;
  team: TeamOption[];
}) {
  const save = useServerFn(setIssue);
  return (
    <WriteShell<IssueDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyIssue}
      from={() => ({
        title: issue.title ?? "",
        description: issue.description ?? "",
        severity: issue.severity ?? "medium",
        status: issue.status ?? "open",
        ownerId: issue.owner_id ?? "",
        resolution: issue.resolution ?? "",
        resolvedAt: dateOnly(issue.resolved_at),
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: issue.id, ...issuePayload(d) } })}
      render={(d, set, disabled) => IssueFields(d, set, disabled, team)}
    />
  );
}

/* ---------------- Escalations ---------------- */

type EscalationDraft = {
  title: string;
  description: string;
  severity: string;
  status: string;
  escalationType: string;
  ownerId: string;
  raisedBy: string;
  relatedIssueId: string;
  relatedRiskId: string;
  resolutionSummary: string;
  resolvedAt: string;
};

const emptyEscalation = (): EscalationDraft => ({
  title: "",
  description: "",
  severity: "high",
  status: "open",
  escalationType: "",
  ownerId: "",
  raisedBy: "",
  relatedIssueId: "",
  relatedRiskId: "",
  resolutionSummary: "",
  resolvedAt: "",
});

const escalationPayload = (d: EscalationDraft) => ({
  title: d.title.trim(),
  description: nullable(d.description),
  severity: d.severity as any,
  status: d.status as any,
  escalationType: nullable(d.escalationType),
  ownerId: nullable(d.ownerId),
  raisedBy: nullable(d.raisedBy),
  relatedIssueId: nullable(d.relatedIssueId),
  relatedRiskId: nullable(d.relatedRiskId),
  resolutionSummary: nullable(d.resolutionSummary),
  resolvedAt: nullable(d.resolvedAt),
});

function EscalationFields(
  draft: EscalationDraft,
  set: (p: Partial<EscalationDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
  risks: LinkOption[],
  issues: LinkOption[],
) {
  return (
    <Grid>
      <Text
        label="Escalation title"
        span="md:col-span-2"
        placeholder="What has been escalated"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Enum
        label="Severity"
        value={draft.severity}
        options={ESCALATION_SEVERITIES}
        onChange={(severity) => set({ severity })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={ESCALATION_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Text
        label="Escalation type"
        placeholder="commercial, technical…"
        value={draft.escalationType}
        onChange={(escalationType) => set({ escalationType })}
        disabled={disabled}
      />
      <Person
        label="Escalation owner"
        value={draft.ownerId}
        team={team}
        onChange={(ownerId) => set({ ownerId })}
        disabled={disabled}
      />
      <Person
        label="Raised by"
        value={draft.raisedBy}
        team={team}
        onChange={(raisedBy) => set({ raisedBy })}
        disabled={disabled}
        emptyLabel="Not recorded"
      />
      <DateField
        label="Resolved on"
        value={draft.resolvedAt}
        onChange={(resolvedAt) => set({ resolvedAt })}
        disabled={disabled}
      />
      <LinkField
        label="Linked issue"
        value={draft.relatedIssueId}
        options={issues}
        onChange={(relatedIssueId) => set({ relatedIssueId })}
        disabled={disabled}
      />
      <LinkField
        label="Linked risk"
        value={draft.relatedRiskId}
        options={risks}
        onChange={(relatedRiskId) => set({ relatedRiskId })}
        disabled={disabled}
      />
      <Area
        label="Description"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
      <Area
        label="Resolution summary"
        value={draft.resolutionSummary}
        onChange={(resolutionSummary) => set({ resolutionSummary })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddEscalation({
  customerId,
  implementationId,
  team,
  risks,
  issues,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
  risks: LinkOption[];
  issues: LinkOption[];
}) {
  const save = useServerFn(addEscalation);
  return (
    <WriteShell<EscalationDraft>
      mode="add"
      addLabel="Add escalation"
      customerId={customerId}
      empty={emptyEscalation}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...escalationPayload(d) } })}
      render={(d, set, disabled) => EscalationFields(d, set, disabled, team, risks, issues)}
    />
  );
}

export function EditEscalation({
  customerId,
  escalation,
  team,
  risks,
  issues,
}: {
  customerId: string;
  escalation: any;
  team: TeamOption[];
  risks: LinkOption[];
  issues: LinkOption[];
}) {
  const save = useServerFn(setEscalation);
  return (
    <WriteShell<EscalationDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyEscalation}
      from={() => ({
        title: escalation.title ?? "",
        description: escalation.description ?? "",
        severity: escalation.severity ?? "high",
        status: escalation.status ?? "open",
        escalationType: escalation.escalation_type ?? "",
        ownerId: escalation.owner_id ?? "",
        raisedBy: escalation.raised_by ?? "",
        relatedIssueId: escalation.related_issue_id ?? "",
        relatedRiskId: escalation.related_risk_id ?? "",
        resolutionSummary: escalation.resolution_summary ?? "",
        resolvedAt: dateOnly(escalation.resolved_at),
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: escalation.id, ...escalationPayload(d) } })}
      render={(d, set, disabled) => EscalationFields(d, set, disabled, team, risks, issues)}
    />
  );
}

/* ---------------- Decisions ---------------- */

type DecisionDraft = {
  title: string;
  description: string;
  rationale: string;
  decidedBy: string;
  decisionDate: string;
  status: string;
};

const emptyDecision = (): DecisionDraft => ({
  title: "",
  description: "",
  rationale: "",
  decidedBy: "",
  decisionDate: "",
  status: "active",
});

const decisionPayload = (d: DecisionDraft) => ({
  title: d.title.trim(),
  description: nullable(d.description),
  rationale: nullable(d.rationale),
  decidedBy: nullable(d.decidedBy),
  decisionDate: nullable(d.decisionDate),
  status: d.status as any,
});

function DecisionFields(
  draft: DecisionDraft,
  set: (p: Partial<DecisionDraft>) => void,
  disabled: boolean,
) {
  return (
    <Grid>
      <Text
        label="Decision title"
        span="md:col-span-2"
        placeholder="What was decided"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Text
        label="Decided by"
        placeholder="Person or group"
        value={draft.decidedBy}
        onChange={(decidedBy) => set({ decidedBy })}
        disabled={disabled}
      />
      <DateField
        label="Decision date"
        value={draft.decisionDate}
        onChange={(decisionDate) => set({ decisionDate })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={DECISION_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Area
        label="Context"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
      <Area
        label="Reason"
        value={draft.rationale}
        onChange={(rationale) => set({ rationale })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddDecision({
  customerId,
  implementationId,
}: {
  customerId: string;
  implementationId: string;
}) {
  const save = useServerFn(addDecision);
  return (
    <WriteShell<DecisionDraft>
      mode="add"
      addLabel="Add decision"
      customerId={customerId}
      empty={emptyDecision}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...decisionPayload(d) } })}
      render={(d, set, disabled) => DecisionFields(d, set, disabled)}
    />
  );
}

export function EditDecision({
  customerId,
  decision,
}: {
  customerId: string;
  decision: any;
}) {
  const save = useServerFn(setDecision);
  return (
    <WriteShell<DecisionDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyDecision}
      from={() => ({
        title: decision.title ?? "",
        description: decision.description ?? "",
        rationale: decision.rationale ?? "",
        decidedBy: decision.decided_by ?? "",
        decisionDate: dateOnly(decision.decision_date),
        status: decision.status ?? "active",
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: decision.id, ...decisionPayload(d) } })}
      render={(d, set, disabled) => DecisionFields(d, set, disabled)}
    />
  );
}

/* ---------------- Commitments ---------------- */

type CommitmentDraft = {
  description: string;
  committedTo: string;
  ownerId: string;
  madeBy: string;
  dueDate: string;
  status: string;
  fulfilledAt: string;
};

const emptyCommitment = (): CommitmentDraft => ({
  description: "",
  committedTo: "customer",
  ownerId: "",
  madeBy: "",
  dueDate: "",
  status: "open",
  fulfilledAt: "",
});

const commitmentPayload = (d: CommitmentDraft) => ({
  description: d.description.trim(),
  committedTo: d.committedTo as any,
  ownerId: nullable(d.ownerId),
  madeBy: nullable(d.madeBy),
  dueDate: nullable(d.dueDate),
  status: d.status as any,
  fulfilledAt: nullable(d.fulfilledAt),
});

function CommitmentFields(
  draft: CommitmentDraft,
  set: (p: Partial<CommitmentDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
) {
  return (
    <Grid>
      <Text
        label="What was committed"
        span="md:col-span-2"
        placeholder="The promise as it was made"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
      <Enum
        label="Committed to"
        value={draft.committedTo}
        options={COMMITMENT_AUDIENCES}
        onChange={(committedTo) => set({ committedTo })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={COMMITMENT_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <Person
        label="Commitment owner"
        value={draft.ownerId}
        team={team}
        onChange={(ownerId) => set({ ownerId })}
        disabled={disabled}
      />
      <Person
        label="Made by"
        value={draft.madeBy}
        team={team}
        onChange={(madeBy) => set({ madeBy })}
        disabled={disabled}
        emptyLabel="Not recorded"
      />
      <DateField
        label="Due date"
        value={draft.dueDate}
        onChange={(dueDate) => set({ dueDate })}
        disabled={disabled}
      />
      <DateField
        label="Fulfilled on"
        value={draft.fulfilledAt}
        onChange={(fulfilledAt) => set({ fulfilledAt })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddCommitment({
  customerId,
  implementationId,
  team,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
}) {
  const save = useServerFn(addCommitment);
  return (
    <WriteShell<CommitmentDraft>
      mode="add"
      addLabel="Add commitment"
      customerId={customerId}
      empty={emptyCommitment}
      canSave={(d) => d.description.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...commitmentPayload(d) } })}
      render={(d, set, disabled) => CommitmentFields(d, set, disabled, team)}
    />
  );
}

export function EditCommitment({
  customerId,
  commitment,
  team,
}: {
  customerId: string;
  commitment: any;
  team: TeamOption[];
}) {
  const save = useServerFn(setCommitment);
  return (
    <WriteShell<CommitmentDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyCommitment}
      from={() => ({
        description: commitment.description ?? "",
        committedTo: commitment.committed_to ?? "customer",
        ownerId: commitment.owner_id ?? "",
        madeBy: commitment.made_by ?? "",
        dueDate: dateOnly(commitment.due_date),
        status: commitment.status ?? "open",
        fulfilledAt: dateOnly(commitment.fulfilled_at),
      })}
      canSave={(d) => d.description.trim() !== ""}
      submit={(d) => save({ data: { id: commitment.id, ...commitmentPayload(d) } })}
      render={(d, set, disabled) => CommitmentFields(d, set, disabled, team)}
    />
  );
}

/* ---------------- Evidence + approval requests (Slice 4) ---------------- */

export type RelatedRecord = { type: string; id: string; title: string };

const relationValue = (type: string | null, id: string | null) =>
  type && id ? `${type}:${id}` : "";

function RelationField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: RelatedRecord[];
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-0.5 md:col-span-2">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Not linked</option>
        {options.map((o) => (
          <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
            {humanize(o.type)}: {o.title}
          </option>
        ))}
      </select>
    </label>
  );
}

type EvidenceDraft = {
  type: string;
  title: string;
  description: string;
  url: string;
  uploadedBy: string;
  relation: string;
};

const emptyEvidence = (): EvidenceDraft => ({
  type: "document",
  title: "",
  description: "",
  url: "",
  uploadedBy: "",
  relation: "",
});

const evidencePayload = (d: EvidenceDraft) => {
  const [type, id] = d.relation ? d.relation.split(":") : [null, null];
  return {
    type: d.type as any,
    title: d.title.trim(),
    description: nullable(d.description),
    url: nullable(d.url),
    uploadedBy: nullable(d.uploadedBy),
    relatedEntityType: (type as any) ?? null,
    relatedEntityId: id ?? null,
  };
};

function EvidenceFields(
  draft: EvidenceDraft,
  set: (p: Partial<EvidenceDraft>) => void,
  disabled: boolean,
  team: TeamOption[],
  related: RelatedRecord[],
) {
  return (
    <Grid>
      <Text
        label="Proof title"
        span="md:col-span-2"
        placeholder="What this proves"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Enum
        label="Type"
        value={draft.type}
        options={EVIDENCE_TYPES}
        onChange={(type) => set({ type })}
        disabled={disabled}
      />
      <Person
        label="Uploaded by"
        value={draft.uploadedBy}
        team={team}
        onChange={(uploadedBy) => set({ uploadedBy })}
        disabled={disabled}
        emptyLabel="Not recorded"
      />
      <Text
        label="Link"
        span="md:col-span-2"
        placeholder="https://…"
        value={draft.url}
        onChange={(url) => set({ url })}
        disabled={disabled}
      />
      <RelationField
        label="Proof for"
        value={draft.relation}
        options={related}
        onChange={(relation) => set({ relation })}
        disabled={disabled}
      />
      <Area
        label="Description"
        value={draft.description}
        onChange={(description) => set({ description })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddEvidence({
  customerId,
  implementationId,
  team,
  related,
}: {
  customerId: string;
  implementationId: string;
  team: TeamOption[];
  related: RelatedRecord[];
}) {
  const save = useServerFn(addEvidence);
  return (
    <WriteShell<EvidenceDraft>
      mode="add"
      addLabel="Add proof"
      customerId={customerId}
      empty={emptyEvidence}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...evidencePayload(d) } })}
      render={(d, set, disabled) => EvidenceFields(d, set, disabled, team, related)}
    />
  );
}

export function EditEvidence({
  customerId,
  evidence,
  team,
  related,
}: {
  customerId: string;
  evidence: any;
  team: TeamOption[];
  related: RelatedRecord[];
}) {
  const save = useServerFn(setEvidence);
  return (
    <WriteShell<EvidenceDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyEvidence}
      from={() => ({
        type: evidence.type ?? "document",
        title: evidence.title ?? "",
        description: evidence.description ?? "",
        url: evidence.url ?? "",
        uploadedBy: evidence.uploaded_by ?? "",
        relation: relationValue(evidence.related_entity_type, evidence.related_entity_id),
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: evidence.id, ...evidencePayload(d) } })}
      render={(d, set, disabled) => EvidenceFields(d, set, disabled, team, related)}
    />
  );
}

type ApprovalDraft = {
  title: string;
  status: string;
  approverName: string;
  approverRole: string;
  customerContactId: string;
  evidenceId: string;
  decidedAt: string;
  relation: string;
};

const emptyApproval = (): ApprovalDraft => ({
  title: "",
  status: "pending",
  approverName: "",
  approverRole: "",
  customerContactId: "",
  evidenceId: "",
  decidedAt: "",
  relation: "",
});

const approvalPayload = (d: ApprovalDraft) => {
  const [type, id] = d.relation ? d.relation.split(":") : [null, null];
  return {
    title: d.title.trim(),
    status: d.status as any,
    approverName: nullable(d.approverName),
    approverRole: nullable(d.approverRole),
    customerContactId: nullable(d.customerContactId),
    evidenceId: nullable(d.evidenceId),
    decidedAt: nullable(d.decidedAt),
    approvedEntityType: (type as any) ?? null,
    approvedEntityId: id ?? null,
  };
};

function ApprovalFields(
  draft: ApprovalDraft,
  set: (p: Partial<ApprovalDraft>) => void,
  disabled: boolean,
  related: RelatedRecord[],
  evidenceOptions: LinkOption[],
  contacts: { id: string; name: string; role: string }[],
) {
  return (
    <Grid>
      <Text
        label="What is being approved"
        span="md:col-span-2"
        placeholder="Approval request title"
        value={draft.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
      />
      <Enum
        label="Status"
        value={draft.status}
        options={APPROVAL_STATUSES}
        onChange={(status) => set({ status })}
        disabled={disabled}
      />
      <DateField
        label="Decided on"
        value={draft.decidedAt}
        onChange={(decidedAt) => set({ decidedAt })}
        disabled={disabled || draft.status === "pending"}
      />
      <Text
        label="Approver name"
        value={draft.approverName}
        onChange={(approverName) => set({ approverName })}
        disabled={disabled}
      />
      <Text
        label="Approver role"
        value={draft.approverRole}
        onChange={(approverRole) => set({ approverRole })}
        disabled={disabled}
      />
      <Person
        label="Customer contact"
        value={draft.customerContactId}
        team={contacts}
        onChange={(customerContactId) => set({ customerContactId })}
        disabled={disabled}
        emptyLabel="Not recorded"
      />
      <LinkField
        label="Supporting proof"
        value={draft.evidenceId}
        options={evidenceOptions}
        onChange={(evidenceId) => set({ evidenceId })}
        disabled={disabled}
      />
      <RelationField
        label="Approves"
        value={draft.relation}
        options={related}
        onChange={(relation) => set({ relation })}
        disabled={disabled}
      />
    </Grid>
  );
}

export function AddApproval({
  customerId,
  implementationId,
  related,
  evidenceOptions,
  contacts,
}: {
  customerId: string;
  implementationId: string;
  related: RelatedRecord[];
  evidenceOptions: LinkOption[];
  contacts: { id: string; name: string; role: string }[];
}) {
  const save = useServerFn(addApproval);
  return (
    <WriteShell<ApprovalDraft>
      mode="add"
      addLabel="Add approval"
      customerId={customerId}
      empty={emptyApproval}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { implementationId, ...approvalPayload(d) } })}
      render={(d, set, disabled) =>
        ApprovalFields(d, set, disabled, related, evidenceOptions, contacts)
      }
    />
  );
}

export function EditApproval({
  customerId,
  approval,
  related,
  evidenceOptions,
  contacts,
}: {
  customerId: string;
  approval: any;
  related: RelatedRecord[];
  evidenceOptions: LinkOption[];
  contacts: { id: string; name: string; role: string }[];
}) {
  const save = useServerFn(setApproval);
  return (
    <WriteShell<ApprovalDraft>
      mode="edit"
      addLabel="Edit"
      customerId={customerId}
      empty={emptyApproval}
      from={() => ({
        title: approval.title ?? "",
        status: approval.status ?? "pending",
        approverName: approval.approver_name ?? "",
        approverRole: approval.approver_role ?? "",
        customerContactId: approval.customer_contact_id ?? "",
        evidenceId: approval.evidence_id ?? "",
        decidedAt: dateOnly(approval.decided_at),
        relation: relationValue(approval.approved_entity_type, approval.approved_entity_id),
      })}
      canSave={(d) => d.title.trim() !== ""}
      submit={(d) => save({ data: { id: approval.id, ...approvalPayload(d) } })}
      render={(d, set, disabled) =>
        ApprovalFields(d, set, disabled, related, evidenceOptions, contacts)
      }
    />
  );
}
