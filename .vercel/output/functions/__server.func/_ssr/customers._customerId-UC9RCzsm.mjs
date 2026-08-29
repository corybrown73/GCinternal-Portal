import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as LIFECYCLE_STAGES, o as STAGE_ALIASES, r as LIFECYCLE_STAGE_MAP } from "./lifecycle-Cl8aBFg1.mjs";
import { c as isPreHandoffStage, d as stageLabel, i as fmtMoney, l as normalizeStage, n as fmtDate, o as humanize, r as fmtDateTime, s as isOverdue, t as daysSince } from "./hub-format--ProSxvQ.mjs";
import { $ as deliveryWindowLabel, C as REQUIREMENT_STATUSES, E as RISK_STATUSES, P as contactRoleLabel, S as REQUIREMENT_SCOPE_STATUSES, T as RISK_SEVERITIES, _ as ISSUE_SEVERITIES, a as COMMITMENT_AUDIENCES, at as splitLinks, b as OBSERVATION_ASSESSMENTS, c as CONFIRMATION_STATUSES, d as DECISION_STATUSES, et as nextLifecycleStage, f as ESCALATION_SEVERITIES, h as EXTRACTION_SECTIONS, i as APPROVAL_STATUSES, k as TIMING_SOURCE_LABEL, l as CONTACT_ROLES, m as EVIDENCE_TYPES, n as ADOPTION_KIND_LABEL, nt as proposedTimings, o as COMMITMENT_STATUSES, p as ESCALATION_STATUSES, r as ADOPTION_STATES, s as CONFIDENCE_LABEL, t as ADOPTION_KINDS, tt as proposalAsNote, u as CONTACT_ROLE_LABELS, v as ISSUE_STATUSES, w as RISK_LIKELIHOODS, x as REQUIREMENT_PRIORITIES } from "./implementation-input-BaYoTLwL.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { $t as setImplementation, Bt as applySowProposalToImplementation, Ct as addApproval, Dt as addEscalation, Et as addDecision, Ft as addSuccessCriterion, Gt as setAdoptionArea, It as addSuccessCriterionConfirmation, Jt as setCustomerContact, Kt as setApproval, Lt as addSuccessCriterionObservation, Mt as addJournalEntry, Nt as addRequirement, Ot as addEvidence, P as LifecycleRail, Pt as addRisk, Rt as advanceImplementationStage, S as customerQuery, St as addAdoptionObservation, Tt as addCustomerContact, Xt as setEscalation, Yt as setDecision, Zt as setEvidence, an as setSuccessCriterion, b as Route$21, dn as cn, en as setIssue, in as setSowDocumentForImplementation, jt as addIssue, ln as uploadAttachment, nn as setRisk, on as setSuccessCriterionConfirmation, qt as setCommitment, tn as setRequirement, wt as addCommitment, x as TABS, xt as addAdoptionArea, zt as analyzeSowDocument } from "./router-DuzTz6dO.mjs";
import { O as ArrowRight, S as ChevronRight, c as ShieldCheck, d as Pencil, u as Plus } from "../_libs/lucide-react.mjs";
import { a as PrimarySignal, c as StatusChip, i as Panel, n as Field, o as SeverityChip, r as NoRows, s as StageBadge, t as AttentionBand } from "./record-BXejhTdA.mjs";
import { S as waitingOnForCustomer, _ as proveValueGaps, a as adoptionSummary, d as launchStateConflict, f as meaningfulEvents, h as progress, i as adoptionAreaLevel, l as latestAdoptionObservation, m as openItems, n as PROVE_VALUE_LABEL, o as deriveHealth, p as nextAction, r as WAITING_ON_LABEL, t as ADOPTION_LEVEL_LABEL, v as proveValueState, w as whatMattersNow } from "./customer360-derive-DgUfIdHQ.mjs";
import { n as launchAcceptanceGate, t as LAUNCH_GATE_TITLE } from "./launch-gate-CjDcSjmz.mjs";
import { n as fileToBase64, t as OwnerPicker } from "./owner-picker-4BjhSJLG.mjs";
import { t as EditImplementation } from "./implementation-write-CRxy1msJ.mjs";
import { n as SowPanel, t as OpenAttachment } from "./sow-write-Zjm31m56.mjs";
import { i as graduationReadinessSummary, n as graduationEvidence, r as graduationReadiness, t as READINESS_STATE_LABEL } from "./graduation-readiness-DKDYA6-i.mjs";
import { t as require_jspdf_node_min } from "../_libs/jspdf.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/customers._customerId-UC9RCzsm.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var import_jspdf_node_min = require_jspdf_node_min();
var inputClass$7 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass$2 = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$8 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass$3 = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass$8 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable$6 = (v) => v.trim() === "" ? null : v.trim();
/**
* Advance one stage forward. Deferred write: the draft is local until Confirm,
* and a confirmation step states exactly what will be stored.
*/
function AdvanceStage({ customerId, implementationId, currentStage, team, gate }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [confirming, setConfirming] = (0, import_react.useState)(false);
	const [enteredBy, setEnteredBy] = (0, import_react.useState)("");
	const [notes, setNotes] = (0, import_react.useState)("");
	const queryClient = useQueryClient();
	const advance = useServerFn(advanceImplementationStage);
	const next = nextLifecycleStage(currentStage);
	const mutation = useMutation({
		mutationFn: () => advance({ data: {
			implementationId,
			toStage: next,
			enteredBy: nullable$6(enteredBy),
			notes: nullable$6(notes)
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			await queryClient.invalidateQueries({ queryKey: ["home"] });
			setOpen(false);
			setConfirming(false);
			setEnteredBy("");
			setNotes("");
		}
	});
	if (!next) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[11px] text-muted-foreground",
		children: "End of the lifecycle — no further stage to advance to."
	});
	const nextStage = LIFECYCLE_STAGE_MAP[next];
	if (gate?.blocked === true) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-1 rounded-sm border border-status-risk bg-status-risk/10 px-2 py-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] font-semibold text-status-risk-foreground",
				children: LAUNCH_GATE_TITLE
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[11px] text-muted-foreground",
				children: [
					"The technical solution must be accepted before this implementation can move to",
					" ",
					nextStage.label,
					". ",
					gate?.reason
				]
			}),
			gate && gate.outstanding.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-0.5",
				children: gate.outstanding.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "text-[11px] text-foreground",
					children: ["• ", o]
				}, i))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-muted-foreground",
				children: "Record acceptance on the Solution tab, then this move becomes available."
			})
		]
	});
	const reset = () => {
		mutation.reset();
		setConfirming(false);
		setEnteredBy("");
		setNotes("");
	};
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: primaryClass$3,
			onClick: () => {
				reset();
				setOpen(true);
			},
			children: [
				"Move to ",
				nextStage.label,
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3" })
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "text-[11px] text-muted-foreground",
			children: [
				"Next stage: ",
				nextStage.label,
				" — ",
				nextStage.intent
			]
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-background p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-baseline gap-2 text-[12px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$8,
						children: "Move to next stage"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-medium",
						children: stageLabel(currentStage ?? "")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3 text-muted-foreground" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-medium",
						children: nextStage.label
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$8,
						children: "Recorded by (optional)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass$7,
						"aria-label": "Recorded by",
						value: enteredBy,
						disabled: mutation.isPending,
						onChange: (e) => setEnteredBy(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "Not stated"
						}), team.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: t.id,
							children: t.name
						}, t.id))]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$8,
						children: "Transition note (optional)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						className: areaClass$2,
						"aria-label": "Transition note",
						rows: 2,
						value: notes,
						disabled: mutation.isPending,
						onChange: (e) => setNotes(e.target.value)
					})]
				})]
			}),
			confirming ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-sm border border-dashed border-border bg-muted/40 px-2 py-1.5 text-[11px]",
				children: [
					"Confirm: close ",
					stageLabel(currentStage ?? ""),
					" now, open ",
					nextStage.label,
					" and set it as the current stage. This is recorded in stage history and cannot be undone here."
				]
			}) : null,
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-status-risk-foreground",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [confirming ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$3,
					disabled: mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Moving…" : `Confirm move to ${nextStage.label}`
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$3,
					onClick: () => setConfirming(true),
					children: "Move to next stage"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$8,
					disabled: mutation.isPending,
					onClick: () => {
						setOpen(false);
						reset();
					},
					children: "Cancel"
				})]
			})
		]
	});
}
var inputClass$6 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var selectClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$7 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass$7 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var emptyDraft$1 = {
	description: "",
	metric: "",
	baselineValue: "",
	targetValue: "",
	measurementSource: "",
	dueStage: "",
	ownerId: "",
	baselinePeriod: "",
	targetDate: "",
	customerOwnerContactId: ""
};
var draftFrom = (c) => ({
	description: c.description ?? "",
	metric: c.metric ?? "",
	baselineValue: c.baseline_value ?? "",
	targetValue: c.target_value ?? "",
	measurementSource: c.measurement_source ?? "",
	dueStage: c.due_stage ?? "",
	ownerId: c.owner_id ?? "",
	baselinePeriod: c.baseline_period ?? "",
	targetDate: c.target_date ?? "",
	customerOwnerContactId: c.customer_owner_contact_id ?? ""
});
var nullable$5 = (v) => v.trim() === "" ? null : v.trim();
var payload = (draft) => ({
	description: draft.description.trim(),
	metric: nullable$5(draft.metric),
	baselineValue: nullable$5(draft.baselineValue),
	targetValue: nullable$5(draft.targetValue),
	measurementSource: nullable$5(draft.measurementSource),
	dueStage: nullable$5(draft.dueStage),
	ownerId: nullable$5(draft.ownerId),
	baselinePeriod: nullable$5(draft.baselinePeriod),
	targetDate: nullable$5(draft.targetDate),
	customerOwnerContactId: nullable$5(draft.customerOwnerContactId)
});
function CriterionForm({ draft, setDraft, team, contacts, disabled }) {
	const set = (patch) => setDraft({
		...draft,
		...patch
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass$7,
					children: "Description"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass$6,
					"aria-label": "Description",
					value: draft.description,
					disabled,
					placeholder: "Outcome the customer expects",
					onChange: (e) => set({ description: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 gap-2 md:grid-cols-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$7,
						children: "Metric"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass$6,
						"aria-label": "Metric",
						value: draft.metric,
						disabled,
						placeholder: "Not set",
						onChange: (e) => set({ metric: e.target.value })
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-sm border border-border/70 bg-muted/30 p-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
						children: "Confirmed at kickoff"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 mb-1.5 text-[11px] text-muted-foreground",
						children: "Leave blank where the customer has not provided it. Nothing is inferred."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-2 md:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Starting point"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass$6,
									"aria-label": "Starting point",
									value: draft.baselineValue,
									disabled,
									placeholder: "Not provided",
									onChange: (e) => set({ baselineValue: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Starting point period"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass$6,
									"aria-label": "Starting point period",
									value: draft.baselinePeriod,
									disabled,
									placeholder: "e.g. Jun–Aug 2026",
									onChange: (e) => set({ baselinePeriod: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Target"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass$6,
									"aria-label": "Target",
									value: draft.targetValue,
									disabled,
									placeholder: "Not provided",
									onChange: (e) => set({ targetValue: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Target date"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									className: inputClass$6,
									"aria-label": "Target date",
									value: draft.targetDate,
									disabled,
									onChange: (e) => set({ targetDate: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "How we'll measure it"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass$6,
									"aria-label": "How we'll measure it",
									value: draft.measurementSource,
									disabled,
									placeholder: "Not provided",
									onChange: (e) => set({ measurementSource: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Due stage"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									className: selectClass,
									"aria-label": "Due stage",
									value: draft.dueStage,
									disabled,
									onChange: (e) => set({ dueStage: e.target.value }),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Not set"
									}), LIFECYCLE_STAGES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: s.id,
										children: s.label
									}, s.id))]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Internal owner"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									className: selectClass,
									"aria-label": "Internal owner",
									value: draft.ownerId,
									disabled,
									onChange: (e) => set({ ownerId: e.target.value }),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Unassigned"
									}), team.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: t.id,
										children: t.name
									}, t.id))]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass$7,
									children: "Customer-side owner"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									className: selectClass,
									"aria-label": "Customer-side owner",
									value: draft.customerOwnerContactId,
									disabled,
									onChange: (e) => set({ customerOwnerContactId: e.target.value }),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Not named"
									}), contacts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
										value: c.id,
										children: [
											c.name,
											" · ",
											c.role
										]
									}, c.id))]
								})]
							})
						]
					})
				]
			})
		]
	});
}
function useInvalidate$4(customerId) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}
function AddSuccessCriterion({ customerId, implementationId, team, contacts }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyDraft$1);
	const invalidate = useInvalidate$4(customerId);
	const create = useServerFn(addSuccessCriterion);
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			implementationId,
			...payload(draft)
		} }),
		onSuccess: async () => {
			await invalidate();
			setDraft(emptyDraft$1);
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$7,
		onClick: () => {
			mutation.reset();
			setDraft(emptyDraft$1);
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add success measure"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CriterionForm, {
			draft,
			setDraft,
			team,
			contacts,
			disabled: mutation.isPending
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$7,
					disabled: mutation.isPending || draft.description.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$7,
					disabled: mutation.isPending,
					onClick: () => {
						mutation.reset();
						setDraft(emptyDraft$1);
						setOpen(false);
					},
					children: "Cancel"
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] text-destructive",
					children: "Save failed — values kept"
				}) : null
			]
		})]
	});
}
function EditSuccessCriterion({ customerId, criterion, team, contacts }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(() => draftFrom(criterion));
	const invalidate = useInvalidate$4(customerId);
	const save = useServerFn(setSuccessCriterion);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: criterion.id,
			...payload(draft)
		} }),
		onSuccess: async () => {
			await invalidate();
			setEditing(false);
		}
	});
	if (!editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$7,
		onClick: () => {
			mutation.reset();
			setDraft(draftFrom(criterion));
			setEditing(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CriterionForm, {
			draft,
			setDraft,
			team,
			contacts,
			disabled: mutation.isPending
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$7,
					disabled: mutation.isPending || draft.description.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$7,
					disabled: mutation.isPending,
					onClick: () => {
						mutation.reset();
						setDraft(draftFrom(criterion));
						setEditing(false);
					},
					children: "Cancel"
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] text-destructive",
					children: "Save failed — values kept"
				}) : null
			]
		})]
	});
}
var inputClass$5 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$6 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass$6 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var utcToday$1 = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var nullable$4 = (v) => v.trim() === "" ? null : v.trim();
var emptyObservation$1 = () => ({
	observedValue: "",
	observedAt: utcToday$1(),
	observedBy: "",
	source: "",
	assessment: "",
	notes: "",
	evidenceId: ""
});
function useInvalidate$3(customerId) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}
function AddObservation({ customerId, criterionId, team, evidence }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyObservation$1);
	const invalidate = useInvalidate$3(customerId);
	const save = useServerFn(addSuccessCriterionObservation);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			successCriteriaId: criterionId,
			observedValue: draft.observedValue.trim(),
			observedAt: draft.observedAt,
			observedBy: nullable$4(draft.observedBy),
			source: nullable$4(draft.source),
			assessment: draft.assessment,
			notes: nullable$4(draft.notes),
			evidenceId: nullable$4(draft.evidenceId)
		} }),
		onSuccess: async () => {
			await invalidate();
			setDraft(emptyObservation$1());
			setOpen(false);
		}
	});
	const set = (patch) => setDraft({
		...draft,
		...patch
	});
	const valid = draft.observedValue.trim() !== "" && draft.observedAt !== "" && draft.assessment !== "";
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$6,
		onClick: () => {
			mutation.reset();
			setDraft(emptyObservation$1());
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Record result"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2 md:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Observed value"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass$5,
							"aria-label": "Observed value",
							value: draft.observedValue,
							disabled: mutation.isPending,
							onChange: (e) => set({ observedValue: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Observed date"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass$5,
							"aria-label": "Observed date",
							value: draft.observedAt,
							disabled: mutation.isPending,
							onChange: (e) => set({ observedAt: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Assessment"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$5,
							"aria-label": "Assessment",
							value: draft.assessment,
							disabled: mutation.isPending,
							onChange: (e) => set({ assessment: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Select"
							}), OBSERVATION_ASSESSMENTS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: a,
								children: humanize(a)
							}, a))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Observed by"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$5,
							"aria-label": "Observed by",
							value: draft.observedBy,
							disabled: mutation.isPending,
							onChange: (e) => set({ observedBy: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Not recorded"
							}), team.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: t.id,
								children: t.name
							}, t.id))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Source"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass$5,
							"aria-label": "Source",
							value: draft.source,
							placeholder: "Not set",
							disabled: mutation.isPending,
							onChange: (e) => set({ source: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$6,
							children: "Evidence"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$5,
							"aria-label": "Evidence",
							value: draft.evidenceId,
							disabled: mutation.isPending,
							onChange: (e) => set({ evidenceId: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: evidence.length ? "None" : "No evidence recorded"
							}), evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: e.id,
								children: e.title
							}, e.id))]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass$6,
					children: "Notes"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass$5,
					"aria-label": "Notes",
					value: draft.notes,
					placeholder: "Optional",
					disabled: mutation.isPending,
					onChange: (e) => set({ notes: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass$6,
						disabled: mutation.isPending || !valid,
						onClick: () => mutation.mutate(),
						children: mutation.isPending ? "Saving…" : "Save result"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass$6,
						disabled: mutation.isPending,
						onClick: () => {
							mutation.reset();
							setDraft(emptyObservation$1());
							setOpen(false);
						},
						children: "Cancel"
					}),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-destructive",
						children: "Save failed — values kept"
					}) : null
				]
			})
		]
	});
}
function CustomerConfirmationEditor({ customerId, implementationId, criterionId, existing, contacts, evidence }) {
	const initial = () => ({
		contactId: existing?.customer_contact_id ?? "",
		evidenceId: existing?.evidence_id ?? "",
		status: existing?.status ?? "pending"
	});
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(initial);
	const invalidate = useInvalidate$3(customerId);
	const create = useServerFn(addSuccessCriterionConfirmation);
	const update = useServerFn(setSuccessCriterionConfirmation);
	const mutation = useMutation({
		mutationFn: () => existing ? update({ data: {
			id: existing.id,
			status: draft.status,
			evidenceId: nullable$4(draft.evidenceId)
		} }) : create({ data: {
			implementationId,
			successCriteriaId: criterionId,
			customerContactId: draft.contactId,
			evidenceId: nullable$4(draft.evidenceId),
			status: draft.status
		} }),
		onSuccess: async () => {
			await invalidate();
			setOpen(false);
		}
	});
	const set = (patch) => setDraft({
		...draft,
		...patch
	});
	const valid = existing ? true : draft.contactId !== "";
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$6,
		onClick: () => {
			mutation.reset();
			setDraft(initial());
			setOpen(true);
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-3 w-3" }),
			" ",
			existing ? "Update confirmation" : "Record customer confirmation"
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid grid-cols-2 gap-2 md:grid-cols-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$6,
						children: "Customer contact"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass$5,
						"aria-label": "Customer contact",
						value: draft.contactId,
						disabled: mutation.isPending || !!existing,
						onChange: (e) => set({ contactId: e.target.value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: contacts.length ? "Select contact" : "No customer contacts recorded"
						}), contacts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: c.id,
							children: [
								c.name,
								" · ",
								c.role
							]
						}, c.id))]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$6,
						children: "Status"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: inputClass$5,
						"aria-label": "Confirmation status",
						value: draft.status,
						disabled: mutation.isPending,
						onChange: (e) => set({ status: e.target.value }),
						children: CONFIRMATION_STATUSES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: s,
							children: humanize(s)
						}, s))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$6,
						children: "Evidence"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass$5,
						"aria-label": "Confirmation evidence",
						value: draft.evidenceId,
						disabled: mutation.isPending,
						onChange: (e) => set({ evidenceId: e.target.value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: evidence.length ? "None" : "No evidence recorded"
						}), evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: e.id,
							children: e.title
						}, e.id))]
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$6,
					disabled: mutation.isPending || !valid,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$6,
					disabled: mutation.isPending,
					onClick: () => {
						mutation.reset();
						setDraft(initial());
						setOpen(false);
					},
					children: "Cancel"
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] text-destructive",
					children: "Save failed — values kept"
				}) : null
			]
		})]
	});
}
var inputClass$4 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$5 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass$2 = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass$5 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable$3 = (v) => v.trim() === "" ? null : v.trim();
var utcToday = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function useInvalidate$2(customerId) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}
var emptyArea = () => ({
	kind: "user_group",
	name: "",
	intendedUsage: "",
	ownerId: "",
	notes: "",
	intendedUsers: "",
	expectedFrequency: "",
	inUseDefinition: "",
	customerOwnerContactId: ""
});
var areaDraftOf = (area) => ({
	kind: area.kind,
	name: area.name,
	intendedUsage: area.intended_usage ?? "",
	ownerId: area.owner_id ?? "",
	notes: area.notes ?? "",
	intendedUsers: area.intended_users ?? "",
	expectedFrequency: area.expected_frequency ?? "",
	inUseDefinition: area.in_use_definition ?? "",
	customerOwnerContactId: area.customer_owner_contact_id ?? ""
});
function AreaForm({ draft, set, team, contacts, sowUsage, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid grid-cols-2 gap-2 md:grid-cols-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$5,
						children: "Kind"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: inputClass$4,
						"aria-label": "Adoption area kind",
						value: draft.kind,
						disabled,
						onChange: (e) => set({ kind: e.target.value }),
						children: ADOPTION_KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: k,
							children: ADOPTION_KIND_LABEL[k]
						}, k))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$5,
						children: "Name"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass$4,
						"aria-label": "Adoption area name",
						value: draft.name,
						disabled,
						onChange: (e) => set({ name: e.target.value })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5 md:col-span-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$5,
						children: "Intended use (from SOW)"
					}), sowUsage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						"aria-label": "Intended use from SOW (read only)",
						className: "rounded-sm border border-border bg-muted px-1.5 py-1 text-[12px] text-muted-foreground",
						children: sowUsage
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass$4,
						"aria-label": "Intended use",
						value: draft.intendedUsage,
						disabled,
						onChange: (e) => set({ intendedUsage: e.target.value })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$5,
						children: "Owner"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass$4,
						"aria-label": "Adoption area owner",
						value: draft.ownerId,
						disabled,
						onChange: (e) => set({ ownerId: e.target.value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "Unassigned"
						}), team.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: m.id,
							children: [
								m.name,
								" · ",
								m.role
							]
						}, m.id))]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5 md:col-span-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$5,
						children: "Notes"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass$4,
						"aria-label": "Adoption area notes",
						value: draft.notes,
						disabled,
						onChange: (e) => set({ notes: e.target.value })
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-sm border border-border/70 bg-muted/30 p-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: "Confirmed at kickoff"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-0.5 mb-1.5 text-[11px] text-muted-foreground",
					children: "Leave blank where the customer has not provided it. This records intended usage, not observed usage."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-2 gap-2 md:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$5,
								children: "Intended users (who)"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass$4,
								"aria-label": "Intended users",
								value: draft.intendedUsers,
								disabled,
								placeholder: "Not provided",
								onChange: (e) => set({ intendedUsers: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$5,
								children: "Intended use (what they do)"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass$4,
								"aria-label": "Intended use",
								value: draft.intendedUsage,
								disabled: disabled || Boolean(sowUsage),
								placeholder: sowUsage ? "Held as SOW source text above" : "Not provided",
								onChange: (e) => set({ intendedUsage: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$5,
								children: "Expected frequency / volume"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass$4,
								"aria-label": "Expected frequency",
								value: draft.expectedFrequency,
								disabled,
								placeholder: "Not provided",
								onChange: (e) => set({ expectedFrequency: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$5,
								children: "Definition of \"in use\""
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass$4,
								"aria-label": "Definition of in use",
								value: draft.inUseDefinition,
								disabled,
								placeholder: "Not provided",
								onChange: (e) => set({ inUseDefinition: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$5,
								children: "Customer-side owner"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
								className: inputClass$4,
								"aria-label": "Customer-side owner",
								value: draft.customerOwnerContactId,
								disabled,
								onChange: (e) => set({ customerOwnerContactId: e.target.value }),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "",
									children: "Not named"
								}), contacts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
									value: c.id,
									children: [
										c.name,
										" · ",
										c.role
									]
								}, c.id))]
							})]
						})
					]
				})
			]
		})]
	});
}
function AddAdoptionArea({ customerId, implementationId, team, contacts }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyArea);
	const invalidate = useInvalidate$2(customerId);
	const save = useServerFn(addAdoptionArea);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			implementationId,
			kind: draft.kind,
			name: draft.name.trim(),
			intendedUsage: nullable$3(draft.intendedUsage),
			ownerId: nullable$3(draft.ownerId),
			notes: nullable$3(draft.notes),
			intendedUsers: nullable$3(draft.intendedUsers),
			expectedFrequency: nullable$3(draft.expectedFrequency),
			inUseDefinition: nullable$3(draft.inUseDefinition),
			customerOwnerContactId: nullable$3(draft.customerOwnerContactId)
		} }),
		onSuccess: async () => {
			await invalidate();
			setDraft(emptyArea());
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$5,
		onClick: () => {
			mutation.reset();
			setDraft(emptyArea());
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add usage area"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AreaForm, {
				draft,
				set: (patch) => setDraft({
					...draft,
					...patch
				}),
				team,
				contacts,
				disabled: mutation.isPending
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$2,
					disabled: draft.name.trim() === "" || mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$5,
					disabled: mutation.isPending,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
function EditAdoptionArea({ customerId, area, team, contacts }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(() => areaDraftOf(area));
	const invalidate = useInvalidate$2(customerId);
	const save = useServerFn(setAdoptionArea);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: area.id,
			kind: draft.kind,
			name: draft.name.trim(),
			intendedUsage: nullable$3(draft.intendedUsage),
			ownerId: nullable$3(draft.ownerId),
			notes: nullable$3(draft.notes),
			intendedUsers: nullable$3(draft.intendedUsers),
			expectedFrequency: nullable$3(draft.expectedFrequency),
			inUseDefinition: nullable$3(draft.inUseDefinition),
			customerOwnerContactId: nullable$3(draft.customerOwnerContactId)
		} }),
		onSuccess: async () => {
			await invalidate();
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$5,
		onClick: () => {
			mutation.reset();
			setDraft(areaDraftOf(area));
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AreaForm, {
				draft,
				set: (patch) => setDraft({
					...draft,
					...patch
				}),
				team,
				contacts,
				sowUsage: area.intended_usage,
				disabled: mutation.isPending
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$2,
					disabled: draft.name.trim() === "" || mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$5,
					disabled: mutation.isPending,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
var emptyObservation = () => ({
	observedAt: utcToday(),
	observedBy: "",
	state: "",
	workaroundInUse: false,
	workaroundDescription: "",
	source: "",
	notes: "",
	evidenceId: ""
});
function AddAdoptionObservation({ customerId, areaId, team, evidence }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyObservation);
	const invalidate = useInvalidate$2(customerId);
	const save = useServerFn(addAdoptionObservation);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			adoptionAreaId: areaId,
			observedAt: draft.observedAt,
			observedBy: nullable$3(draft.observedBy),
			state: draft.state,
			workaroundInUse: draft.workaroundInUse,
			workaroundDescription: draft.workaroundInUse ? nullable$3(draft.workaroundDescription) : null,
			source: nullable$3(draft.source),
			notes: nullable$3(draft.notes),
			evidenceId: nullable$3(draft.evidenceId)
		} }),
		onSuccess: async () => {
			await invalidate();
			setDraft(emptyObservation());
			setOpen(false);
		}
	});
	const set = (patch) => setDraft({
		...draft,
		...patch
	});
	const valid = draft.state !== "" && draft.observedAt !== "";
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$5,
		onClick: () => {
			mutation.reset();
			setDraft(emptyObservation());
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Record usage"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2 md:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$5,
							children: "Observed date"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass$4,
							"aria-label": "Observed date",
							value: draft.observedAt,
							disabled: mutation.isPending,
							onChange: (e) => set({ observedAt: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$5,
							children: "Usage state"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$4,
							"aria-label": "Usage state",
							value: draft.state,
							disabled: mutation.isPending,
							onChange: (e) => set({ state: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Select…"
							}), ADOPTION_STATES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: s,
								children: humanize(s)
							}, s))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$5,
							children: "Observed by"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$4,
							"aria-label": "Observed by",
							value: draft.observedBy,
							disabled: mutation.isPending,
							onChange: (e) => set({ observedBy: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Not recorded"
							}), team.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
								value: m.id,
								children: [
									m.name,
									" · ",
									m.role
								]
							}, m.id))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$5,
							children: "Source"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass$4,
							"aria-label": "Observation source",
							value: draft.source,
							disabled: mutation.isPending,
							onChange: (e) => set({ source: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$5,
							children: "Evidence"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass$4,
							"aria-label": "Evidence",
							value: draft.evidenceId,
							disabled: mutation.isPending,
							onChange: (e) => set({ evidenceId: e.target.value }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "None"
							}), evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: e.id,
								children: e.title
							}, e.id))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex items-center gap-1.5 pt-4 text-[12px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							"aria-label": "Workaround still in use",
							checked: draft.workaroundInUse,
							disabled: mutation.isPending,
							onChange: (e) => set({ workaroundInUse: e.target.checked })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Workaround still in use" })]
					})
				]
			}),
			draft.workaroundInUse ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass$5,
					children: "What workaround"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass$4,
					"aria-label": "Workaround description",
					value: draft.workaroundDescription,
					disabled: mutation.isPending,
					onChange: (e) => set({ workaroundDescription: e.target.value })
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass$5,
					children: "Notes"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass$4,
					"aria-label": "Observation notes",
					value: draft.notes,
					disabled: mutation.isPending,
					onChange: (e) => set({ notes: e.target.value })
				})]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$2,
					disabled: !valid || mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$5,
					disabled: mutation.isPending,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
