# Post-sale access: what is protected, what is open, and why

Status: PR #101 (`claude/complete-solutions-workspace`). Not merged. Not deployed.
The `complete_solutions` flag is off everywhere until acceptance is signed off.

## 1. The agreed model

- **Team Lead** (a flag on the profile, separate from `manager`): full operational
  authority over every post-sale implementation, whoever is assigned. Nothing in
  pre-sale, Salesforce administration, AI administration or system settings.
- **Assigned TIS** (`implementation` or `onboarding`): manages the implementations
  they own, including their customer-facing delivery work.
- **Other TIS**: cannot change critical delivery decisions on someone else's
  implementation.
- **Technical Solutions** (`se`, `tam_se`): keep their technical access. Owning a
  technical record or an implementation does not give delivery-management rights.
- **Admin and super admin**: unchanged.
- **Authority for an implementation** is `implementations.owner_id`, the formal
  assignment. Nothing else makes someone the assigned TIS.

The rule is one database function, `post_sale_may_manage`. Every guard below asks it.

## 2. Critical decisions: how each is protected

Each path runs the check before anything is written, and against the implementation
the record belongs to, not an id the caller supplies.

| Decision | Path | Guard | Tested by |
| --- | --- | --- | --- |
| Stage progression, including exceptions and overrides | `advanceImplementationStage` → `advanceStage` | checked when a person makes the move (the journey's own sync carries no person) | `post-sale-writes` (refused with an override) |
| Partner hand-off | `handOffPartnerImplementation` → `handOffPartner` | checked; a person is required | `post-sale-writes` |
| Graduation | `graduatePartnerImplementationFn` → `graduatePartner` | checked before the implementation is read | `post-sale-access` |
| Solution and component status, dependencies, dates | `solution_*`, `component_*`, `dependency_*` (database) | the same rule, inside each function | SQL probes (permissions, version, loops) |
| Customer commitments, requirements, risks, issues, decisions, escalations, evidence, approvals | every delivery write (`insertDeliveryRow`, `updateDeliveryRow`) | checked on create, and on update against the row's own implementation | `post-sale-access` (create refused; update checked against the record's implementation) |
| Success criteria, observations, confirmations, adoption areas | their writers | checked; the criterion or area's own implementation | `post-sale-access` |
| Implementation dates, stage fields, owner | `updateImplementation` (through `setImplementation` and `setRecordField`) | checked when a person makes the change | `post-sale-access` (refused; no write) |
| Transcript-generated updates | `applyProposal` | risk, issue, decision and component changes use the guarded writers; a date on a deal's plan is checked first; an owner change needs its reason | `transcript-component-update`, `transcript-proposals-server` |
| Task status (gate tasks marked done or skipped) | `setTaskStatus` → `setTaskStatusAsPerson` | checked against the task's implementation | `post-sale-writes` |
| SOW goals and agreed requirements | `applySowProposalToImplementation` → `applySowProposalAsPerson` | checked before the goals and requirements are written | `post-sale-writes`, `sow-proposal-attribution` |
| Which document is the agreed-scope reference | `setSowDocumentForImplementation` → `setSowDocumentAsPerson` | checked | `post-sale-writes` |

Approvals are recorded with the person who recorded them (the activity log), and the
guards do not change that. Approvals have no internal approver identity: the approver
is a free-text name or a customer contact. So **prohibited self-approval cannot be
detected from the data**. That is a model gap, not a guard gap. See §5.

Pre-sale paths are not changed: the deal stage, the deal intake, Salesforce
opportunity processing, the pre-sale assignment rules and the Closed Won start.

## 3. Manual owner changes

- A **manual** change needs a reason code: TIS on leave, workload balancing, customer
  escalation, coverage change, or Other. "Other" needs a few words.
- It is refused without one, on every path a person can use: the implementation
  edit, the owner panel, a manager's deal assignment pick where it changes an existing
  implementation's owner (a deal with no implementation yet needs no reason; see
  `docs/RELEASE-PR101.md` §4), the transcript owner change, and the reassignment
  endpoint. The reason is checked in the server
  function and again in the database.
