export type ImplStatus = "on_track" | "at_risk" | "blocked" | "idle" | string;

export type ImplementationRow = {
  id: string;
  name: string;
  customer_id: string;
  customer_name: string;
  segment: string | null;
  industry: string | null;
  arr: number | null;
  current_stage: string;
  stage_entered_at: string;
  status: ImplStatus;
  owner_name: string | null;
  tier: string | null;
  target_launch_date: string | null;
  actual_launch_date: string | null;
  overdue_commitments: number;
  open_escalations: number;
};

export type CommitmentRow = {
  id: string;
  description: string;
  due_date: string | null;
  status: string;
  committed_to: string | null;
  owner_name: string | null;
  implementation_id: string;
  customer_id: string;
  customer_name: string;
};

export type SignalRow = {
  key: string;
  kind: "audit" | "risk" | "issue" | "escalation" | "stage";
  title: string;
  detail: string | null;
  at: string;
  actor: string | null;
  customer_id: string | null;
  customer_name: string | null;
};

/** Per-implementation open-item bundle used to triage the Home queue. */
export type TriageBundle = {
  implementation_id: string;
  commitments: any[];
  risks: any[];
  issues: any[];
  escalations: any[];
  milestones: any[];
  decisions: any[];
  /** Success criteria with observations + confirmations, for due_stage lateness. */
  success_criteria: any[];
  /** Technical solutions (with field mappings) — dependency input for waitingOn. */
  technical_solutions: any[];
  /** Approvals on this implementation — dependency input for waitingOn. */
  approvals: any[];
  /** Adoption areas with their observations, for adoption coverage. */
  adoption: any[];
};

export type HomeData = {
  implementations: ImplementationRow[];
  commitments: CommitmentRow[];
  signal: SignalRow[];
  triage: TriageBundle[];
};

/** Stage dwell input: append-only history rows, oldest first. */
export type StageHistoryRow = {
  implementation_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
};

/** Leadership layer: the Home query set plus stage dwell and graduation records. */
export type LeadershipData = HomeData & {
  stage_history: StageHistoryRow[];
  /** Full records, scoped to implementations in Adopt or Graduate to CS. */
  graduation_candidates: Array<{
    implementation_id: string;
    customer_id: string;
    record: Customer360;
  }>;
};



/** Prove Value: intended outcome ("what we meant to achieve"). */
export type SuccessCriterion = {
  id: string;
  implementation_id: string;
  description: string;
  metric: string | null;
  target_value: string | null;
  measured_value: string | null;
  status: string;
  measured_at: string | null;
  created_at: string;
  owner_id: string | null;
  baseline_value: string | null;
  measurement_source: string | null;
  due_stage: string | null;
  /** Kickoff intake: confirmed at kickoff, blank until the customer supplies it. */
  baseline_period: string | null;
  target_date: string | null;
  customer_owner_contact_id: string | null;
};

export type ObservationAssessment = "improving" | "met" | "not_met" | "inconclusive";

/** Prove Value: a dated, attributable observation of a criterion. */
export type SuccessCriterionObservation = {
  id: string;
  success_criteria_id: string;
  observed_value: string;
  observed_at: string;
  observed_by: string | null;
  source: string | null;
  assessment: ObservationAssessment | string | null;
  notes: string | null;
  evidence_id: string | null;
  created_at: string;
};

/** Loader shape: criterion plus its observations, linked evidence and confirming approvals. */
export type SuccessCriterionRecord = SuccessCriterion & {
  owner_name: string | null;
  customer_owner_name: string | null;
  customer_owner_role: string | null;
  observations: Array<
    SuccessCriterionObservation & {
      observed_by_name: string | null;
      evidence: { id: string; type: string; title: string; url: string | null } | null;
    }
  >;
  /** Approvals with approved_entity_type = 'success_criterion' pointing at this criterion. */
  confirmations: Array<{
    id: string;
    title: string;
    status: string;
    approver_name: string | null;
    approver_role: string | null;
    requested_at: string;
    decided_at: string | null;
    evidence_id: string | null;
    customer_contact_id: string | null;
    contact_name: string | null;
    contact_role: string | null;
    evidence: { id: string; type: string; title: string; url: string | null } | null;
  }>;
};

/** Structured customer-side people, used by the confirmation selector. */
export type CustomerContactOption = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  notes: string | null;
};

/** Adoption: an intended user group or workflow that should be in use. */
export type AdoptionArea = {
  id: string;
  implementation_id: string;
  kind: string;
  name: string;
  /** SOW-derived source context. Never rewritten by kickoff intake. */
  intended_usage: string | null;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  /** Kickoff intake: intended usage confirmed with the customer. */
  intended_users: string | null;
  expected_frequency: string | null;
  in_use_definition: string | null;
  customer_owner_contact_id: string | null;
  customer_owner_name: string | null;
  customer_owner_role: string | null;
  created_at: string;
  updated_at: string | null;
  /** Append-only behavioural observations, newest first. */
  observations: AdoptionObservation[];
};