var inputClass$3 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass$1 = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$4 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass$1 = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass$4 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable$2 = (v) => v.trim() === "" ? null : v.trim();
var dateOnly = (v) => v ? String(v).slice(0, 10) : "";
function useInvalidate$1(customerId) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}
function Grid({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid grid-cols-2 gap-2 md:grid-cols-4",
		children
	});
}
function Text({ label, value, onChange, disabled, span, placeholder }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: `block space-y-0.5 ${span ?? ""}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			placeholder: placeholder ?? "Optional",
			onChange: (e) => onChange(e.target.value)
		})]
	});
}
function Area({ label, value, onChange, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5 md:col-span-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
			className: areaClass$1,
			"aria-label": label,
			rows: 2,
			value,
			disabled,
			placeholder: "Optional",
			onChange: (e) => onChange(e.target.value)
		})]
	});
}
function DateField({ label, value, onChange, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "date",
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			onChange: (e) => onChange(e.target.value)
		})]
	});
}
function Enum({ label, value, options, onChange, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			onChange: (e) => onChange(e.target.value),
			children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: o,
				children: humanize(o)
			}, o))
		})]
	});
}
function Person({ label, value, team, onChange, disabled, emptyLabel = "Unassigned" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			onChange: (e) => onChange(e.target.value),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: emptyLabel
			}), team.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
				value: m.id,
				children: [
					m.name,
					" · ",
					m.role
				]
			}, m.id))]
		})]
	});
}
function LinkField({ label, value, options, onChange, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			onChange: (e) => onChange(e.target.value),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "Not linked"
			}), options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: o.id,
				children: o.title
			}, o.id))]
		})]
	});
}
/**
* Generic shell for the deferred write interaction only — the fields, labels
* and vocabulary stay specific to each record type (this is not a universal
* record editor).
*/
function WriteShell({ mode, addLabel, empty, from, canSave, submit, render, customerId }) {
	const initial = mode === "edit" && from ? from : empty;
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(initial);
	const invalidate = useInvalidate$1(customerId);
	const mutation = useMutation({
		mutationFn: () => submit(draft),
		onSuccess: async () => {
			await invalidate();
			if (mode === "add") setDraft(empty());
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass$4,
		onClick: () => {
			mutation.reset();
			setDraft(initial());
			setOpen(true);
		},
		children: [mode === "add" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), mode === "add" ? addLabel : "Edit"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			render(draft, (patch) => setDraft({
				...draft,
				...patch
			}), mutation.isPending),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass$1,
					disabled: !canSave(draft) || mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass$4,
					disabled: mutation.isPending,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
var emptyRequirement = () => ({
	title: "",
	description: "",
	category: "",
	priority: "must_have",
	status: "open",
	scopeStatus: "original",
	source: "",
	createdBy: ""
});
var requirementPayload = (d) => ({
	title: d.title.trim(),
	description: nullable$2(d.description),
	category: nullable$2(d.category),
	priority: d.priority,
	status: d.status,
	scopeStatus: d.scopeStatus,
	source: nullable$2(d.source),
	createdBy: nullable$2(d.createdBy)
});
function RequirementFields(draft, set, disabled, team) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Requirement title",
			span: "md:col-span-2",
			placeholder: "What the customer needs",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Category",
			value: draft.category,
			onChange: (category) => set({ category }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Source",
			placeholder: "SOW, kickoff, workshop…",
			value: draft.source,
			onChange: (source) => set({ source }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Priority",
			value: draft.priority,
			options: REQUIREMENT_PRIORITIES,
			onChange: (priority) => set({ priority }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: REQUIREMENT_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Scope status",
			value: draft.scopeStatus,
			options: REQUIREMENT_SCOPE_STATUSES,
			onChange: (scopeStatus) => set({ scopeStatus }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Captured by",
			value: draft.createdBy,
			team,
			onChange: (createdBy) => set({ createdBy }),
			disabled,
			emptyLabel: "Not recorded"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Description",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		})
	] });
}
function AddRequirement({ customerId, implementationId, team }) {
	const save = useServerFn(addRequirement);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add requirement",
		customerId,
		empty: emptyRequirement,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...requirementPayload(d)
		} }),
		render: (d, set, disabled) => RequirementFields(d, set, disabled, team)
	});
}
function EditRequirement({ customerId, requirement, team }) {
	const save = useServerFn(setRequirement);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyRequirement,
		from: () => ({
			title: requirement.title ?? "",
			description: requirement.description ?? "",
			category: requirement.category ?? "",
			priority: requirement.priority ?? "must_have",
			status: requirement.status ?? "open",
			scopeStatus: requirement.scope_status ?? "original",
			source: requirement.source ?? "",
			createdBy: requirement.created_by ?? ""
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: requirement.id,
			...requirementPayload(d)
		} }),
		render: (d, set, disabled) => RequirementFields(d, set, disabled, team)
	});
}
var emptyRisk = () => ({
	title: "",
	description: "",
	severity: "medium",
	likelihood: "medium",
	status: "open",
	ownerId: "",
	impact: "",
	mitigation: "",
	resolvedAt: ""
});
var riskPayload = (d) => ({
	title: d.title.trim(),
	description: nullable$2(d.description),
	severity: d.severity,
	likelihood: d.likelihood,
	status: d.status,
	ownerId: nullable$2(d.ownerId),
	impact: nullable$2(d.impact),
	mitigation: nullable$2(d.mitigation),
	resolvedAt: nullable$2(d.resolvedAt)
});
function RiskFields(draft, set, disabled, team) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Risk title",
			span: "md:col-span-2",
			placeholder: "What could go wrong",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Severity",
			value: draft.severity,
			options: RISK_SEVERITIES,
			onChange: (severity) => set({ severity }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Likelihood",
			value: draft.likelihood,
			options: RISK_LIKELIHOODS,
			onChange: (likelihood) => set({ likelihood }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: RISK_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Risk owner",
			value: draft.ownerId,
			team,
			onChange: (ownerId) => set({ ownerId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Resolved on",
			value: draft.resolvedAt,
			onChange: (resolvedAt) => set({ resolvedAt }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Impact if it happens",
			value: draft.impact,
			onChange: (impact) => set({ impact }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Description",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Mitigation",
			value: draft.mitigation,
			onChange: (mitigation) => set({ mitigation }),
			disabled
		})
	] });
}
function AddRisk({ customerId, implementationId, team }) {
	const save = useServerFn(addRisk);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add risk",
		customerId,
		empty: emptyRisk,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...riskPayload(d)
		} }),
		render: (d, set, disabled) => RiskFields(d, set, disabled, team)
	});
}
function EditRisk({ customerId, risk, team }) {
	const save = useServerFn(setRisk);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyRisk,
		from: () => ({
			title: risk.title ?? "",
			description: risk.description ?? "",
			severity: risk.severity ?? "medium",
			likelihood: risk.likelihood ?? "medium",
			status: risk.status ?? "open",
			ownerId: risk.owner_id ?? "",
			impact: risk.impact ?? "",
			mitigation: risk.mitigation ?? "",
			resolvedAt: dateOnly(risk.resolved_at)
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: risk.id,
			...riskPayload(d)
		} }),
		render: (d, set, disabled) => RiskFields(d, set, disabled, team)
	});
}
var emptyIssue = () => ({
	title: "",
	description: "",
	severity: "medium",
	status: "open",
	ownerId: "",
	resolution: "",
	resolvedAt: ""
});
var issuePayload = (d) => ({
	title: d.title.trim(),
	description: nullable$2(d.description),
	severity: d.severity,
	status: d.status,
	ownerId: nullable$2(d.ownerId),
	resolution: nullable$2(d.resolution),
	resolvedAt: nullable$2(d.resolvedAt)
});
function IssueFields(draft, set, disabled, team) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Issue title",
			span: "md:col-span-2",
			placeholder: "What is currently broken or blocked",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Severity",
			value: draft.severity,
			options: ISSUE_SEVERITIES,
			onChange: (severity) => set({ severity }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: ISSUE_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Issue owner",
			value: draft.ownerId,
			team,
			onChange: (ownerId) => set({ ownerId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Resolved on",
			value: draft.resolvedAt,
			onChange: (resolvedAt) => set({ resolvedAt }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Description",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Resolution",
			value: draft.resolution,
			onChange: (resolution) => set({ resolution }),
			disabled
		})
	] });
}
function AddIssue({ customerId, implementationId, team }) {
	const save = useServerFn(addIssue);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add issue",
		customerId,
		empty: emptyIssue,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...issuePayload(d)
		} }),
		render: (d, set, disabled) => IssueFields(d, set, disabled, team)
	});
}
function EditIssue({ customerId, issue, team }) {
	const save = useServerFn(setIssue);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyIssue,
		from: () => ({
			title: issue.title ?? "",
			description: issue.description ?? "",
			severity: issue.severity ?? "medium",
			status: issue.status ?? "open",
			ownerId: issue.owner_id ?? "",
			resolution: issue.resolution ?? "",
			resolvedAt: dateOnly(issue.resolved_at)
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: issue.id,
			...issuePayload(d)
		} }),
		render: (d, set, disabled) => IssueFields(d, set, disabled, team)
	});
}
var emptyEscalation = () => ({
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
	resolvedAt: ""
});
var escalationPayload = (d) => ({
	title: d.title.trim(),
	description: nullable$2(d.description),
	severity: d.severity,
	status: d.status,
	escalationType: nullable$2(d.escalationType),
	ownerId: nullable$2(d.ownerId),
	raisedBy: nullable$2(d.raisedBy),
	relatedIssueId: nullable$2(d.relatedIssueId),
	relatedRiskId: nullable$2(d.relatedRiskId),
	resolutionSummary: nullable$2(d.resolutionSummary),
	resolvedAt: nullable$2(d.resolvedAt)
});
function EscalationFields(draft, set, disabled, team, risks, issues) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Escalation title",
			span: "md:col-span-2",
			placeholder: "What has been escalated",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Severity",
			value: draft.severity,
			options: ESCALATION_SEVERITIES,
			onChange: (severity) => set({ severity }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: ESCALATION_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Escalation type",
			placeholder: "commercial, technical…",
			value: draft.escalationType,
			onChange: (escalationType) => set({ escalationType }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Escalation owner",
			value: draft.ownerId,
			team,
			onChange: (ownerId) => set({ ownerId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Raised by",
			value: draft.raisedBy,
			team,
			onChange: (raisedBy) => set({ raisedBy }),
			disabled,
			emptyLabel: "Not recorded"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Resolved on",
			value: draft.resolvedAt,
			onChange: (resolvedAt) => set({ resolvedAt }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkField, {
			label: "Linked issue",
			value: draft.relatedIssueId,
			options: issues,
			onChange: (relatedIssueId) => set({ relatedIssueId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkField, {
			label: "Linked risk",
			value: draft.relatedRiskId,
			options: risks,
			onChange: (relatedRiskId) => set({ relatedRiskId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Description",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Resolution summary",
			value: draft.resolutionSummary,
			onChange: (resolutionSummary) => set({ resolutionSummary }),
			disabled
		})
	] });
}
function AddEscalation({ customerId, implementationId, team, risks, issues }) {
	const save = useServerFn(addEscalation);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add escalation",
		customerId,
		empty: emptyEscalation,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...escalationPayload(d)
		} }),
		render: (d, set, disabled) => EscalationFields(d, set, disabled, team, risks, issues)
	});
}
function EditEscalation({ customerId, escalation, team, risks, issues }) {
	const save = useServerFn(setEscalation);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyEscalation,
		from: () => ({
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
			resolvedAt: dateOnly(escalation.resolved_at)
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: escalation.id,
			...escalationPayload(d)
		} }),
		render: (d, set, disabled) => EscalationFields(d, set, disabled, team, risks, issues)
	});
}
var emptyDecision = () => ({
	title: "",
	description: "",
	rationale: "",
	decidedBy: "",
	decisionDate: "",
	status: "active"
});
var decisionPayload = (d) => ({
	title: d.title.trim(),
	description: nullable$2(d.description),
	rationale: nullable$2(d.rationale),
	decidedBy: nullable$2(d.decidedBy),
	decisionDate: nullable$2(d.decisionDate),
	status: d.status
});
function DecisionFields(draft, set, disabled) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Decision title",
			span: "md:col-span-2",
			placeholder: "What was decided",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Decided by",
			placeholder: "Person or group",
			value: draft.decidedBy,
			onChange: (decidedBy) => set({ decidedBy }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Decision date",
			value: draft.decisionDate,
			onChange: (decisionDate) => set({ decisionDate }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: DECISION_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Context",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Reason",
			value: draft.rationale,
			onChange: (rationale) => set({ rationale }),
			disabled
		})
	] });
}
function AddDecision({ customerId, implementationId }) {
	const save = useServerFn(addDecision);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add decision",
		customerId,
		empty: emptyDecision,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...decisionPayload(d)
		} }),
		render: (d, set, disabled) => DecisionFields(d, set, disabled)
	});
}
function EditDecision({ customerId, decision }) {
	const save = useServerFn(setDecision);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyDecision,
		from: () => ({
			title: decision.title ?? "",
			description: decision.description ?? "",
			rationale: decision.rationale ?? "",
			decidedBy: decision.decided_by ?? "",
			decisionDate: dateOnly(decision.decision_date),
			status: decision.status ?? "active"
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: decision.id,
			...decisionPayload(d)
		} }),
		render: (d, set, disabled) => DecisionFields(d, set, disabled)
	});
}
var emptyCommitment = () => ({
	description: "",
	committedTo: "customer",
	ownerId: "",
	madeBy: "",
	dueDate: "",
	status: "open",
	fulfilledAt: ""
});
var commitmentPayload = (d) => ({
	description: d.description.trim(),
	committedTo: d.committedTo,
	ownerId: nullable$2(d.ownerId),
	madeBy: nullable$2(d.madeBy),
	dueDate: nullable$2(d.dueDate),
	status: d.status,
	fulfilledAt: nullable$2(d.fulfilledAt)
});
function CommitmentFields(draft, set, disabled, team) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "What was committed",
			span: "md:col-span-2",
			placeholder: "The promise as it was made",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Committed to",
			value: draft.committedTo,
			options: COMMITMENT_AUDIENCES,
			onChange: (committedTo) => set({ committedTo }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: COMMITMENT_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Commitment owner",
			value: draft.ownerId,
			team,
			onChange: (ownerId) => set({ ownerId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Made by",
			value: draft.madeBy,
			team,
			onChange: (madeBy) => set({ madeBy }),
			disabled,
			emptyLabel: "Not recorded"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Due date",
			value: draft.dueDate,
			onChange: (dueDate) => set({ dueDate }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Fulfilled on",
			value: draft.fulfilledAt,
			onChange: (fulfilledAt) => set({ fulfilledAt }),
			disabled
		})
	] });
}
function AddCommitment({ customerId, implementationId, team }) {
	const save = useServerFn(addCommitment);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add commitment",
		customerId,
		empty: emptyCommitment,
		canSave: (d) => d.description.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...commitmentPayload(d)
		} }),
		render: (d, set, disabled) => CommitmentFields(d, set, disabled, team)
	});
}
function EditCommitment({ customerId, commitment, team }) {
	const save = useServerFn(setCommitment);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyCommitment,
		from: () => ({
			description: commitment.description ?? "",
			committedTo: commitment.committed_to ?? "customer",
			ownerId: commitment.owner_id ?? "",
			madeBy: commitment.made_by ?? "",
			dueDate: dateOnly(commitment.due_date),
			status: commitment.status ?? "open",
			fulfilledAt: dateOnly(commitment.fulfilled_at)
		}),
		canSave: (d) => d.description.trim() !== "",
		submit: (d) => save({ data: {
			id: commitment.id,
			...commitmentPayload(d)
		} }),
		render: (d, set, disabled) => CommitmentFields(d, set, disabled, team)
	});
}
var relationValue = (type, id) => type && id ? `${type}:${id}` : "";
function RelationField({ label, value, options, onChange, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5 md:col-span-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass$4,
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			className: inputClass$3,
			"aria-label": label,
			value,
			disabled,
			onChange: (e) => onChange(e.target.value),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "Not linked"
			}), options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
				value: `${o.type}:${o.id}`,
				children: [
					humanize(o.type),
					": ",
					o.title
				]
			}, `${o.type}:${o.id}`))]
		})]
	});
}
var emptyEvidence = () => ({
	type: "document",
	title: "",
	description: "",
	url: "",
	uploadedBy: "",
	relation: ""
});
var evidencePayload = (d) => {
	const [type, id] = d.relation ? d.relation.split(":") : [null, null];
	return {
		type: d.type,
		title: d.title.trim(),
		description: nullable$2(d.description),
		url: nullable$2(d.url),
		uploadedBy: nullable$2(d.uploadedBy),
		relatedEntityType: type ?? null,
		relatedEntityId: id ?? null
	};
};
function EvidenceFields(draft, set, disabled, team, related) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Proof title",
			span: "md:col-span-2",
			placeholder: "What this proves",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Type",
			value: draft.type,
			options: EVIDENCE_TYPES,
			onChange: (type) => set({ type }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Uploaded by",
			value: draft.uploadedBy,
			team,
			onChange: (uploadedBy) => set({ uploadedBy }),
			disabled,
			emptyLabel: "Not recorded"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Link",
			span: "md:col-span-2",
			placeholder: "https://…",
			value: draft.url,
			onChange: (url) => set({ url }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RelationField, {
			label: "Proof for",
			value: draft.relation,
			options: related,
			onChange: (relation) => set({ relation }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
			label: "Description",
			value: draft.description,
			onChange: (description) => set({ description }),
			disabled
		})
	] });
}
function AddEvidence({ customerId, implementationId, team, related }) {
	const save = useServerFn(addEvidence);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add proof",
		customerId,
		empty: emptyEvidence,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...evidencePayload(d)
		} }),
		render: (d, set, disabled) => EvidenceFields(d, set, disabled, team, related)
	});
}
function EditEvidence({ customerId, evidence, team, related }) {
	const save = useServerFn(setEvidence);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyEvidence,
		from: () => ({
			type: evidence.type ?? "document",
			title: evidence.title ?? "",
			description: evidence.description ?? "",
			url: evidence.url ?? "",
			uploadedBy: evidence.uploaded_by ?? "",
			relation: relationValue(evidence.related_entity_type, evidence.related_entity_id)
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: evidence.id,
			...evidencePayload(d)
		} }),
		render: (d, set, disabled) => EvidenceFields(d, set, disabled, team, related)
	});
}
var emptyApproval = () => ({
	title: "",
	status: "pending",
	approverName: "",
	approverRole: "",
	customerContactId: "",
	evidenceId: "",
	decidedAt: "",
	relation: ""
});
var approvalPayload = (d) => {
	const [type, id] = d.relation ? d.relation.split(":") : [null, null];
	return {
		title: d.title.trim(),
		status: d.status,
		approverName: nullable$2(d.approverName),
		approverRole: nullable$2(d.approverRole),
		customerContactId: nullable$2(d.customerContactId),
		evidenceId: nullable$2(d.evidenceId),
		decidedAt: nullable$2(d.decidedAt),
		approvedEntityType: type ?? null,
		approvedEntityId: id ?? null
	};
};
function ApprovalFields(draft, set, disabled, related, evidenceOptions, contacts) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Grid, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "What is being approved",
			span: "md:col-span-2",
			placeholder: "Approval request title",
			value: draft.title,
			onChange: (title) => set({ title }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Enum, {
			label: "Status",
			value: draft.status,
			options: APPROVAL_STATUSES,
			onChange: (status) => set({ status }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DateField, {
			label: "Decided on",
			value: draft.decidedAt,
			onChange: (decidedAt) => set({ decidedAt }),
			disabled: disabled || draft.status === "pending"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Approver name",
			value: draft.approverName,
			onChange: (approverName) => set({ approverName }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {
			label: "Approver role",
			value: draft.approverRole,
			onChange: (approverRole) => set({ approverRole }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Person, {
			label: "Customer contact",
			value: draft.customerContactId,
			team: contacts,
			onChange: (customerContactId) => set({ customerContactId }),
			disabled,
			emptyLabel: "Not recorded"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkField, {
			label: "Supporting proof",
			value: draft.evidenceId,
			options: evidenceOptions,
			onChange: (evidenceId) => set({ evidenceId }),
			disabled
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RelationField, {
			label: "Approves",
			value: draft.relation,
			options: related,
			onChange: (relation) => set({ relation }),
			disabled
		})
	] });
}
function AddApproval({ customerId, implementationId, related, evidenceOptions, contacts }) {
	const save = useServerFn(addApproval);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "add",
		addLabel: "Add approval",
		customerId,
		empty: emptyApproval,
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			implementationId,
			...approvalPayload(d)
		} }),
		render: (d, set, disabled) => ApprovalFields(d, set, disabled, related, evidenceOptions, contacts)
	});
}
function EditApproval({ customerId, approval, related, evidenceOptions, contacts }) {
	const save = useServerFn(setApproval);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WriteShell, {
		mode: "edit",
		addLabel: "Edit",
		customerId,
		empty: emptyApproval,
		from: () => ({
			title: approval.title ?? "",
			status: approval.status ?? "pending",
			approverName: approval.approver_name ?? "",
			approverRole: approval.approver_role ?? "",
			customerContactId: approval.customer_contact_id ?? "",
			evidenceId: approval.evidence_id ?? "",
			decidedAt: dateOnly(approval.decided_at),
			relation: relationValue(approval.approved_entity_type, approval.approved_entity_id)
		}),
		canSave: (d) => d.title.trim() !== "",
		submit: (d) => save({ data: {
			id: approval.id,
			...approvalPayload(d)
		} }),
		render: (d, set, disabled) => ApprovalFields(d, set, disabled, related, evidenceOptions, contacts)
	});
}
function groupByStage$1(entries) {
	const buckets = /* @__PURE__ */ new Map();
	const unmapped = [];
	for (const entry of entries) {
		const id = STAGE_ALIASES[entry.stage.lifecycleStage ?? ""] ?? entry.stage.lifecycleStage ?? "";
		if (LIFECYCLE_STAGES.some((s) => s.id === id)) buckets.set(id, [...buckets.get(id) ?? [], entry]);
		else unmapped.push(entry);
	}
	const groups = LIFECYCLE_STAGES.filter((s) => buckets.has(s.id)).map((s) => ({
		label: s.label,
		stages: buckets.get(s.id)
	}));
	if (unmapped.length > 0) groups.push({
		label: "Not matched to a stage",
		stages: unmapped
	});
	return groups;
}
function safeFileName(s) {
	return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "sow-analysis";
}
/**
* Writes the analysis and the stage-grouped journey to a PDF a stakeholder can
* read without the app. Nothing is sent to a server — the file is built in the
* browser and downloaded.
*/
function downloadSowAnalysisPdf({ analysis, customerName, sowName, analysedAt, startDate, overrides = {} }) {
	const doc = new import_jspdf_node_min.jsPDF({
		unit: "pt",
		format: "a4"
	});
	const marginX = 48;
	const marginTop = 56;
	const bottom = doc.internal.pageSize.getHeight() - 56;
	const width = doc.internal.pageSize.getWidth() - 96;
	let y = marginTop;
	const space = (needed) => {
		if (y + needed > bottom) {
			doc.addPage();
			y = marginTop;
		}
	};
	const text = (value, opts = {}) => {
		const size = opts.size ?? 10;
		const indent = opts.indent ?? 0;
		doc.setFont("helvetica", opts.style ?? "normal");
		doc.setFontSize(size);
		doc.setTextColor(opts.color ?? 30);
		const lines = doc.splitTextToSize(value, width - indent);
		for (const line of lines) {
			space(size + 4);
			doc.text(line, marginX + indent, y);
			y += size + 3;
		}
		y += opts.gap ?? 0;
	};
	const heading = (value) => {
		space(34);
		y += 8;
		text(value, {
			size: 12,
			style: "bold",
			gap: 2
		});
		space(8);
		doc.setDrawColor(210);
		doc.line(marginX, y - 4, marginX + width, y - 4);
		y += 4;
	};
	text("SOW analysis and proposed journey", {
		size: 17,
		style: "bold",
		gap: 4
	});
	text(customerName, {
		size: 12,
		gap: 2
	});
	text(`Source document: ${sowName ?? "attached SOW"} · Generated ${analysedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, {
		size: 9,
		color: 110,
		gap: 6
	});
	text("Draft for discussion. The extracted section reflects what the SOW says; the journey is a proposal that a TIS must confirm before it becomes the plan.", {
		size: 9,
		style: "italic",
		color: 110,
		gap: 4
	});
	if (analysis.summary) {
		heading("Summary");
		text(analysis.summary);
	}
	if (analysis.problem) {
		heading("Problem reading the document");
		text(analysis.problem);
	}
	heading("What the SOW says");
	for (const section of EXTRACTION_SECTIONS) {
		const findings = analysis.extraction[section.key];
		if (findings.length === 0) continue;
		space(30);
		y += 4;
		text(section.label, {
			size: 10,
			style: "bold",
			gap: 1
		});
		for (const f of findings) {
			text(`• ${f.text}${f.confidence !== "stated" ? ` (${f.confidence})` : ""}`, { indent: 10 });
			if (f.quote) text(`“${f.quote}”`, {
				size: 8.5,
				style: "italic",
				color: 120,
				indent: 22
			});
		}
	}
	heading("Timeline stated in the SOW");
	const window = deliveryWindowLabel(analysis);
	text(window ? `Overall duration: ${window}.` : "The SOW states no overall delivery duration.");
	if (analysis.deliveryWindow.startCondition) text(`Starts on: ${analysis.deliveryWindow.startCondition}`, { indent: 10 });
	for (const d of analysis.deliveryWindow.delayConditions) text(`Delay condition: ${d}`, { indent: 10 });
	if (analysis.deliveryWindow.quote) text(`“${analysis.deliveryWindow.quote}”`, {
		size: 8.5,
		style: "italic",
		color: 120,
		indent: 10
	});
	heading("AI-proposed planning timeline by stage");
	const timings = proposedTimings(analysis, startDate ?? null, overrides);
	text(`${startDate ? `Proposed dates are counted from the recorded start date (${startDate.slice(0, 10)}).` : "Timing is shown in relative weeks; no calendar dates are proposed."} Estimated from the scope and dependencies the SOW describes — a planning recommendation, not committed dates and not an even split of the total.`, {
		size: 9,
		style: "italic",
		color: 110,
		gap: 4
	});
	const groups = groupByStage$1(analysis.proposedJourney.map((stage, i) => ({
		stage,
		timing: timings[i] ?? null
	})));
	if (groups.length === 0) text("No journey was proposed from this document.");
	for (const group of groups) {
		space(40);
		y += 6;
		text(group.label.toUpperCase(), {
			size: 9,
			style: "bold",
			color: 110,
			gap: 1
		});
		for (const { stage, timing } of group.stages) {
			text(timing ? `${timing.weeks}${timing.dates ? ` · ${timing.dates}` : ""} · ${TIMING_SOURCE_LABEL[timing.source]}${timing.overlapsWith.length > 0 ? " · overlaps" : ""}` : "Timing not proposed — insufficient information in the SOW", {
				size: 8.5,
				color: 110,
				gap: 0
			});
			text(stage.name, {
				size: 10.5,
				style: "bold",
				gap: 1
			});
			if (stage.purpose) text(stage.purpose, { indent: 10 });
			if (timing?.statedText) text(`SOW timing: ${timing.statedText}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (timing?.rationale) text(`Why this duration: ${timing.rationale}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (timing?.dependencyDriver) text(`Timing depends on: ${timing.dependencyDriver}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (timing && timing.overlapsWith.length > 0) text(`Runs alongside: ${timing.overlapsWith.join("; ")}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (timing?.beyondSowWindow) text("Extends past the delivery window the SOW states.", {
				size: 9,
				color: 110,
				indent: 16
			});
			for (const w of stage.workstreams) text(`• ${w}`, { indent: 16 });
			if (stage.dependencies.length > 0) text(`Depends on: ${stage.dependencies.join("; ")}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (stage.customerResponsibilities.length > 0) text(`Customer has to: ${stage.customerResponsibilities.join("; ")}`, {
				size: 9,
				color: 110,
				indent: 16
			});
			if (stage.acceptanceCriteria.length > 0) text(`Accepted when: ${stage.acceptanceCriteria.join("; ")}`, {
				size: 9,
				color: 110,
				indent: 16,
				gap: 4
			});
			y += 4;
		}
	}
	if (analysis.assumptions.length > 0) {
		heading("Assumptions made");
		for (const a of analysis.assumptions) text(`• ${a}`, { indent: 10 });
	}
	if (analysis.gaps.length > 0) {
		heading("Gaps to confirm with the customer");
		for (const g of analysis.gaps) text(`• ${g}`, { indent: 10 });
	}
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i += 1) {
		doc.setPage(i);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8);
		doc.setTextColor(140);
		doc.text(`${customerName} · SOW analysis · Page ${i} of ${pages}`, marginX, bottom + 28);
	}
	doc.save(`${safeFileName(customerName)}-sow-analysis.pdf`);
}
var buttonClass$3 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryButtonClass = "inline-flex items-center gap-1 rounded-sm border border-foreground/30 bg-foreground/90 px-2 py-1 text-[11px] font-medium text-background hover:bg-foreground disabled:opacity-50";
var labelClass$3 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function ConfidenceTag({ confidence }) {
	if (confidence === "stated") return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "ml-1.5 rounded-sm border border-border px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground",
		title: CONFIDENCE_LABEL[confidence],
		children: confidence
	});
}
function FindingList({ findings }) {
	if (findings.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[12px] text-muted-foreground",
		children: "Nothing found in the SOW."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "space-y-1",
		children: findings.map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "text-[12px] leading-snug",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-foreground",
					children: f.text
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfidenceTag, { confidence: f.confidence }),
				f.quote ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "mt-0.5 block border-l border-border pl-2 text-[11px] italic text-muted-foreground",
					children: [
						"“",
						f.quote,
						"”"
					]
				}) : null
			]
		}, i))
	});
}
/** Group the proposed stages under the team's own lifecycle stages, in order. */
function groupByStage(entries) {
	const buckets = /* @__PURE__ */ new Map();
	const unmapped = [];
	for (const entry of entries) {
		const raw = entry.stage.lifecycleStage ?? "";
		const id = STAGE_ALIASES[raw] ?? raw;
		if (LIFECYCLE_STAGES.some((s) => s.id === id)) {
			const list = buckets.get(id) ?? [];
			list.push(entry);
			buckets.set(id, list);
		} else unmapped.push(entry);
	}
	const groups = LIFECYCLE_STAGES.filter((s) => buckets.has(s.id)).map((s) => ({
		id: s.id,
		label: s.label,
		stages: buckets.get(s.id)
	}));
	if (unmapped.length > 0) groups.push({
		id: "unmapped",
		label: "Not matched to a stage",
		stages: unmapped
	});
	return groups;
}
function Checkbox({ checked, disabled, onChange, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex items-start gap-1.5 text-[12px] leading-snug text-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "checkbox",
			className: "mt-0.5 h-3 w-3",
			checked,
			disabled,
			onChange: (e) => onChange(e.target.checked)
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children })]
	});
}
/**
* Reads the SOW attached to the implementation, proposes a journey grouped by
* the existing lifecycle stages, and lets the TIS review before anything is
* written. Applying is additive: existing information is never replaced.
*/
function SowAnalysisPanel({ customerId, customerName, implementationId, sowDocumentUrl, sowDocumentName, team, currentGoals, requirementCount, successMeasureCount, startDate }) {
	const queryClient = useQueryClient();
	const analyze = useServerFn(analyzeSowDocument);
	const applyProposal = useServerFn(applySowProposalToImplementation);
	const attachSow = useServerFn(setSowDocumentForImplementation);
	const upload = useServerFn(uploadAttachment);
	const [runs, setRuns] = (0, import_react.useState)([]);
	const [activeId, setActiveId] = (0, import_react.useState)(null);
	const [group, setGroup] = (0, import_react.useState)("");
	const [authorId, setAuthorId] = (0, import_react.useState)("");
	const [newFile, setNewFile] = (0, import_react.useState)(null);
	/** Elapsed seconds while a run is in flight, so a slow read looks busy, not stuck. */
	const [elapsed, setElapsed] = (0, import_react.useState)(0);
	const [applyGoals, setApplyGoals] = (0, import_react.useState)(true);
	const [applyNote, setApplyNote] = (0, import_react.useState)(true);
	const [pickedRequirements, setPickedRequirements] = (0, import_react.useState)({});
	const [pickedMeasures, setPickedMeasures] = (0, import_react.useState)({});
	/** TIS adjustments to proposed weeks, per run id then journey index. */
	const [adjustments, setAdjustments] = (0, import_react.useState)({});
	const resetSelections = (a) => {
		setApplyGoals(true);
		setApplyNote(true);
		setPickedRequirements(Object.fromEntries(a.extraction.requirements.map((_, i) => [i, true])));
		setPickedMeasures(Object.fromEntries(a.extraction.successMeasures.map((_, i) => [i, true])));
	};
	const run = useMutation({
		mutationFn: async () => {
			if (newFile) {
				if (newFile.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "sow",
					fileName: newFile.name,
					contentType: newFile.type || "application/octet-stream",
					dataBase64: await fileToBase64(newFile)
				} });
				await attachSow({ data: {
					implementationId,
					documentUrl: stored.path,
					documentName: stored.name
				} });
				await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			}
			return analyze({ data: { implementationId } });
		},
		onSuccess: (r) => {
			const entry = {
				id: Date.now(),
				analysis: r.analysis,
				sowName: r.sowName,
				at: /* @__PURE__ */ new Date(),
				applied: null
			};
			setRuns((prev) => [entry, ...prev]);
			setActiveId(entry.id);
			setNewFile(null);
			resetSelections(r.analysis);
		}
	});
	(0, import_react.useEffect)(() => {
		if (!run.isPending) {
			setElapsed(0);
			return;
		}
		setElapsed(0);
		const t = setInterval(() => setElapsed((s) => s + 1), 1e3);
		return () => clearInterval(t);
	}, [run.isPending]);
	const active = runs.find((r) => r.id === activeId) ?? null;
	const analysis = active?.analysis;
	const applied = active?.applied ?? null;
	const overrides = activeId == null ? {} : adjustments[activeId] ?? {};
	const timings = (0, import_react.useMemo)(() => analysis ? proposedTimings(analysis, startDate ?? null, overrides) : [], [
		analysis,
		startDate,
		overrides
	]);
	const groups = (0, import_react.useMemo)(() => analysis ? groupByStage(analysis.proposedJourney.map((stage, i) => ({
		index: i,
		stage,
		timing: timings[i] ?? null
	}))) : [], [analysis, timings]);
	const setOverride = (index, next) => {
		if (activeId == null) return;
		setAdjustments((prev) => {
			const forRun = { ...prev[activeId] ?? {} };
			if (next) forRun[index] = next;
			else delete forRun[index];
			return {
				...prev,
				[activeId]: forRun
			};
		});
	};
	const proposedGoals = (0, import_react.useMemo)(() => analysis ? analysis.extraction.objectives.map((o) => `• ${o.text}`).join("\n") : "", [analysis]);
	const apply = useMutation({
		mutationFn: () => {
			if (!analysis) throw new Error("Run the analysis first.");
			return applyProposal({ data: {
				implementationId,
				authorId: authorId === "" ? null : authorId,
				goals: applyGoals && proposedGoals !== "" ? proposedGoals : null,
				requirements: analysis.extraction.requirements.filter((_, i) => pickedRequirements[i]).map((r) => r.text),
				successMeasures: analysis.extraction.successMeasures.filter((_, i) => pickedMeasures[i]).map((m) => m.text),
				journeyNote: applyNote ? proposalAsNote(analysis, active?.sowName ?? null, startDate ?? null, overrides) : null
			} });
		},
		onSuccess: async (r) => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			setRuns((prev) => prev.map((x) => x.id === activeId ? {
				...x,
				applied: r
			} : x));
		}
	});
	if (!sowDocumentUrl) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "text-[12px] text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-foreground",
			children: "Attach the SOW first."
		}), " Use the SOW section in the Overview tab — the analysis reads that document only."]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2 text-[12px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-muted-foreground",
								children: [
									"Reads ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-foreground",
										children: sowDocumentName ?? "the attached SOW"
									}),
									" ",
									"and proposes a journey. Nothing is written until you apply it."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${primaryButtonClass} ml-auto`,
								disabled: run.isPending,
								onClick: () => run.mutate(),
								children: run.isPending ? `${newFile ? "Uploading and reading" : "Reading the SOW"}… ${elapsed}s` : runs.length > 0 ? "Re-analyze SOW" : "Analyse SOW"
							}),
							analysis && active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass$3,
								onClick: () => downloadSowAnalysisPdf({
									analysis,
									customerName,
									sowName: active.sowName,
									analysedAt: active.at,
									startDate,
									overrides
								}),
								children: "Export PDF"
							}) : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$3,
								children: "Use a new file (optional)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "file",
								className: "text-[11px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-background file:px-1.5 file:py-0.5 file:text-[11px] file:text-foreground",
								"aria-label": "New SOW document",
								disabled: run.isPending,
								onChange: (e) => setNewFile(e.target.files?.[0] ?? null)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: newFile ? `${newFile.name} will replace the attached SOW when you re-analyze.` : "Leave empty to re-run against the SOW already attached." })
						]
					}),
					run.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "rounded-sm border border-border bg-accent px-2 py-1.5 text-[12px] text-foreground",
						children: "Reading the document and drafting a journey — a long SOW can take a minute or two. The button stays greyed out until it finishes."
					}) : null
				]
			}),
			run.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive",
				children: run.error instanceof Error ? run.error.message : "The analysis failed."
			}) : null,
			analysis ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "rounded-sm border border-border bg-accent px-2 py-1.5 text-[12px] text-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-semibold",
							children: "Draft — nothing applied yet."
						}), " The first block is what the SOW says; the second is a proposed journey built from it. Review both, then choose what to apply."]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-semibold tracking-tight text-foreground",
							children: "What the SOW says"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 text-[11px] text-muted-foreground",
							children: [
								"Read from ",
								active?.sowName ?? sowDocumentName ?? "the attached SOW",
								". Items tagged implied or uncertain are not stated plainly in the document."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] leading-snug text-foreground",
							children: analysis.summary
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 grid gap-3 md:grid-cols-2",
							children: EXTRACTION_SECTIONS.map((section) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: labelClass$3,
								children: section.label
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FindingList, { findings: analysis.extraction[section.key] })
							})] }, section.key))
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-md border border-border bg-surface p-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] font-semibold tracking-tight text-foreground",
								children: "Proposed journey"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: "Grouped by the lifecycle stages this team already uses. A suggested starting point — the implementation's own journey is unchanged."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-1.5 rounded-sm border border-border bg-background px-2 py-1.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: labelClass$3,
										children: "Timeline stated in the SOW"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-0.5 text-[12px] text-foreground",
										children: deliveryWindowLabel(analysis) ? `Overall duration: ${deliveryWindowLabel(analysis)}.` : "The SOW states no overall delivery duration."
									}),
									analysis.deliveryWindow.startCondition ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-[11px] text-muted-foreground",
										children: ["Starts on: ", analysis.deliveryWindow.startCondition]
									}) : null,
									analysis.deliveryWindow.delayConditions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-[11px] text-muted-foreground",
										children: ["Delay conditions: ", analysis.deliveryWindow.delayConditions.join("; ")]
									}) : null,
									analysis.deliveryWindow.quote ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-0.5 border-l border-border pl-2 text-[11px] italic text-muted-foreground",
										children: [
											"“",
											analysis.deliveryWindow.quote,
											"”"
										]
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 text-[11px] text-muted-foreground",
										children: [
											"Timing below is an AI planning recommendation estimated from the described scope and dependencies — never a commitment, and never an even split of the total.",
											" ",
											startDate ? `Calendar dates are counted from the recorded start date (${fmtDate(startDate)}).` : "No start date is recorded, so timing stays in relative weeks.",
											" ",
											"Adjust any stage's weeks below before saving the proposal."
										]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 space-y-2.5",
								children: groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "border-t border-border/70 pt-2 first:border-t-0 first:pt-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground",
										children: g.label
									}), g.stages.map(({ index, stage, timing }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
												children: timing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
													timing.weeks,
													timing.dates ? ` · ${timing.dates}` : "",
													` · ${TIMING_SOURCE_LABEL[timing.source]}`,
													timing.overlapsWith.length > 0 ? " · overlaps" : ""
												] }) : "Timing not proposed"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-[13px] font-medium text-foreground",
												children: [stage.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfidenceTag, { confidence: stage.confidence })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[12px] text-muted-foreground",
												children: stage.purpose
											}),
											!timing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-0.5 text-[11px] text-foreground",
												children: "Insufficient information in the SOW to propose a credible window — set the weeks yourself if you want this stage timed."
											}) : null,
											timing?.statedText ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["SOW timing: ", timing.statedText]
											}) : null,
											timing?.rationale ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["Why this duration: ", timing.rationale]
											}) : null,
											timing?.dependencyDriver ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["Timing depends on: ", timing.dependencyDriver]
											}) : null,
											timing && timing.overlapsWith.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["Runs alongside: ", timing.overlapsWith.join("; ")]
											}) : null,
											timing?.beyondSowWindow ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-0.5 text-[11px] text-destructive",
												children: "Extends past the delivery window the SOW states."
											}) : null,
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: labelClass$3,
														children: "Adjust weeks"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
														type: "number",
														min: 1,
														max: 520,
														"aria-label": `${stage.name} start week`,
														className: "w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] text-foreground",
														value: overrides[index]?.startWeek ?? timing?.startWeek ?? "",
														onChange: (e) => {
															const start = Number(e.target.value);
															const end = overrides[index]?.endWeek ?? timing?.endWeek ?? start;
															if (!Number.isFinite(start) || start < 1) return;
															setOverride(index, {
																startWeek: start,
																endWeek: Math.max(end, start)
															});
														}
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "to" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
														type: "number",
														min: 1,
														max: 520,
														"aria-label": `${stage.name} end week`,
														className: "w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] text-foreground",
														value: overrides[index]?.endWeek ?? timing?.endWeek ?? "",
														onChange: (e) => {
															const end = Number(e.target.value);
															const start = overrides[index]?.startWeek ?? timing?.startWeek ?? 1;
															if (!Number.isFinite(end) || end < 1) return;
															setOverride(index, {
																startWeek: Math.min(start, end),
																endWeek: end
															});
														}
													}),
													overrides[index] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														type: "button",
														className: buttonClass$3,
														onClick: () => setOverride(index, null),
														children: "Reset to the proposal"
													}) : null
												]
											}),
											stage.workstreams.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
												className: "mt-1 space-y-0.5",
												children: stage.workstreams.map((w, j) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
													className: "text-[12px] text-foreground",
													children: ["• ", w]
												}, j))
											}) : null,
											stage.dependencies.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-1 text-[11px] text-muted-foreground",
												children: ["Depends on: ", stage.dependencies.join("; ")]
											}) : null,
											stage.customerResponsibilities.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["Customer has to: ", stage.customerResponsibilities.join("; ")]
											}) : null,
											stage.acceptanceCriteria.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-0.5 text-[11px] text-muted-foreground",
												children: ["Accepted when: ", stage.acceptanceCriteria.join("; ")]
											}) : null
										]
									}, index))]
								}, g.id))
							})
						]
					}),
					analysis.assumptions.length > 0 || analysis.gaps.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3 md:grid-cols-2",
						children: [analysis.assumptions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: labelClass$3,
							children: "Assumptions the proposal makes"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-1 space-y-0.5",
							children: analysis.assumptions.map((a, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "text-[12px] text-muted-foreground",
								children: ["• ", a]
							}, i))
						})] }) : null, analysis.gaps.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: labelClass$3,
							children: "Still unclear from the SOW"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-1 space-y-0.5",
							children: analysis.gaps.map((g, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "text-[12px] text-muted-foreground",
								children: ["• ", g]
							}, i))
						})] }) : null]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-md border border-border bg-surface p-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] font-semibold tracking-tight text-foreground",
								children: "Review and apply"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: "Only ticked items are added. Nothing already recorded is changed or removed."
							}),
							applied ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 text-[12px] text-foreground",
								children: [
									"Applied: ",
									applied.goals ? "goals added" : "goals unchanged",
									" ·",
									" ",
									applied.requirements,
									" requirement",
									applied.requirements === 1 ? "" : "s",
									" ·",
									" ",
									applied.successMeasures,
									" success measure",
									applied.successMeasures === 1 ? "" : "s",
									" ·",
									" ",
									applied.note ? "journey saved to the journal" : "no note saved",
									". The stage, history and everything else are untouched."
								]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 space-y-2.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: labelClass$3,
											children: ["Customer goals · ", currentGoals?.trim() ? "already recorded" : "nothing recorded yet"]
										}),
										currentGoals?.trim() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-0.5 whitespace-pre-wrap border-l border-border pl-2 text-[11px] text-muted-foreground",
											children: currentGoals
										}) : null,
										proposedGoals === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 text-[12px] text-muted-foreground",
											children: "The SOW gave nothing to add here."
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-1",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Checkbox, {
												checked: applyGoals,
												disabled: apply.isPending,
												onChange: setApplyGoals,
												children: [
													"Add these goals from the SOW",
													currentGoals?.trim() ? " (appended below what is already there)" : "",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "mt-0.5 block whitespace-pre-wrap text-[11px] text-muted-foreground",
														children: proposedGoals
													})
												]
											})
										})
									] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: labelClass$3,
										children: [
											"Requirements · ",
											requirementCount ?? 0,
											" already recorded"
										]
									}), analysis.extraction.requirements.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[12px] text-muted-foreground",
										children: "The SOW gave nothing to add here."
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-1 space-y-1",
										children: analysis.extraction.requirements.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
											checked: Boolean(pickedRequirements[i]),
											disabled: apply.isPending,
											onChange: (v) => setPickedRequirements((p) => ({
												...p,
												[i]: v
											})),
											children: r.text
										}, i))
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: labelClass$3,
										children: [
											"Success measures · ",
											successMeasureCount ?? 0,
											" already recorded"
										]
									}), analysis.extraction.successMeasures.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[12px] text-muted-foreground",
										children: "The SOW gave nothing to add here."
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-1 space-y-1",
										children: analysis.extraction.successMeasures.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
											checked: Boolean(pickedMeasures[i]),
											disabled: apply.isPending,
											onChange: (v) => setPickedMeasures((p) => ({
												...p,
												[i]: v
											})),
											children: m.text
										}, i))
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
										checked: applyNote,
										disabled: apply.isPending,
										onChange: setApplyNote,
										children: "Save the proposed journey as a working note in the journal"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex flex-wrap items-center gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "min-w-64",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerPicker, {
													team,
													group,
													ownerId: authorId,
													disabled: apply.isPending,
													personLabel: "Applied by",
													onChange: (next) => {
														setGroup(next.group);
														setAuthorId(next.ownerId);
													}
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												className: primaryButtonClass,
												disabled: apply.isPending,
												onClick: () => apply.mutate(),
												children: apply.isPending ? "Applying…" : "Apply to implementation"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												className: buttonClass$3,
												disabled: apply.isPending,
												onClick: () => {
													setRuns((prev) => prev.filter((x) => x.id !== activeId));
													setActiveId(null);
													apply.reset();
												},
												children: "Discard this proposal"
											}),
											apply.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-[11px] text-destructive",
												children: apply.error instanceof Error ? apply.error.message : "Could not apply"
											}) : null
										]
									})
								]
							})
						]
					})
				]
			}) : null,
			runs.length > 1 || runs.length === 1 && !active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border/70 pt-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: labelClass$3,
					children: "Earlier analyses"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-1 space-y-1",
					children: runs.filter((r) => r.id !== activeId).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center gap-2 text-[12px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-foreground",
								children: r.sowName ?? "SOW"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground",
								children: [r.at.toISOString().slice(0, 16).replace("T", " "), " UTC"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-muted-foreground",
								children: [
									r.applied ? "applied" : "not applied",
									" · ",
									r.analysis.proposedJourney.length,
									" ",
									"proposed stages"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass$3,
								onClick: () => {
									setActiveId(r.id);
									resetSelections(r.analysis);
									apply.reset();
								},
								children: "View this one"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass$3,
								onClick: () => downloadSowAnalysisPdf({
									analysis: r.analysis,
									customerName,
									sowName: r.sowName,
									analysedAt: r.at,
									startDate,
									overrides: adjustments[r.id] ?? {}
								}),
								children: "Download PDF"
							})
						]
					}, r.id))
				})]
			}) : null
		]
	});
}
var inputClass$2 = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass = "min-h-[52px] w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$2 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass$2 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable$1 = (v) => v.trim() === "" ? null : v.trim();
/**
* The discovery / design board (normally Miro) used at kickoff, attached to one
* implementation. Supporting context only — never the structured usage record.
*/
function DiscoveryBoardPanel({ customerId, implementation }) {
	const queryClient = useQueryClient();
	const save = useServerFn(setImplementation);
	const upload = useServerFn(uploadAttachment);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [boardUrl, setBoardUrl] = (0, import_react.useState)(implementation.discovery_board_url ?? "");
	const [notes, setNotes] = (0, import_react.useState)(implementation.discovery_board_notes ?? "");
	const [file, setFile] = (0, import_react.useState)(null);
	const reset = () => {
		setBoardUrl(implementation.discovery_board_url ?? "");
		setNotes(implementation.discovery_board_notes ?? "");
		setFile(null);
	};
	const mutation = useMutation({
		mutationFn: async () => {
			let imagePath = implementation.discovery_board_image_url;
			let imageName = implementation.discovery_board_image_name;
			if (file) {
				if (file.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "notes",
					fileName: file.name,
					contentType: file.type || "application/octet-stream",
					dataBase64: await fileToBase64(file)
				} });
				imagePath = stored.path;
				imageName = stored.name;
			}
			return save({ data: {
				id: implementation.id,
				name: implementation.name,
				ownerId: implementation.owner_id,
				salesOwner: implementation.sales_owner,
				tier: implementation.tier,
				status: implementation.status,
				sowReference: implementation.sow_reference,
				sowDocumentUrl: implementation.sow_document_url,
				sowDocumentName: implementation.sow_document_name,
				sowValue: implementation.sow_value,
				sowSignedDate: implementation.sow_signed_date,
				contractStartDate: implementation.contract_start_date,
				targetLaunchDate: implementation.target_launch_date,
				actualLaunchDate: implementation.actual_launch_date,
				customerGoals: implementation.customer_goals,
				discoveryBoardUrl: nullable$1(boardUrl),
				discoveryBoardImageUrl: imagePath,
				discoveryBoardImageName: imageName,
				discoveryBoardNotes: nullable$1(notes)
			} });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			setFile(null);
			setOpen(false);
		}
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$2,
						children: "Board link "
					}), implementation.discovery_board_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: implementation.discovery_board_url,
						target: "_blank",
						rel: "noopener noreferrer",
						className: "underline decoration-dotted",
						children: "Open board"
					}) : "Not recorded"] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass$2,
						children: "Board image "
					}), implementation.discovery_board_image_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: implementation.discovery_board_image_name ?? "Attached image" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenAttachment, {
							path: implementation.discovery_board_image_url,
							label: "View image"
						})]
					}) : "Nothing attached"] }),
					!open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${buttonClass$2} ml-auto`,
						onClick: () => {
							mutation.reset();
							reset();
							setOpen(true);
						},
						children: implementation.discovery_board_url || implementation.discovery_board_image_url ? "Edit board" : "Add board"
					}) : null
				]
			}),
			implementation.discovery_board_notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] leading-relaxed text-muted-foreground",
				children: implementation.discovery_board_notes
			}) : null,
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2 rounded-sm border border-border bg-surface p-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 md:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$2,
								children: "Board link"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass$2,
								"aria-label": "Board link",
								value: boardUrl,
								disabled,
								placeholder: "https://miro.com/app/board/…",
								onChange: (e) => setBoardUrl(e.target.value)
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass$2,
								children: "Board image or export"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "file",
								className: "w-full text-[11px]",
								"aria-label": "Board image or export",
								disabled,
								onChange: (e) => setFile(e.target.files?.[0] ?? null)
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$2,
							children: "What the board shows (optional)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							className: areaClass,
							"aria-label": "What the board shows",
							value: notes,
							disabled,
							placeholder: "e.g. Kickoff workshop map of the current order-intake process",
							onChange: (e) => setNotes(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass$2,
								disabled,
								onClick: () => mutation.mutate(),
								children: disabled ? "Saving…" : "Save"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass$2,
								disabled,
								onClick: () => {
									mutation.reset();
									reset();
									setOpen(false);
								},
								children: "Cancel"
							}),
							mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-destructive",
								children: mutation.error instanceof Error ? mutation.error.message : "Save failed — values kept"
							}) : null
						]
					})
				]
			}) : null
		]
	});
}
/** Focused editor for "what the customer wants to achieve", stored on the implementation. */
function CustomerGoalsPanel({ customerId, implementation }) {
	const queryClient = useQueryClient();
	const save = useServerFn(setImplementation);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [goals, setGoals] = (0, import_react.useState)(implementation.customer_goals ?? "");
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: implementation.id,
			name: implementation.name,
			ownerId: implementation.owner_id,
			salesOwner: implementation.sales_owner,
			tier: implementation.tier,
			status: implementation.status,
			sowReference: implementation.sow_reference,
			sowDocumentUrl: implementation.sow_document_url,
			sowDocumentName: implementation.sow_document_name,
			sowValue: implementation.sow_value,
			sowSignedDate: implementation.sow_signed_date,
			contractStartDate: implementation.contract_start_date,
			targetLaunchDate: implementation.target_launch_date,
			actualLaunchDate: implementation.actual_launch_date,
			customerGoals: nullable$1(goals)
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			setOpen(false);
		}
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-1.5",
		children: !open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: implementation.customer_goals ? "text-[15px] font-medium leading-snug text-foreground" : "text-[12px] text-muted-foreground",
				children: implementation.customer_goals ?? "Not captured yet."
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: `${buttonClass$2} ml-auto shrink-0`,
				onClick: () => {
					mutation.reset();
					setGoals(implementation.customer_goals ?? "");
					setOpen(true);
				},
				children: implementation.customer_goals ? "Edit" : "Add"
			})]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				className: areaClass,
				"aria-label": "What the customer wants to achieve",
				value: goals,
				disabled,
				placeholder: "What does the customer want to achieve with this implementation?",
				onChange: (e) => setGoals(e.target.value)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass$2,
						disabled,
						onClick: () => mutation.mutate(),
						children: disabled ? "Saving…" : "Save"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass$2,
						disabled,
						onClick: () => {
							mutation.reset();
							setGoals(implementation.customer_goals ?? "");
							setOpen(false);
						},
						children: "Cancel"
					}),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-destructive",
						children: mutation.error instanceof Error ? mutation.error.message : "Save failed — values kept"
					}) : null
				]
			})]
		})
	});
}
var inputClass$1 = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass$1 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass$1 = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
/**
* Working notes for the implementation. Writing a note records the stage the
* implementation is in right now — the writer never picks it.
*/
function JournalPanel({ customerId, implementationId, currentStage, team, entries }) {
	const queryClient = useQueryClient();
	const create = useServerFn(addJournalEntry);
	const upload = useServerFn(uploadAttachment);
	const [note, setNote] = (0, import_react.useState)("");
	const [links, setLinks] = (0, import_react.useState)("");
	const [group, setGroup] = (0, import_react.useState)("");
	const [authorId, setAuthorId] = (0, import_react.useState)("");
	const [file, setFile] = (0, import_react.useState)(null);
	const reset = () => {
		setNote("");
		setLinks("");
		setFile(null);
	};
	const mutation = useMutation({
		mutationFn: async () => {
			let attachmentUrl = null;
			let attachmentName = null;
			if (file) {
				if (file.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "notes",
					fileName: file.name,
					contentType: file.type || "application/octet-stream",
					dataBase64: await fileToBase64(file)
				} });
				attachmentUrl = stored.path;
				attachmentName = stored.name;
			}
			return create({ data: {
				implementationId,
				note: note.trim(),
				authorId: authorId === "" ? null : authorId,
				links: links.trim() === "" ? null : links.trim(),
				attachmentUrl,
				attachmentName
			} });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			reset();
		}
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2 rounded-sm border border-border bg-surface p-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-[11px] text-muted-foreground",
					children: [
						"This note will be filed under the current stage:",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-foreground",
							children: stageLabel(currentStage)
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: `${inputClass$1} min-h-[64px]`,
					"aria-label": "Note",
					placeholder: "What happened, what you decided, what's next…",
					value: note,
					disabled,
					onChange: (e) => setNote(e.target.value)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-2 md:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$1,
							children: "Links (one per line)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							className: `${inputClass$1} min-h-[40px]`,
							"aria-label": "Links",
							placeholder: "https://…",
							value: links,
							disabled,
							onChange: (e) => setLinks(e.target.value)
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass$1,
							children: "Attachment"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "file",
							className: "w-full text-[11px]",
							"aria-label": "Attachment",
							disabled,
							onChange: (e) => setFile(e.target.files?.[0] ?? null)
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid gap-2 md:grid-cols-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerPicker, {
						team,
						group,
						ownerId: authorId,
						disabled,
						personLabel: "Written by",
						onChange: (next) => {
							setGroup(next.group);
							setAuthorId(next.ownerId);
						}
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass$1,
							disabled: disabled || note.trim() === "",
							onClick: () => mutation.mutate(),
							children: disabled ? "Saving…" : "Save note"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass$1,
							disabled,
							onClick: () => {
								mutation.reset();
								reset();
							},
							children: "Cancel"
						}),
						mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] text-destructive",
							children: mutation.error instanceof Error ? mutation.error.message : "Save failed — values kept"
						}) : null
					]
				})
			]
		}), entries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[12px] text-muted-foreground",
			children: "No notes yet."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "space-y-2",
			children: entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "rounded-sm border border-border p-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-sm border border-border px-1 text-foreground",
								children: stageLabel(entry.stage)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtDateTime(entry.created_at) }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.author_name ?? "Author not recorded" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 whitespace-pre-wrap text-[12px] text-foreground",
						children: entry.note
					}),
					splitLinks(entry.links).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-1 space-y-0.5",
						children: splitLinks(entry.links).map((link) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: link,
							target: "_blank",
							rel: "noopener noreferrer",
							className: "text-[11px] text-primary underline",
							children: link
						}) }, link))
					}) : null,
					entry.attachment_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 flex items-center gap-2 text-[11px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.attachment_name ?? "Attachment" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenAttachment, {
							path: entry.attachment_url,
							label: "Open"
						})]
					}) : null
				]
			}, entry.id))
		})]
	});
}
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable = (v) => v.trim() === "" ? null : v.trim();
var emptyDraft = () => ({
	name: "",
	role: "",
	email: "",
	notes: ""
});
var isContactRole = (v) => CONTACT_ROLES.includes(v);
var draftOf = (c) => ({
	name: c.name ?? "",
	role: c.role && isContactRole(c.role) ? c.role : "",
	email: c.email ?? "",
	notes: c.notes ?? ""
});
function useInvalidate(customerId) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}
function ContactForm({ draft, set, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid grid-cols-2 gap-2 md:grid-cols-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Name"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					"aria-label": "Contact name",
					value: draft.name,
					disabled,
					onChange: (e) => set({ name: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Role"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: inputClass,
					"aria-label": "Contact role",
					value: draft.role,
					disabled,
					onChange: (e) => set({ role: isContactRole(e.target.value) ? e.target.value : "" }),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "",
						children: "Select contact type…"
					}), CONTACT_ROLES.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: r,
						children: CONTACT_ROLE_LABELS[r]
					}, r))]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Email"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					"aria-label": "Contact email",
					placeholder: "Not recorded",
					value: draft.email,
					disabled,
					onChange: (e) => set({ email: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Notes"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					"aria-label": "Contact notes",
					placeholder: "Not recorded",
					value: draft.notes,
					disabled,
					onChange: (e) => set({ notes: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "col-span-2 text-[10px] leading-relaxed text-muted-foreground md:col-span-4",
				children: "Role records the person’s contact type. Responsibility for a success measure or usage area is set on that record’s customer owner field."
			})
		]
	});
}
var ROLE_REQUIRED = "Select a contact type before saving.";
function assertRole(role) {
	if (role === "") throw new Error(ROLE_REQUIRED);
	return role;
}
function safeMessage(error) {
	const raw = error instanceof Error ? error.message : String(error);
	if (raw === ROLE_REQUIRED) return raw;
	if (/role/i.test(raw) && /(check|constraint|invalid|enum|violat)/i.test(raw)) return ROLE_REQUIRED;
	if (/(constraint|violat|sql|pgrst|column|relation)/i.test(raw)) return "Could not save this contact. Check the details and try again.";
	return raw;
}
function AddCustomerContact({ customerId }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyDraft);
	const invalidate = useInvalidate(customerId);
	const create = useServerFn(addCustomerContact);
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			customerId,
			name: draft.name.trim(),
			role: assertRole(draft.role),
			email: nullable(draft.email),
			notes: nullable(draft.notes)
		} }),
		onSuccess: async () => {
			await invalidate();
			setDraft(emptyDraft());
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => {
			mutation.reset();
			setDraft(emptyDraft());
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add customer contact"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContactForm, {
				draft,
				set: (patch) => setDraft({
					...draft,
					...patch
				}),
				disabled: mutation.isPending
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: safeMessage(mutation.error)
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || draft.name.trim() === "" || draft.role === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled: mutation.isPending,
					onClick: () => {
						mutation.reset();
						setDraft(emptyDraft());
						setOpen(false);
					},
					children: "Cancel"
				})]
			})
		]
	});
}
function EditCustomerContact({ customerId, contact }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(() => draftOf(contact));
	const invalidate = useInvalidate(customerId);
	const save = useServerFn(setCustomerContact);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: contact.id,
			name: draft.name.trim(),
			role: assertRole(draft.role),
			email: nullable(draft.email),
			notes: nullable(draft.notes)
		} }),
		onSuccess: async () => {
			await invalidate();
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => {
			mutation.reset();
			setDraft(draftOf(contact));
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContactForm, {
				draft,
				set: (patch) => setDraft({
					...draft,
					...patch
				}),
				disabled: mutation.isPending
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: safeMessage(mutation.error)
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || draft.name.trim() === "" || draft.role === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled: mutation.isPending,
					onClick: () => {
						mutation.reset();
						setDraft(draftOf(contact));
						setOpen(false);
					},
					children: "Cancel"
				})]
			})
		]
	});
}
var TAB_LABEL = {
	overview: "Overview",
	journey: "Journey",
	solution: "Solution",
	requirements: "Requirements",
	decisions: "Decisions",
	risks: "Risks & Issues",
	evidence: "Evidence",
	history: "History"
};
var dash = (v) => v === null || v === void 0 || v === "" ? "—" : v;
function Row({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
		className: cn("px-3 py-2.5", className),
		children
	});
}
function Meta({ items }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground",
		children: items.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "uppercase tracking-[0.08em]",
				children: k
			}),
			" ",
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-foreground",
				children: v ?? "—"
			})
		] }, k))
	});
}
function TraceChain({ trace }) {
	if (!trace.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "text-[11px] text-muted-foreground",
		children: "No trace links recorded"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-1.5 text-[11px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "uppercase tracking-[0.08em] text-muted-foreground",
			children: "Traced to"
		}), trace.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center gap-1.5",
			children: [i > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3 text-muted-foreground" }) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "rounded-sm border border-border bg-muted px-1.5 py-0.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-muted-foreground",
						children: [humanize(s.entity_type), ":"]
					}),
					" ",
					s.label
				]
			})]
		}, `${s.entity_type}-${s.id}`))]
	});
}
/**
* Every implementation this customer has. Selecting one reloads this page for
* that record — each keeps its own stage, owner, dates and notes.
*/
function ImplementationSwitcher({ customerId, tab, activeId, implementations }) {
	if (implementations.length < 2) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-1.5 flex flex-wrap items-center gap-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
			children: "Implementations"
		}), implementations.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/customers/$customerId",
			params: { customerId },
			search: {
				tab,
				impl: row.id
			},
			className: cn("rounded-sm border px-1.5 py-0.5 text-[11px]", row.id === activeId ? "border-primary bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"),
			children: [row.name, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "ml-1.5 text-muted-foreground",
				children: [
					stageLabel(row.current_stage),
					" · ",
					row.owner_name ?? "Unassigned"
				]
			})]
		}, row.id))]
	});
}
function Customer360Page() {
	const { customerId } = Route$21.useParams();
	const { tab = "overview", impl: selectedImplId } = Route$21.useSearch();
	const { data } = useSuspenseQuery(customerQuery(customerId, selectedImplId ?? null));
	const record = data;
	const { customer, implementation: impl } = record;
	const health = impl ? deriveHealth(record, impl) : {
		level: "no_signal",
		reason: null
	};
	if (!impl) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "text-[17px] font-semibold",
			children: customer.name
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-[13px] text-muted-foreground",
			children: "This customer has no implementation record yet."
		})]
	});
	const prog = progress(impl.current_stage);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "pb-16",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "border-b border-border bg-surface",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-start justify-between gap-4 px-6 pt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2 text-[11px] text-muted-foreground",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/customers",
										search: {
											sort: "days",
											dir: "desc"
										},
										className: "hover:underline",
										children: "Customers"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3 w-3" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: customer.name })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "mt-1 text-[17px] font-semibold tracking-tight",
								children: customer.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImplementationSwitcher, {
								customerId,
								tab,
								activeId: impl.id,
								implementations: record.implementations
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-0.5 text-[12px] text-muted-foreground",
								children: [
									[
										customer.industry,
										impl.tier,
										customer.segment
									].filter(Boolean).join(" · ") || "—",
									" · Owner ",
									impl.owner_name ?? "Unassigned"
								]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: health.level }),
							impl.status !== "on_track" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-muted-foreground",
								children: ["Manual flag: ", humanize(impl.status)]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: impl.current_stage }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [daysSince(impl.stage_entered_at), "d in stage"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [
									"stage ",
									prog.index,
									"/",
									prog.total
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-1 w-24 overflow-hidden rounded-sm bg-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "h-full bg-primary",
									style: { width: `${prog.pct}%` }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-muted-foreground",
								children: [
									"Target launch",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-foreground",
										children: fmtDate(impl.target_launch_date)
									})
								]
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-6 pb-4 pt-3",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AttentionBand, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySignal, {
						label: "What matters now",
						value: whatMattersNow(record)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySignal, {
						label: "Next action",
						value: nextAction(record, impl)
					})] })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "flex flex-wrap gap-px border-t border-border px-4",
					children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/customers/$customerId",
						params: { customerId },
						search: {
							tab: t,
							...selectedImplId ? { impl: selectedImplId } : {}
						},
						className: cn("-mb-px border-b-2 px-3 py-2 text-[12px] font-medium transition-colors", t === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"),
						children: TAB_LABEL[t]
					}, t))
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-4 px-6 py-4",
			children: [
				tab === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewTab, {
					record,
					customerId
				}) : null,
				tab === "journey" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JourneyTab, {
					record,
					customerId
				}) : null,
				tab === "solution" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SolutionTab, {
					record,
					customerId
				}) : null,
				tab === "requirements" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequirementsTab, {
					record,
					customerId
				}) : null,
				tab === "decisions" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DecisionsTab, {
					record,
					customerId
				}) : null,
				tab === "risks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RisksTab, {
					record,
					customerId
				}) : null,
				tab === "evidence" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceTab, {
					record,
					customerId
				}) : null,
				tab === "history" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HistoryTab, { record }) : null
			]
		})]
	});
}
function OverviewTab({ record, customerId }) {
	const impl = record.implementation;
	const open = openItems(record);
	const prog = progress(impl.current_stage);
	const boardImpl = {
		id: impl.id,
		name: impl.name,
		owner_id: impl.owner_id,
		sales_owner: impl.sales_owner,
		tier: impl.tier,
		status: impl.status,
		sow_reference: impl.sow_reference,
		sow_document_url: impl.sow_document_url,
		sow_document_name: impl.sow_document_name,
		sow_value: impl.sow_value,
		sow_signed_date: impl.sow_signed_date,
		contract_start_date: impl.contract_start_date,
		target_launch_date: impl.target_launch_date,
		actual_launch_date: impl.actual_launch_date,
		customer_goals: impl.customer_goals,
		discovery_board_url: impl.discovery_board_url,
		discovery_board_image_url: impl.discovery_board_image_url,
		discovery_board_image_name: impl.discovery_board_image_name,
		discovery_board_notes: impl.discovery_board_notes
	};
	const events = meaningfulEvents(record);
	const waiting = waitingOnForCustomer(record);
	const valueGaps = proveValueGaps(record.success_criteria, impl.current_stage);
	const adoption = adoptionSummary(record.adoption);
	const readiness = graduationReadiness(record, impl);
	const readinessSummary = graduationReadinessSummary(readiness);
	const gradEvidence = graduationEvidence(record, impl);
	const solutionOwners = Array.from(new Set(record.technical_solutions.map((s) => s.owner_name).filter(Boolean)));
	const approvers = Array.from(new Map(record.approvals.filter((a) => a.approver_name).map((a) => [a.approver_name, a])).values());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid items-start gap-4 xl:grid-cols-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-4 xl:col-span-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "Current state",
					level: "primary",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
							className: "grid grid-cols-2 gap-x-6 gap-y-3 px-3 py-2.5 md:grid-cols-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Stage",
									value: stageLabel(impl.current_stage)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Health",
									value: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: deriveHealth(record, impl).level })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Target launch",
									value: fmtDate(impl.target_launch_date)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Progress",
									value: `${prog.index} / ${prog.total} stages`
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2 border-t border-border px-3 py-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySignal, {
									label: "Waiting on",
									emphasis: "medium",
									value: waiting.party === "none" ? "No current dependency" : WAITING_ON_LABEL[waiting.party],
									detail: waiting.party === "none" ? void 0 : waiting.reason.replace(/^Waiting on [^—]+ — /, "")
								}),
								valueGaps.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[12px] leading-snug text-muted-foreground",
									children: [
										"Value proof · ",
										valueGaps.length,
										" success criteri",
										valueGaps.length > 1 ? "a" : "on",
										" late — ",
										valueGaps[0].reason
									]
								}) : null,
								adoption ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[12px] leading-snug text-muted-foreground",
									children: [
										"Usage · ",
										ADOPTION_LEVEL_LABEL[adoption.level],
										" — ",
										adoption.reason
									]
								}) : null
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-t border-border px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
								children: "Statement of work"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SowPanel, {
								customerId,
								implementation: {
									id: impl.id,
									name: impl.name,
									owner_id: impl.owner_id,
									sales_owner: impl.sales_owner,
									tier: impl.tier,
									status: impl.status,
									sow_reference: impl.sow_reference,
									sow_document_url: impl.sow_document_url,
									sow_document_name: impl.sow_document_name,
									sow_value: impl.sow_value,
									sow_signed_date: impl.sow_signed_date,
									contract_start_date: impl.contract_start_date,
									target_launch_date: impl.target_launch_date,
									actual_launch_date: impl.actual_launch_date,
									customer_goals: impl.customer_goals
								}
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "border-t border-border px-3 py-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditImplementation, {
								customerId,
								implementation: {
									id: impl.id,
									name: impl.name,
									owner_id: impl.owner_id,
									sales_owner: impl.sales_owner,
									tier: impl.tier,
									status: impl.status,
									sow_reference: impl.sow_reference,
									sow_value: impl.sow_value,
									sow_signed_date: impl.sow_signed_date,
									contract_start_date: impl.contract_start_date,
									target_launch_date: impl.target_launch_date,
									actual_launch_date: impl.actual_launch_date,
									customer_goals: impl.customer_goals
								},
								team: record.team
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "What the customer wants to achieve",
					level: "primary",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-3 py-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerGoalsPanel, {
							customerId,
							implementation: boardImpl
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "border-t border-border bg-surface px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: "Discovery board (Miro) · supporting context"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiscoveryBoardPanel, {
							customerId,
							implementation: boardImpl
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "What success looks like",
					count: record.success_criteria.length,
					level: "primary",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground",
							children: "Each measure records what success looks like, how it will be measured, the starting point and target where they apply, and who owns it. Working context belongs in the TIS journal, not here."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-b border-border px-3 py-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
									children: "Customer contacts"
								}),
								record.contacts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "mt-1 divide-y divide-border border-y border-border",
									children: record.contacts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "py-1.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-baseline gap-2 text-[12px]",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-medium",
													children: c.name
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
													children: contactRoleLabel(c.role) ?? c.role
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-[11px] text-muted-foreground",
													children: dash(c.email)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "ml-auto",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditCustomerContact, {
														customerId,
														contact: c
													})
												})
											]
										}), c.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-0.5 text-[11px] text-muted-foreground",
											children: c.notes
										}) : null]
									}, c.id))
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-0.5 text-[12px] text-muted-foreground",
									children: "No customer contacts recorded — outcome ownership, value confirmation and adoption ownership cannot be attributed yet."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-1.5",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddCustomerContact, { customerId })
								})
							]
						}),
						record.success_criteria.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "divide-y divide-border",
							children: record.success_criteria.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SuccessCriterionRow, {
								criterion: s,
								customerId,
								implementationId: impl.id,
								team: record.team,
								contacts: record.contacts,
								evidence: record.evidence,
								currentStage: impl.current_stage
							}, s.id))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap items-center gap-3 px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[12px] text-muted-foreground",
								children: "No success measures recorded yet. Add one so we can measure whether this implementation delivers value."
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "border-t border-border px-3 py-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddSuccessCriterion, {
								customerId,
								implementationId: impl.id,
								team: record.team,
								contacts: record.contacts
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "How the customer will use it",
					count: record.adoption.length,
					meta: adoption ? ADOPTION_LEVEL_LABEL[adoption.level] : void 0,
					level: "supporting",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-b border-border px-3 py-2 text-[11px] text-muted-foreground",
							children: "Each row records how the customer is expected to use the solution — the intended users, how often, and what counts as being in use. Usage observations underneath record what is actually happening; the discovery board is supporting context only."
						}),
						adoption?.workarounds.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "border-b border-border px-3 py-2 text-[12px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Workarounds still in use · "
							}), adoption.workarounds.map((w) => `${w.name}${w.description ? ` (${w.description})` : ""}`).join("; ")]
						}) : null,
						record.adoption.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "divide-y divide-border",
							children: record.adoption.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdoptionAreaRow, {
								area: a,
								customerId,
								team: record.team,
								contacts: record.contacts,
								evidence: record.evidence
							}, a.id))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "px-3 py-3 text-[12px] text-muted-foreground",
							children: "No usage areas recorded yet."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "border-t border-border px-3 py-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddAdoptionArea, {
								customerId,
								implementationId: impl.id,
								team: record.team,
								contacts: record.contacts
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "Ready to hand over",
					level: "supporting",
					meta: readinessSummary.line,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-b border-border px-3 py-2 text-[11px] text-muted-foreground",
							children: "Read-only assessment of whether this customer is actually ready for handover to Customer Success. Nothing here blocks stage movement."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "divide-y divide-border",
							children: readiness.map((area) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-start gap-3 px-3 py-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: cn("mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]", area.state === "ready" ? "border-border text-foreground" : area.state === "needs_attention" ? "border-destructive/60 text-destructive" : "border-border text-muted-foreground"),
										children: READINESS_STATE_LABEL[area.state]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[12px] font-medium",
											children: area.label
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[12px] text-muted-foreground",
											children: area.reason
										})]
									}),
									area.tab && area.tab !== "overview" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/customers/$customerId",
										params: { customerId },
										search: { tab: area.tab },
										className: "ml-auto shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground",
										children: TAB_LABEL[area.tab]
									}) : null
								]
							}, area.id))
						}),
						gradEvidence.hasRecord ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-t border-border px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
								children: "Verified by structured records"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
								className: "mt-2 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4",
								children: gradEvidence.verified.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: f.label,
									value: f.value
								}, f.label))
							})]
						}), gradEvidence.narrative.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-t border-dashed border-border bg-muted/40 px-3 py-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
									children: "Recorded as narrative — not independently verified"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "mt-2 space-y-2",
									children: gradEvidence.narrative.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "border-l-2 border-dashed border-muted-foreground/40 pl-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
											children: [
												n.label,
												" · ",
												n.source
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[12px] italic text-muted-foreground",
											children: n.value
										})]
									}, n.label))
								}),
								gradEvidence.corroboration ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 border-t border-dashed border-border pt-2 text-[11px] text-destructive",
									children: gradEvidence.corroboration
								}) : null
							]
						}) : null] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-t border-border px-3 py-2 text-[12px] text-muted-foreground",
							children: "No handover record exists yet — nothing is assumed on its behalf."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: "Open items",
					level: "primary",
					meta: `${open.commitments.length + open.risks.length + open.issues.length + open.escalations.length} open`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 divide-x divide-border border-b border-border md:grid-cols-4",
						children: [
							["Commitments", open.commitments.length],
							["Risks", open.risks.length],
							["Issues", open.issues.length],
							["Escalations", open.escalations.length]
						].map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
								children: k
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-mono text-[16px]",
								children: v
							})]
						}, k))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "divide-y divide-border",
						children: [[
							...open.escalations.map((e) => ({
								id: `e-${e.id}`,
								kind: "Escalation",
								title: e.title,
								severity: e.severity,
								extra: e.status
							})),
							...open.risks.map((r) => ({
								id: `r-${r.id}`,
								kind: "Risk",
								title: r.title,
								severity: r.severity,
								extra: `${r.likelihood} likelihood`
							})),
							...open.issues.map((r) => ({
								id: `i-${r.id}`,
								kind: "Issue",
								title: r.title,
								severity: r.severity,
								extra: r.status
							})),
							...open.commitments.map((c) => ({
								id: `c-${c.id}`,
								kind: "Commitment",
								title: c.description,
								severity: null,
								extra: c.due_date ? `${isOverdue(c.due_date) ? "Overdue" : "Due"} ${fmtDate(c.due_date)}` : "No due date"
							}))
						].slice(0, 10).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "w-20 shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
									children: row.kind
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px]",
									children: row.title
								}),
								row.severity ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: row.severity }) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] text-muted-foreground",
									children: row.extra
								})
							]
						}, row.id)), open.commitments.length + open.risks.length + open.issues.length + open.escalations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "Nothing open" }) : null]
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				title: "Key people",
				level: "supporting",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
					className: "grid grid-cols-2 gap-3 px-3 py-2.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Implementation owner",
							value: dash(impl.owner_name)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Sales owner",
							value: dash(impl.sales_owner)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Technical solution owners",
							value: solutionOwners.length ? solutionOwners.join(", ") : "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "ARR",
							value: fmtMoney(record.customer.arr)
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-t border-border",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-3 pt-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
						children: "Customer approvers"
					}), approvers.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: approvers.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, {
							className: "flex items-baseline justify-between gap-2 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[12px]",
								children: [a.approver_name, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-muted-foreground",
									children: [" · ", dash(a.approver_role)]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: a.status })]
						}, a.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No named approvers" })]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
				title: "Recent activity",
				meta: "Meaningful events only",
				level: "supporting",
				children: [events.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: events.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-baseline gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-16 shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: e.kind
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[12px]",
							children: e.kind === "Stage" ? stageLabel(e.detail) : e.title
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
						["When", fmtDateTime(e.at)],
						["Who", dash(e.actor)],
						...e.kind === "Stage" ? [] : [["State", humanize(e.detail)]]
					] })] }, e.key))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No recent events" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-t border-border px-3 py-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/customers/$customerId",
						params: { customerId },
						search: { tab: "history" },
						className: "text-[11px] underline",
						children: "Full change history →"
					})
				})]
			})]
		})]
	});
}
/** Prove Value presentation for one success criterion, with observation + confirmation writes. */
function SuccessCriterionRow({ criterion, customerId, implementationId, team, contacts, evidence, currentStage }) {
	const state = proveValueState(criterion, criterion.observations, criterion.confirmations);
	const gap = proveValueGaps([criterion], currentStage)[0] ?? null;
	const observations = [...criterion.observations].sort((a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime());
	const latest = observations[0];
	const confirmation = criterion.confirmations[0] ?? null;
	const evidenceOptions = (evidence ?? []).map((e) => ({
		id: e.id,
		title: e.title,
		type: e.type
	}));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-baseline gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px]",
					children: criterion.description
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
					children: PROVE_VALUE_LABEL[state]
				}),
				gap ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive",
					children: [
						"Late",
						gap.due_stage ? ` · due by ${stageLabel(gap.due_stage)}` : "",
						gap.explicit_due_stage ? "" : " (implied)"
					]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditSuccessCriterion, {
						customerId,
						criterion,
						team,
						contacts
					})
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-1.5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
				children: "From SOW"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [["Outcome", criterion.description], ["Metric", dash(criterion.metric)]] })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-1.5 border-l-2 border-border pl-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
				children: "Confirmed at kickoff"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
				["Starting point", dash(criterion.baseline_value)],
				["Starting point period", dash(criterion.baseline_period)],
				["Target", dash(criterion.target_value)],
				["Target date", criterion.target_date ? fmtDate(criterion.target_date) : "—"],
				["How we'll measure it", dash(criterion.measurement_source)],
				["Due stage", criterion.due_stage ? stageLabel(criterion.due_stage) : "—"],
				["Internal owner", dash(criterion.owner_name)],
				["Customer-side owner", criterion.customer_owner_name ? `${criterion.customer_owner_name}${criterion.customer_owner_role ? ` (${criterion.customer_owner_role})` : ""}` : "—"]
			] })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [["Latest observed", latest ? `${latest.observed_value} · ${fmtDate(latest.observed_at)}` : "—"]] }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: [
						"Observations (",
						observations.length,
						")"
					]
				}),
				observations.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-1 divide-y divide-border border-y border-border",
					children: observations.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "py-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-baseline gap-2 text-[12px]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-medium",
										children: o.observed_value
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
										children: o.assessment ? humanize(o.assessment) : "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[11px] text-muted-foreground",
										children: fmtDate(o.observed_at)
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
								["Observed by", dash(o.observed_by_name)],
								["Source", dash(o.source)],
								["Evidence", o.evidence ? o.evidence.title : "—"]
							] }),
							o.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: o.notes
							}) : null
						]
					}, o.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[11px] text-muted-foreground",
					children: "No success measurements recorded yet."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddObservation, {
						customerId,
						criterionId: criterion.id,
						team,
						evidence: evidenceOptions
					})
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-2",
			children: [confirmation ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[11px] text-muted-foreground",
				children: [
					"Customer confirmation · ",
					humanize(confirmation.status),
					" ·",
					" ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-foreground",
						children: dash(confirmation.contact_name ?? confirmation.approver_name)
					}),
					confirmation.contact_role ?? confirmation.approver_role ? ` (${confirmation.contact_role ?? confirmation.approver_role})` : "",
					confirmation.decided_at ? ` · ${fmtDate(confirmation.decided_at)}` : "",
					confirmation.evidence ? ` · Evidence: ${confirmation.evidence.title}` : ""
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-muted-foreground",
				children: "No customer confirmation recorded."
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerConfirmationEditor, {
					customerId,
					implementationId,
					criterionId: criterion.id,
					existing: confirmation,
					contacts,
					evidence: evidenceOptions
				})
			})]
		})
	] });
}
/** Adoption presentation for one intended user group / workflow. */
function AdoptionAreaRow({ area, customerId, team, contacts, evidence }) {
	const level = adoptionAreaLevel(area);
	const latest = latestAdoptionObservation(area.observations);
	const observations = [...area.observations].sort((a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime());
	const evidenceOptions = (evidence ?? []).map((e) => ({
		id: e.id,
		title: e.title,
		type: e.type
	}));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-baseline gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
					children: ADOPTION_KIND_LABEL[area.kind] ?? humanize(area.kind)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px]",
					children: area.name
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
					children: ADOPTION_LEVEL_LABEL[level]
				}),
				latest?.workaround_in_use ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive",
					children: "Workaround in use"
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditAdoptionArea, {
						customerId,
						area,
						team,
						contacts
					})
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-1.5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
				children: "From SOW"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [["Intended use", dash(area.intended_usage)]] })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-1.5 border-l-2 border-border pl-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
				children: "Confirmed at kickoff"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
				["Intended users", dash(area.intended_users)],
				["Expected frequency", dash(area.expected_frequency)],
				["\"In use\" means", dash(area.in_use_definition)],
				["Customer-side owner", area.customer_owner_name ? `${area.customer_owner_name}${area.customer_owner_role ? ` (${area.customer_owner_role})` : ""}` : "—"]
			] })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [["Internal owner", dash(area.owner_name)], ["Last observed", latest ? fmtDate(latest.observed_at) : "—"]] }),
		area.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-0.5 text-[11px] text-muted-foreground",
			children: area.notes
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: [
						"Usage observations (",
						observations.length,
						")"
					]
				}),
				observations.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-1 divide-y divide-border border-y border-border",
					children: observations.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "py-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-baseline gap-2 text-[12px]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-medium",
										children: humanize(o.state)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[11px] text-muted-foreground",
										children: fmtDate(o.observed_at)
									}),
									o.workaround_in_use ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] text-destructive",
										children: "Workaround"
									}) : null
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
								["Observed by", dash(o.observed_by_name)],
								["Source", dash(o.source)],
								["Evidence", o.evidence ? o.evidence.title : "—"]
							] }),
							o.workaround_description ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: ["Workaround: ", o.workaround_description]
							}) : null,
							o.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: o.notes
							}) : null
						]
					}, o.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[11px] text-muted-foreground",
					children: "No usage observations recorded yet."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddAdoptionObservation, {
						customerId,
						areaId: area.id,
						team,
						evidence: evidenceOptions
					})
				})
			]
		})
	] });
}
function JourneyTab({ record, customerId }) {
	const impl = record.implementation;
	const activeStage = normalizeStage(impl.current_stage);
	const activeIndex = LIFECYCLE_STAGES.findIndex((s) => s.id === activeStage);
	const launchGate = launchAcceptanceGate({
		toStage: nextLifecycleStage(activeStage),
		solutions: record.technical_solutions,
		approvals: record.approvals
	});
	const open = openItems(record);
	const historyByStage = /* @__PURE__ */ new Map();
	const preHandoffHistory = [];
	for (const h of record.stage_history) {
		const id = normalizeStage(h.stage);
		if (id) historyByStage.set(id, h);
		else if (isPreHandoffStage(h.stage)) preHandoffHistory.push(h);
	}
	const duration = (h) => {
		if (!h) return null;
		const end = h.exited_at ? new Date(h.exited_at).getTime() : Date.now();
		return Math.max(0, Math.round((end - new Date(h.entered_at).getTime()) / 864e5));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-hidden rounded-md bg-surface",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LifecycleRail, {
					activeStage: activeStage ?? void 0,
					className: "border-b-0 bg-transparent"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md bg-surface px-4 py-3.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
					children: "Move to next stage"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdvanceStage, {
						customerId,
						implementationId: impl.id,
						currentStage: activeStage,
						team: record.team,
						gate: launchGate
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Proposed journey from the SOW",
				meta: "Draft suggestion — only applied when you choose to",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2.5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SowAnalysisPanel, {
						customerId,
						customerName: record.customer.name,
						implementationId: impl.id,
						sowDocumentUrl: impl.sow_document_url,
						sowDocumentName: impl.sow_document_name,
						team: record.team,
						currentGoals: impl.customer_goals,
						requirementCount: record.requirements.length,
						successMeasureCount: record.success_criteria.length,
						startDate: impl.contract_start_date
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "TIS journal",
				count: record.journal.length,
				level: "reference",
				meta: `Working notes, filed under the stage they were written in — currently ${stageLabel(impl.current_stage)}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "py-1.5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JournalPanel, {
						customerId,
						implementationId: impl.id,
						currentStage: impl.current_stage,
						team: record.team,
						entries: record.journal
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Commitments",
				count: record.commitments.length,
				meta: "Promises made to the customer or internally",
				action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddCommitment, {
					customerId,
					implementationId: impl.id,
					team: record.team
				}),
				children: record.commitments.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: record.commitments.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-baseline gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[13px]",
								children: c.description
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: c.status }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
								children: humanize(c.committed_to ?? "customer")
							}),
							c.status === "open" && isOverdue(c.due_date) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-destructive",
								children: "Overdue"
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "ml-auto",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditCommitment, {
									customerId,
									commitment: c,
									team: record.team
								})
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
						["Owner", dash(c.owner_name)],
						["Due", fmtDate(c.due_date)],
						["Fulfilled", fmtDate(c.fulfilled_at)]
					] })] }, c.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No commitments recorded" })
			}),
			launchStateConflict(impl) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: "Data quality — launch state conflict"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-[12px]",
					children: [
						"Current stage is ",
						stageLabel(impl.current_stage),
						", which sits after Launch, but",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono",
							children: "actual_launch_date"
						}),
						" is not recorded. This is a record completeness gap, not an operational blocker."
					]
				})]
			}) : null,
			preHandoffHistory.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
						children: "Pre-handoff — recorded before this app owned the journey"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-1.5 space-y-1",
						children: preHandoffHistory.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex flex-wrap items-baseline gap-x-3 text-[12px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-medium",
								children: stageLabel(h.stage)
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-muted-foreground",
								children: [fmtDateTime(h.entered_at), h.exited_at ? ` → ${fmtDateTime(h.exited_at)}` : ""]
							})]
						}, h.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1.5 text-[11px] text-muted-foreground",
						children: "Not an implementation stage. Kept as historical fact only."
					})
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Stage timeline",
				count: LIFECYCLE_STAGES.length,
				meta: "From stage history",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: LIFECYCLE_STAGES.map((stage, i) => {
						const h = historyByStage.get(stage.id);
						const state = i === activeIndex ? "current" : h || activeIndex > -1 && i < activeIndex ? "completed" : "upcoming";
						const days = duration(h);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex gap-3 px-3 py-2.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "w-6 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground",
									children: String(i + 1).padStart(2, "0")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", state === "current" ? "bg-primary" : state === "completed" ? "bg-status-ontrack-foreground" : "bg-muted-foreground/40") }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-baseline gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: cn("text-[13px]", state === "upcoming" ? "text-muted-foreground" : "font-medium"),
												children: stage.label
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
												children: state
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-0.5 text-[11px] text-muted-foreground",
											children: stage.intent
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
											["Entered", h ? fmtDateTime(h.entered_at) : "—"],
											["Exited", h?.exited_at ? fmtDateTime(h.exited_at) : h ? "in stage" : "—"],
											["Duration", days == null ? "—" : `${days}d`],
											["By", dash(h?.entered_by_name)]
										] }),
										h?.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 text-[12px] text-muted-foreground",
											children: h.notes
										}) : null,
										state === "current" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-2 rounded-sm border border-border bg-muted/50 px-2 py-1.5",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
												children: "Blocking progression"
											}), open.risks.length + open.issues.length + open.escalations.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
												className: "mt-1 space-y-0.5",
												children: [
													...open.escalations,
													...open.risks,
													...open.issues
												].map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
													className: "flex flex-wrap items-baseline gap-2 text-[12px]",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: x.severity }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: x.title }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "text-[11px] text-muted-foreground",
															children: humanize(x.status)
														})
													]
												}, x.id))
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-1 text-[12px] text-muted-foreground",
												children: "Nothing open against this stage."
											})]
										}) : null
									]
								})
							]
						}, stage.id);
					})
				})
			})
		]
	});
}
function SolutionTab({ record, customerId }) {
	const solutions = record.technical_solutions;
	const mappings = solutions.flatMap((s) => (s.field_mappings ?? []).map((m) => ({
		...m,
		solution_title: s.title
	})));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Business requirements",
				count: record.requirements.length,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-3 py-2.5 text-[12px] text-muted-foreground",
					children: [
						record.requirements.length,
						" requirement(s) drive this solution.",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/customers/$customerId",
							params: { customerId },
							search: { tab: "requirements" },
							className: "underline",
							children: "Open the Requirements tab →"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Solution",
				count: solutions.length,
				meta: "Design record",
				children: solutions.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: solutions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-baseline gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium",
							children: s.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: s.status })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1.5 grid gap-2 md:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: "Design summary"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] leading-relaxed",
							children: dash(s.design_summary)
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: "Configuration details"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "whitespace-pre-wrap text-[12px] leading-relaxed",
							children: dash(s.configuration_details)
						})] })]
					})] }, s.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No solution recorded" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Solutions",
				count: solutions.length,
				children: solutions.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: solutions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-baseline gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/technical-solutions/$id",
							params: { id: s.id },
							className: "text-[13px] font-medium hover:underline",
							children: s.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: s.status })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
						["Owner", dash(s.owner_name)],
						["Implements requirement", dash(s.requirement_title)],
						["Created", fmtDate(s.created_at)],
						["Mappings", (s.field_mappings ?? []).length]
					] })] }, s.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No solutions" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Field mapping",
				count: mappings.length,
				children: mappings.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-[12px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Source field"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Source system"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "GoCanvas field"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Transformation / logic"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Required"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Status"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Solution"
								})
							]
						}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "divide-y divide-border",
							children: mappings.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5 font-mono",
									children: dash(m.source_field)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: dash(m.source_system)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5 font-mono",
									children: dash(m.target_field)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: dash(m.transformation_notes)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: m.required == null ? "—" : m.required ? "Yes" : "No"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: m.status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: m.status }) : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5 text-muted-foreground",
									children: m.solution_title
								})
							] }, m.id))
						})]
					})
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No field mappings recorded" })
			})
		]
	});
}
function RequirementsTab({ record, customerId }) {
	const impl = record.implementation;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Requirements",
		count: record.requirements.length,
		meta: "Traceability and validation from linked records",
		action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddRequirement, {
			customerId,
			implementationId: impl.id,
			team: record.team
		}),
		children: record.requirements.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: record.requirements.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium",
							children: r.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: r.priority }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: r.status }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditRequirement, {
								customerId,
								requirement: r,
								team: record.team
							})
						})
					]
				}),
				r.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[12px] leading-relaxed text-muted-foreground",
					children: r.description
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
					["Source", dash(r.source)],
					["Category", dash(r.category)],
					["Scope", humanize(r.scope_status)],
					["Owner", dash(r.owner_name)],
					["Approval", r.validation.approval_status ? humanize(r.validation.approval_status) : "—"],
					["Evidence", r.validation.evidence_count || "—"]
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-1.5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TraceChain, { trace: r.trace })
				})
			] }, r.id))
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No requirements recorded" })
	});
}
function DecisionsTab({ record, customerId }) {
	const impl = record.implementation;
	const decisions = record.decisions;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Decisions",
		count: decisions.length,
		meta: "What was decided, by whom, when, and what it affects",
		action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddDecision, {
			customerId,
			implementationId: impl.id
		}),
		children: decisions.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: decisions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium",
							children: d.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: d.status }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditDecision, {
								customerId,
								decision: d
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-[12px] leading-relaxed",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: "Decided by · "
						}),
						d.decided_by ?? "Not recorded",
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-muted-foreground",
							children: [
								" ",
								"· ",
								d.decision_date ? `on ${fmtDate(d.decision_date)}` : "date not recorded"
							]
						})
					]
				}),
				d.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-0.5 text-[12px] leading-relaxed",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-muted-foreground",
						children: "What was decided · "
					}), d.description]
				}) : null,
				d.rationale ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-0.5 text-[12px] leading-relaxed",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-muted-foreground",
						children: "Why · "
					}), d.rationale]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70",
						children: "Affects"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TraceChain, { trace: d.links ?? [] })]
				})
			] }, d.id))
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No decisions recorded" })
	});
}
function RisksTab({ record, customerId }) {
	const impl = record.implementation;
	const risks = record.risks;
	const issues = record.issues;
	const escalations = record.escalations;
	const riskOptions = risks.map((r) => ({
		id: r.id,
		title: r.title
	}));
	const issueOptions = issues.map((r) => ({
		id: r.id,
		title: r.title
	}));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Risks",
				count: risks.length,
				action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddRisk, {
					customerId,
					implementationId: impl.id,
					team: record.team
				}),
				children: risks.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: risks.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px] font-medium",
									children: r.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: r.severity }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: r.status }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditRisk, {
										customerId,
										risk: r,
										team: record.team
									})
								})
							]
						}),
						r.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: r.description
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
							["Likelihood", humanize(r.likelihood)],
							["Owner", dash(r.owner_name)],
							["Identified", fmtDate(r.identified_at)],
							["Resolved", fmtDate(r.resolved_at)],
							["Impact", dash(r.impact)]
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Mitigation · "
							}), dash(r.mitigation)]
						})
					] }, r.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No risks recorded" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Issues",
				count: issues.length,
				action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddIssue, {
					customerId,
					implementationId: impl.id,
					team: record.team
				}),
				children: issues.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: issues.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px] font-medium",
									children: r.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: r.severity }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: r.status }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditIssue, {
										customerId,
										issue: r,
										team: record.team
									})
								})
							]
						}),
						r.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: r.description
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
							["Owner", dash(r.owner_name)],
							["Raised", fmtDate(r.raised_at)],
							["Resolved", fmtDate(r.resolved_at)]
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Resolution · "
							}), dash(r.resolution)]
						})
					] }, r.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No issues recorded" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Escalations",
				count: escalations.length,
				action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddEscalation, {
					customerId,
					implementationId: impl.id,
					team: record.team,
					risks: riskOptions,
					issues: issueOptions
				}),
				children: escalations.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: escalations.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px] font-medium",
									children: e.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: e.severity }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: e.status }),
								e.escalation_type ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
									children: humanize(e.escalation_type)
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditEscalation, {
										customerId,
										escalation: e,
										team: record.team,
										risks: riskOptions,
										issues: issueOptions
									})
								})
							]
						}),
						e.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: e.description
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
							["Owner", dash(e.raised_by_name)],
							["Raised", fmtDate(e.raised_at)],
							["Resolved", fmtDate(e.resolved_at)],
							["Linked issue", dash(e.related_issue_title)],
							["Linked risk", dash(e.related_risk_title)]
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Resolution · "
							}), dash(e.resolution_summary)]
						})
					] }, e.id))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No escalations recorded" })
			})
		]
	});
}
var EVIDENCE_TAB = {
	requirement: "requirements",
	requirements: "requirements",
	decision: "decisions",
	decisions: "decisions",
	technical_solution: "solution",
	technical_solutions: "solution",
	field_mapping: "solution",
	risk: "risks",
	risks: "risks",
	issue: "risks",
	issues: "risks",
	escalation: "risks",
	escalations: "risks",
	milestone: "journey",
	implementation: "overview",
	success_criterion: "overview",
	approval: "evidence"
};
function EvidenceTab({ record, customerId }) {
	const evidence = record.evidence;
	const approvals = record.approvals;
	const impl = record.implementation;
	const related = [
		...record.requirements.map((r) => ({
			type: "requirement",
			id: r.id,
			title: r.title
		})),
		...record.decisions.map((d) => ({
			type: "decision",
			id: d.id,
			title: d.title
		})),
		...record.risks.map((r) => ({
			type: "risk",
			id: r.id,
			title: r.title
		})),
		...record.issues.map((i) => ({
			type: "issue",
			id: i.id,
			title: i.title
		})),
		...record.escalations.map((e) => ({
			type: "escalation",
			id: e.id,
			title: e.title
		})),
		...record.milestones.map((m) => ({
			type: "milestone",
			id: m.id,
			title: m.name
		})),
		...record.technical_solutions.map((s) => ({
			type: "technical_solution",
			id: s.id,
			title: s.title
		})),
		...record.success_criteria.map((s) => ({
			type: "success_criterion",
			id: s.id,
			title: s.description
		}))
	];
	const evidenceOptions = evidence.map((e) => ({
		id: e.id,
		title: e.title
	}));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "Proof",
			count: evidence.length,
			meta: "What we can show, and the record it backs up",
			action: impl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddEvidence, {
				customerId,
				implementationId: impl.id,
				team: record.team,
				related
			}) : null,
			children: evidence.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "divide-y divide-border",
				children: evidence.map((e) => {
					const target = e.related_entity_type ? EVIDENCE_TAB[e.related_entity_type] ?? null : null;
					const supportLabel = e.related_entity_type ? `${humanize(e.related_entity_type)}: ${e.related_label ?? "record"}` : null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
									children: humanize(e.type)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px] font-medium",
									children: e.title
								}),
								e.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
									href: e.url,
									target: "_blank",
									rel: "noreferrer",
									className: "text-[11px] underline",
									children: "Open link"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditEvidence, {
										customerId,
										evidence: e,
										team: record.team,
										related
									})
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px] leading-relaxed",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Backs up · "
							}), supportLabel ? target ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/customers/$customerId",
								params: { customerId },
								search: { tab: target },
								className: "underline",
								children: supportLabel
							}) : supportLabel : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Not linked to a record yet — add the record it supports"
							})]
						}),
						e.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 text-[12px] leading-relaxed",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "What it shows · "
							}), e.description]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [["Added by", dash(e.uploaded_by_name)], ["Added", fmtDateTime(e.created_at)]] })
					] }, e.id);
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No proof recorded yet" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: "Approvals",
			count: approvals.length,
			meta: "What was signed off, by whom, and when",
			action: impl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddApproval, {
				customerId,
				implementationId: impl.id,
				related,
				evidenceOptions,
				contacts: record.contacts
			}) : null,
			children: approvals.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "divide-y divide-border",
				children: approvals.map((a) => {
					const proof = a.evidence_id ? evidence.find((e) => e.id === a.evidence_id) ?? null : null;
					const contact = a.customer_contact_id ? record.contacts.find((c) => c.id === a.customer_contact_id) ?? null : null;
					const approver = a.approver_name ?? contact?.name ?? null;
					const approverRole = a.approver_role ?? contact?.role ?? null;
					const decided = a.status === "approved" || a.status === "rejected";
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[13px] font-medium",
									children: a.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: a.status }),
								a.approved_entity_type === "success_criterion" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditApproval, {
										customerId,
										approval: a,
										related,
										evidenceOptions,
										contacts: record.contacts
									})
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px] leading-relaxed",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Approves · "
							}), a.approved_entity_label ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [a.approved_entity_type ? `${humanize(a.approved_entity_type)}: ` : "", a.approved_entity_label] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: "Not linked to a record — the title above is all we hold"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 text-[12px] leading-relaxed",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted-foreground",
									children: decided ? `${humanize(a.status)} by · ` : "Waiting on · "
								}),
								approver ?? "Approver not recorded",
								approverRole ? ` (${approverRole})` : ""
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, { items: [
							["Requested", fmtDate(a.requested_at)],
							["Decided", decided ? fmtDate(a.decided_at) : "Not decided yet"],
							["Supporting proof", proof ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/customers/$customerId",
								params: { customerId },
								search: { tab: "evidence" },
								className: "underline",
								children: proof.title
							}) : "—"]
						] })
					] }, a.id);
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No approvals recorded" })
		})]
	});
}
function HistoryTab({ record }) {
	const entries = [
		...record.stage_history.map((h) => ({
			key: `stage-${h.id}`,
			at: h.entered_at,
			actor: h.entered_by_name,
			entity: "Implementation",
			field: "current_stage",
			change: `→ ${stageLabel(h.stage)}`,
			reason: h.notes
		})),
		...record.stage_history.filter((h) => h.exited_at).map((h) => ({
			key: `stage-exit-${h.id}`,
			at: h.exited_at,
			actor: h.entered_by_name,
			entity: "Implementation",
			field: "stage_exit",
			change: `${stageLabel(h.stage)} exited`,
			reason: null
		})),
		...record.audit_log.map((a) => ({
			key: `audit-${a.id}`,
			at: a.changed_at,
			actor: a.changed_by_name,
			entity: humanize(a.entity_type),
			field: a.field_name ?? "—",
			change: a.field_name ? `${a.old_value ?? "—"} → ${a.new_value ?? "—"}` : "record updated",
			reason: a.change_reason
		}))
	].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Change history",
		count: entries.length,
		level: "reference",
		meta: "Stage history + audit log",
		children: entries.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-x-auto",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full text-[12px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "When"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Actor"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Entity"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Field"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Change"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Reason"
						})
					]
				}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
					className: "divide-y divide-border",
					children: entries.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "whitespace-nowrap px-3 py-1.5 font-mono text-[11px]",
							children: fmtDateTime(e.at)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5",
							children: dash(e.actor)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5",
							children: e.entity
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5 font-mono text-[11px]",
							children: e.field
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5",
							children: e.change
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5 text-muted-foreground",
							children: dash(e.reason)
						})
					] }, e.key))
				})]
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No recorded changes" })
	});
}
//#endregion
export { Customer360Page as component };