- Only a Team Lead, a manager, an admin or a super admin may reassign. An assigned
  TIS cannot hand off their own implementation.
- The ledger `implementation_owner_changes` is append-only and records the previous
  owner, the new owner, the reason code and words, the source, the actor and the time.
- A change that does not come through the reassignment function (the assignment
  engine, a claim, the Closed Won start, the Salesforce sync) is still recorded, by a
  database trigger, as a **system** change. No reason or actor is invented for it.
- The pre-sale assignment rules are unchanged. Only the owner write for a manager's
  manual pick goes through the reassignment function, so the pick is recorded with
  its reason.

## 4. Remaining operations that still need only sign-in

These are not changed here. Each needs an owner decision before a restriction is
made, because each has legitimate users outside the owner.

| Operation | Who can do it now | Workflows that rely on it | Demonstrated issue? | Would restricting affect… | Smallest recommendation |
| --- | --- | --- | --- | --- | --- |
| Customer contacts (add, edit) | any internal user | Customer 360, approvals (customer contact), external access grants | No | customer collaboration; external access | Keep open. Decide whether contact edits need the owner's approval |
| Customer records (name, ARR, account manager) | any internal user (`canEditDeal`) | the customer list, commercial reporting | No, but ARR is a commercial figure | pre-sale and commercial reporting | Business decision: who may change ARR |
| Notes and journal entries | any internal user | activity feed, automation notes | No (add-only, attributed) | automation writes notes too | Keep open |
| Attachments and uploads | any internal user | SOW upload, transcripts, evidence | No | the SOW and transcript flows | Keep open; the agreed-scope reference is guarded |
| Technical solutions, design, field mappings | any internal user | Technical Solutions work, integration build | No | Technical Solutions users | Decide whether a technical record needs its technical owner or a post-sale manager |
| Technical solution owner and status | any internal user | the engineering board | No | Technical Solutions | Keep open; it does not grant delivery rights |
| Creating an implementation (manual) | any internal user | manual project creation | Possible: an owner set at creation is recorded as system, with no reason | the Closed Won start (automatic, must stay) | Recommend a reason for an owner set on a manual create |
| Dismiss a transcript suggestion | any internal user (`requireDealEditor`) | the transcript review | No | transcript review | Keep open |
| Customer-side completion, comments and messages (external plan) | the customer, through their link | the shared plan | Intended | customer collaboration | Keep. Decide whether a customer's completion of a shared task should be confirmed internally |
| Salesforce sync writes (dates, owners) | the sync (system) | Salesforce integration | Recorded as system | Salesforce administration (out of scope) | Leave; do not change Salesforce processing |
| Pre-sale deal stage and intake (skip to graduation, intake answers) | deal editors | pre-sale workflow | out of scope | pre-sale | Leave, as instructed |

## 5. Assignment consistency

- `implementations.owner_id` is the only assigned TIS. It is not rewritten by anything
  in this change.
- `implementation_role_assignments` is written only by the journey template apply
  (SQL). It maps role keys (for example `implementation_manager`) to people. The
  template apply uses it to set the owner of each task. The application does not read
  it for permissions, and nothing acts on the `implementation_manager` row.
- So a disagreement between a role assignment and the owner does not grant or remove
  rights. It can make the task owners differ from the implementation owner.
- `implementation_owner_conflicts` (read only) lists the disagreements. Neither side is
  changed. An authorised Team Lead or admin reviews the list and reassigns the owner
  where it is wrong; the history is kept.
- **Actual conflicts cannot be counted here**: there is no staging data. The count is
  the first thing to read on staging.

## 6. Decisions still open

1. Whether a customer's completion of a shared task should be confirmed by the TIS.
2. Who may change customer records, in particular ARR.
3. Whether technical records need the technical owner or a post-sale manager.
4. Whether an owner set on a manual create needs a reason.
5. How to record prohibited self-approval, given approvals have no internal approver.
6. Whether the Closed Won start's owner should carry a source (today it is a system change).

## 7. Not verified

- The Team Lead, TIS and technical flows in a browser, against staging.
- Two live sessions racing on one owner change.
- The conflict count on real data.