/** Adoption: a dated, attributable observation of actual usage behaviour. */
export type AdoptionObservation = {
  id: string;
  adoption_area_id: string;
  observed_at: string;
  observed_by: string | null;
  observed_by_name: string | null;
  state: string;
  workaround_in_use: boolean;
  workaround_description: string | null;
  source: string | null;
  notes: string | null;
  evidence_id: string | null;
  evidence: { id: string; type: string; title: string; url: string | null } | null;
  created_at: string;
};

export type TraceStep = { entity_type: string; id: string; label: string; relationship: string };

export type Customer360 = {
  customer: {
    id: string;
    name: string;
    industry: string | null;
    segment: string | null;
    arr: number | null;
    region: string | null;
  };
  implementation: {
    id: string;
    name: string;
    current_stage: string;
    stage_entered_at: string;
    status: string;
    owner_id: string | null;
    owner_name: string | null;
    sales_owner: string | null;
    tier: string | null;
    sow_reference: string | null;
    sow_document_url: string | null;
    sow_document_name: string | null;
    sow_value: number | null;
    sow_signed_date: string | null;
    contract_start_date: string | null;
    target_launch_date: string | null;
    actual_launch_date: string | null;
    customer_goals: string | null;
    discovery_board_url: string | null;
    discovery_board_image_url: string | null;
    discovery_board_image_name: string | null;
    discovery_board_notes: string | null;

  } | null;
  requirements: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    priority: string;
    status: string;
    source: string | null;
    scope_status: string;
    created_by: string | null;
    owner_name: string | null;

    trace: TraceStep[];
    validation: {
      approval_status: string | null;
      approver: string | null;
      evidence_count: number;
    };
  }>;

  success_criteria: SuccessCriterionRecord[];
  /** Adoption ("are they using it as intended?") — never derived from success criteria. */
  adoption: AdoptionArea[];
  /** Existing graduation record, if one has been written. Read-only. */
  graduation: {
    id: string;
    graduated_at: string | null;
    health_at_graduation: string | null;
    exit_criteria_summary: string | null;
    cs_owner_name: string | null;
    notes: string | null;
  } | null;
  /** Existing CS handoff record, if one has been written. Read-only. */
  cs_handoff: {
    id: string;
    handoff_date: string | null;
    cs_owner_name: string | null;
    summary: string | null;
    open_items: string | null;
    account_context: string | null;
  } | null;
  /** Active team members, used by inline owner selectors. */
  team: Array<{ id: string; name: string; role: string }>;
  /** Every implementation this customer has, newest first — drives the selector. */
  implementations: ImplementationSummary[];
  /** Working notes for the selected implementation, newest first. */
  journal: JournalEntry[];
  /** Structured customer-side contacts, used by the confirmation selector. */
  contacts: CustomerContactOption[];
  milestones: any[];
  commitments: any[];
  decisions: any[];
  risks: any[];
  issues: any[];
  escalations: any[];
  technical_solutions: any[];
  evidence: any[];
  approvals: any[];
  stage_history: Array<{
    id: string;
    stage: string;
    entered_at: string;
    exited_at: string | null;
    notes: string | null;
    entered_by_name: string | null;
  }>;
  audit_log: Array<{
    id: string;
    entity_type: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    change_reason: string | null;
    changed_at: string;
    changed_by_name: string | null;
  }>;
};

export type TechnicalSolutionRow = {
  id: string;
  title: string;
  status: string;
  owner_name: string | null;
  requirement_title: string | null;
  implementation_id: string;
  implementation_name: string;
  customer_id: string;
  customer_name: string;
  next_needed: string;
};

export type TeamMemberOption = { id: string; name: string; role: string };

export type TechnicalSolutionDetail = {
  solution: {
    id: string;
    title: string;
    status: string;
    design_summary: string | null;
    configuration_details: string | null;
    owner_id: string | null;
    owner_name: string | null;
    created_at: string;
    updated_at: string | null;
  };
  customer: { id: string; name: string; industry: string | null; segment: string | null };
  implementation: { id: string; name: string; current_stage: string } | null;
  requirement: { id: string; title: string; status: string; priority: string } | null;
  team: TeamMemberOption[];
  notes: Array<{
    id: string;
    note_type: string;
    content: string;
    created_at: string;
    author_name: string | null;
    links: string | null;
    attachment_url: string | null;
    attachment_name: string | null;
  }>;
  field_mappings: any[];
  decisions: any[];
  evidence: any[];
  approvals: any[];
  ownership_history: Array<{
    id: string;
    old_value: string | null;
    new_value: string | null;
    change_reason: string | null;
    changed_at: string;
    changed_by_name: string | null;
  }>;
  trace: TraceStep[];
  /** Steps reached through an intermediate node (requirement → decision → this solution). */
  linked_trace: TraceStep[];

};

/** One implementation belonging to a customer, as shown in the selector. */
export type ImplementationSummary = {
  id: string;
  name: string;
  current_stage: string;
  stage_entered_at: string;
  status: string;
  owner_name: string | null;
  target_launch_date: string | null;
};

/** A working note written by the team while the implementation was in a stage. */
export type JournalEntry = {
  id: string;
  implementation_id: string;
  stage: string;
  note: string;
  author_id: string | null;
  author_name: string | null;
  links: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
};
