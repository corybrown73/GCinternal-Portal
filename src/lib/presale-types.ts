import type { AccountStage } from "./presale-stages";

export type UserRole = "admin" | "am" | "se" | "onboarding";
export type TamStatus = "pending" | "approved" | "declined" | "expired";
export type BriefStatus = "queued" | "generating" | "complete" | "failed";
export type BriefGenerator = "llm" | "template";
export type GongReportType = "call_notes" | "account_map";
export type NoteReviewStatus = "needs_review" | "reviewed";
export type TransitionSource = "ui" | "api" | "csv_import" | "system";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  domain: string | null;
  salesforce_id: string | null;
  stage: AccountStage;
  arr: number | null;
  products: string[];
  am_owner_id: string | null;
  se_owner_id: string | null;
  summary: string | null;
  stage_entered_at: string;
  created_at: string;
  updated_at: string;
}

export interface StageTransition {
  id: string;
  account_id: string;
  from_stage: AccountStage | null;
  to_stage: AccountStage;
  source: TransitionSource;
  actor_profile_id: string | null;
  actor_api_key_id: string | null;
  note: string | null;
  occurred_at: string;
}

export interface GongReport {
  id: string;
  account_id: string;
  report_type: GongReportType;
  title: string;
  content_md: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface Brief {
  id: string;
  account_id: string;
  status: BriefStatus;
  generator: BriefGenerator | null;
  structured_json: unknown;
  pptx_storage_path: string | null;
  error: string | null;
  source_report_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TamRequest {
  id: string;
  account_id: string;
  requested_by: string | null;
  requester_email: string;
  justification: string;
  urgency: "low" | "medium" | "high";
  status: TamStatus;
  token_jti: string;
  decided_at: string | null;
  decided_by: string | null;
  decided_via: "email" | "portal" | null;
  decision_note: string | null;
  created_at: string;
}

export interface OnboardingNote {
  id: string;
  account_id: string;
  author_id: string | null;
  body_md: string;
  review_status: NoteReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** Phase 7. Null = never expires, which is every key created before 0025. */
  expires_at?: string | null;
  rate_limit_per_minute?: number | null;
}
