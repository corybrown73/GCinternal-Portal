import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { i as fmtMoney, n as fmtDate, r as fmtDateTime, t as daysSince } from "./hub-format--ProSxvQ.mjs";
import { n as STAGE_LABELS, t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { B as useProfile, I as canEditSales, L as canManage, R as isSuperAdmin, bt as startOnboardingForDeal, ct as addReport, dn as cn, dt as generateBriefForDeal, ft as getBriefDownloadUrl, gt as removeReport, ht as removeNote, st as addNote, ut as createTamRequestForDeal, v as Route$20, vt as setNoteReviewed, y as dealQuery } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { O as ArrowRight, o as Trash2, v as FileText, y as Download } from "../_libs/lucide-react.mjs";
import { i as Panel, n as Field, r as NoRows } from "./record-BXejhTdA.mjs";
import { t as Markdown } from "../_libs/react-markdown+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/deals._dealId-BS2Z-eI-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
var primaryButtonClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function StageChip({ stage }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-foreground",
		children: STAGE_LABELS[stage] ?? stage
	});
}
var TAM_STATUS_CLASS = {
	pending: "bg-status-risk text-status-risk-foreground",
	approved: "bg-status-ontrack text-status-ontrack-foreground",
	declined: "bg-status-blocked text-status-blocked-foreground",
	expired: "bg-muted text-muted-foreground"
};
var BRIEF_STATUS_CLASS = {
	queued: "bg-muted text-muted-foreground",
	generating: "bg-status-risk text-status-risk-foreground",
	complete: "bg-status-ontrack text-status-ontrack-foreground",
	failed: "bg-status-blocked text-status-blocked-foreground"
};
function StatusChip({ value, map }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", map[value] ?? "bg-muted text-muted-foreground"),
		children: value.replace(/_/g, " ")
	});
}
var markdownClass = "text-[13px] leading-relaxed [&_h1]:text-[14px] [&_h1]:font-semibold [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:text-[13px] [&_h3]:font-medium [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground";
function DealPage() {
	const { dealId } = Route$20.useParams();
	const { data } = useSuspenseQuery(dealQuery(dealId));
	if (!data) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "p-6 text-[13px] text-muted-foreground",
		children: "This deal does not exist."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DealRecord, { deal: data });
}
function DealRecord({ deal }) {
	const { account } = deal;
	const days = daysSince(account.stage_entered_at);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: account.name,
		...account.summary ? { description: account.summary } : {},
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StartOnboarding, { deal })
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageChip, { stage: account.stage }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-mono text-[11px] text-muted-foreground",
						children: [days ?? 0, "d in stage"]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "ARR",
					value: account.arr != null ? fmtMoney(account.arr) : "—"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Salesforce",
					value: account.salesforce_id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono",
						children: account.salesforce_id
					}) : "—"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Domain",
					value: account.domain ?? "—"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "AM owner",
					value: deal.am_owner_name ?? "Unassigned"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "SE owner",
					value: deal.se_owner_name ?? "—"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Created",
					value: fmtDate(account.created_at)
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 xl:grid-cols-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReportsPanel, { deal }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotesPanel, { deal })]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BriefsPanel, { deal }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TamPanel, { deal }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HistoryPanel, { deal })
				]
			})]
		})]
	})] });
}
function StartOnboarding({ deal }) {
	const { profile } = useProfile();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const start = useServerFn(startOnboardingForDeal);
	const mutation = useMutation({
		mutationFn: () => start({ data: { dealId: deal.account.id } }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
			queryClient.invalidateQueries({ queryKey: ["pipeline"] });
			queryClient.invalidateQueries({ queryKey: ["home"] });
			navigate({
				to: "/customers/$customerId",
				params: { customerId: result.customerId }
			});
		}
	});
	if (deal.account.customer_id) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: "/customers/$customerId",
		params: { customerId: deal.account.customer_id },
		className: primaryButtonClass,
		children: ["View implementation ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3" })]
	});
	const allowed = canEditSales(profile?.role) || canManage(profile?.role);
	const stageReady = STAGES.indexOf(deal.account.stage) >= STAGES.indexOf("closed_won");
	if (!allowed || !stageReady) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-end gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: primaryButtonClass,
			disabled: mutation.isPending,
			onClick: () => mutation.mutate(),
			children: [
				mutation.isPending ? "Starting…" : "Start onboarding",
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3" })
			]
		}), mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] text-destructive",
			children: mutation.error.message
		}) : null]
	});
}
function ReportsPanel({ deal }) {
	const { profile } = useProfile();
	const queryClient = useQueryClient();
	const create = useServerFn(addReport);
	const destroy = useServerFn(removeReport);
	const fileRef = (0, import_react.useRef)(null);
	const [adding, setAdding] = (0, import_react.useState)(false);
	const [title, setTitle] = (0, import_react.useState)("");
	const [reportType, setReportType] = (0, import_react.useState)("call_notes");
	const [contentMd, setContentMd] = (0, import_react.useState)("");
	const [expanded, setExpanded] = (0, import_react.useState)(null);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
	const addMutation = useMutation({
		mutationFn: () => create({ data: {
			dealId: deal.account.id,
			title: title.trim(),
			reportType,
			contentMd: contentMd.trim()
		} }),
		onSuccess: () => {
			invalidate();
			setAdding(false);
			setTitle("");
			setContentMd("");
		}
	});
	const deleteMutation = useMutation({
		mutationFn: (reportId) => destroy({ data: { reportId } }),
		onSuccess: invalidate
	});
	const canDelete = (uploadedBy) => Boolean(profile) && (uploadedBy === profile.id || isSuperAdmin(profile.role));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		title: "Notes & Gong reports",
		count: deal.gong_reports.length,
		action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: buttonClass,
			onClick: () => setAdding((v) => !v),
			children: adding ? "Close" : "Add report"
		}),
		children: [adding ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "space-y-2 border-b border-border bg-surface px-3 py-2.5",
			onSubmit: (e) => {
				e.preventDefault();
				if (!addMutation.isPending) addMutation.mutate();
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-[1fr_10rem] gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: labelClass,
						children: "Title *"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						value: title,
						onChange: (e) => setTitle(e.target.value),
						required: true
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: labelClass,
						children: "Type"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass,
						value: reportType,
						onChange: (e) => setReportType(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "call_notes",
							children: "Call notes"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "account_map",
							children: "Account map"
						})]
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: labelClass,
							children: "Markdown *"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass,
							onClick: () => fileRef.current?.click(),
							children: "Upload .md / .txt"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							ref: fileRef,
							type: "file",
							accept: ".md,.txt,text/markdown,text/plain",
							className: "hidden",
							onChange: async (e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								setContentMd(await file.text());
								if (title.trim() === "") setTitle(file.name.replace(/\.(md|txt)$/i, ""));
								e.target.value = "";
							}
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: areaClass,
					rows: 6,
					value: contentMd,
					placeholder: "Paste the Gong summary or meeting notes as markdown…",
					onChange: (e) => setContentMd(e.target.value),
					required: true
				})] }),
				addMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] text-destructive",
					children: addMutation.error.message
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex justify-end",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						className: primaryButtonClass,
						disabled: addMutation.isPending || title.trim() === "" || contentMd.trim() === "",
						children: addMutation.isPending ? "Saving…" : "Save report"
					})
				})
			]
		}) : null, deal.gong_reports.length === 0 && !adding ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No reports yet. Paste Gong call notes or an account map to feed brief generation." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: deal.gong_reports.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "px-3 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "flex min-w-0 items-center gap-2 text-left",
						onClick: () => setExpanded(expanded === r.id ? null : r.id),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
								className: "h-3.5 w-3.5 shrink-0 text-muted-foreground",
								strokeWidth: 1.75
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate text-[13px] font-medium hover:underline",
								children: r.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
								children: r.report_type === "account_map" ? "Account map" : "Call notes"
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: r.uploaded_by_name ?? "—" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: fmtDate(r.created_at)
							}),
							canDelete(r.uploaded_by) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								title: "Delete report",
								className: "text-muted-foreground hover:text-destructive",
								onClick: () => deleteMutation.mutate(r.id),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
									className: "h-3.5 w-3.5",
									strokeWidth: 1.75
								})
							}) : null
						]
					})]
				}), expanded === r.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("mt-2 rounded-sm bg-surface px-3 py-2", markdownClass),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Markdown, { children: r.content_md })
				}) : null]
			}, r.id))
		})]
	});
}
function BriefsPanel({ deal }) {
	const queryClient = useQueryClient();
	const generate = useServerFn(generateBriefForDeal);
	const download = useServerFn(getBriefDownloadUrl);
	const generateMutation = useMutation({
		mutationFn: () => generate({ data: { dealId: deal.account.id } }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] })
	});
	const downloadMutation = useMutation({
		mutationFn: (briefId) => download({ data: { briefId } }),
		onSuccess: ({ url }) => {
			window.open(url, "_blank", "noopener");
		}
	});
	const latestComplete = deal.briefs.find((b) => b.status === "complete");
	const questions = Array.isArray((latestComplete?.structured_json)?.discovery_questions) ? latestComplete.structured_json.discovery_questions : [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		title: "Account brief",
		count: deal.briefs.length,
		action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: buttonClass,
			disabled: generateMutation.isPending,
			onClick: () => generateMutation.mutate(),
			children: generateMutation.isPending ? "Generating…" : "Generate brief"
		}),
		children: [
			generateMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-border px-3 py-2 text-[11px] text-destructive",
				children: generateMutation.error.message
			}) : null,
			downloadMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-border px-3 py-2 text-[11px] text-destructive",
				children: downloadMutation.error.message
			}) : null,
			deal.briefs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No briefs yet. Add at least one Gong report, then generate one." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "divide-y divide-border",
				children: deal.briefs.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between gap-2 px-3 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-w-0 items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								value: b.status,
								map: BRIEF_STATUS_CLASS
							}),
							b.generator ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
								children: b.generator
							}) : null,
							b.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate text-[11px] text-destructive",
								title: b.error,
								children: b.error
							}) : null
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: b.created_by_name ?? "—" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: fmtDateTime(b.created_at)
							}),
							b.status === "complete" && b.pptx_storage_path ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: buttonClass,
								disabled: downloadMutation.isPending,
								onClick: () => downloadMutation.mutate(b.id),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-3 w-3" }), " .pptx"]
							}) : null
						]
					})]
				}, b.id))
			}),
			questions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "bg-surface px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
					children: "Discovery questions · latest brief"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: questions.map((q, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px]",
							children: q.question
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 text-[11px] text-muted-foreground",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] uppercase tracking-wider",
									children: q.category
								}),
								" · ",
								q.why_it_matters
							]
						})]
					}, i))
				})]
			}) : null
		]
	});
}
function TamPanel({ deal }) {
	const queryClient = useQueryClient();
	const create = useServerFn(createTamRequestForDeal);
	const [justification, setJustification] = (0, import_react.useState)("");
	const [urgency, setUrgency] = (0, import_react.useState)("medium");
	const [formOpen, setFormOpen] = (0, import_react.useState)(false);
	const hasPending = deal.tam_requests.some((t) => t.status === "pending");
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			dealId: deal.account.id,
			justification: justification.trim(),
			urgency
		} }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
			setJustification("");
			setFormOpen(false);
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		title: "TAM request",
		count: deal.tam_requests.length,
		action: hasPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[11px] text-muted-foreground",
			children: "Awaiting a decision"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: buttonClass,
			onClick: () => setFormOpen((v) => !v),
			children: formOpen ? "Close" : "Request a TAM"
		}),
		children: [formOpen && !hasPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "space-y-2 border-b border-border bg-surface px-3 py-2.5",
			onSubmit: (e) => {
				e.preventDefault();
				if (!mutation.isPending) mutation.mutate();
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: labelClass,
					children: "Justification * (min 10 characters)"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: areaClass,
					rows: 3,
					value: justification,
					onChange: (e) => setJustification(e.target.value),
					required: true
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-end justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "w-36",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: labelClass,
							children: "Urgency"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass,
							value: urgency,
							onChange: (e) => setUrgency(e.target.value),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "low",
									children: "Low"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "medium",
									children: "Medium"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "high",
									children: "High"
								})
							]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						className: primaryButtonClass,
						disabled: mutation.isPending || justification.trim().length < 10,
						children: mutation.isPending ? "Sending…" : "Send request"
					})]
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] text-destructive",
					children: mutation.error.message
				}) : null
			]
		}) : null, deal.tam_requests.length === 0 && !formOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No TAM requests. Approvers get one-click approve/decline links by email." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: deal.tam_requests.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "px-3 py-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex min-w-0 items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
								value: t.status,
								map: TAM_STATUS_CLASS
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
								children: t.urgency
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "shrink-0 font-mono text-[11px] text-muted-foreground",
							children: fmtDate(t.created_at)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[12px]",
						children: t.justification
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-0.5 text-[11px] text-muted-foreground",
						children: [t.requested_by_name ?? t.requester_email, t.decided_at ? ` · decided ${fmtDate(t.decided_at)}${t.decided_via ? ` via ${t.decided_via}` : ""}${t.decision_note ? ` — ${t.decision_note}` : ""}` : null]
					})
				]
			}, t.id))
		})]
	});
}
function NotesPanel({ deal }) {
	const { profile } = useProfile();
	const queryClient = useQueryClient();
	const create = useServerFn(addNote);
	const review = useServerFn(setNoteReviewed);
	const destroy = useServerFn(removeNote);
	const [body, setBody] = (0, import_react.useState)("");
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["deal", deal.account.id] });
	const addMutation = useMutation({
		mutationFn: () => create({ data: {
			dealId: deal.account.id,
			bodyMd: body.trim()
		} }),
		onSuccess: () => {
			invalidate();
			setBody("");
		}
	});
	const reviewMutation = useMutation({
		mutationFn: (vars) => review({ data: vars }),
		onSuccess: invalidate
	});
	const deleteMutation = useMutation({
		mutationFn: (noteId) => destroy({ data: { noteId } }),
		onSuccess: invalidate
	});
	const canDelete = (authorId) => Boolean(profile) && (authorId === profile.id || isSuperAdmin(profile.role));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		title: "Onboarding plan / sales notes",
		count: deal.notes.length,
		meta: "Reviewed notes feed brief generation",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "space-y-1.5 border-b border-border bg-surface px-3 py-2.5",
			onSubmit: (e) => {
				e.preventDefault();
				if (!addMutation.isPending && body.trim() !== "") addMutation.mutate();
			},
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				className: areaClass,
				rows: 3,
				value: body,
				placeholder: "What should the onboarding team know? Markdown is fine.",
				onChange: (e) => setBody(e.target.value)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [addMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] text-destructive",
					children: addMutation.error.message
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "submit",
					className: primaryButtonClass,
					disabled: addMutation.isPending || body.trim() === "",
					children: addMutation.isPending ? "Saving…" : "Add note"
				})]
			})]
		}), deal.notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No notes yet." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: deal.notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "px-3 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2 text-[11px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						n.author_name ?? "—",
						" ·",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono",
							children: fmtDateTime(n.created_at)
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn("rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", n.review_status === "reviewed" ? "border-transparent bg-status-ontrack text-status-ontrack-foreground" : "border-border text-muted-foreground hover:text-foreground"),
							title: n.review_status === "reviewed" ? `Reviewed by ${n.reviewed_by_name ?? "someone"} — click to reopen` : "Mark reviewed so brief generation can use it",
							onClick: () => reviewMutation.mutate({
								noteId: n.id,
								reviewed: n.review_status !== "reviewed"
							}),
							children: n.review_status === "reviewed" ? "Reviewed" : "Needs review"
						}), canDelete(n.author_id) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							title: "Delete note",
							className: "text-muted-foreground hover:text-destructive",
							onClick: () => deleteMutation.mutate(n.id),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
								className: "h-3.5 w-3.5",
								strokeWidth: 1.75
							})
						}) : null]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("mt-1", markdownClass),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Markdown, { children: n.body_md })
				})]
			}, n.id))
		})]
	});
}
function HistoryPanel({ deal }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Stage history",
		count: deal.stage_history.length,
		level: "supporting",
		children: deal.stage_history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No stage changes recorded." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border/70",
			children: deal.stage_history.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "flex items-start justify-between gap-3 px-3 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[12px]",
						children: [t.from_stage ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [STAGE_LABELS[t.from_stage] ?? t.from_stage, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mx-1 text-muted-foreground",
							children: "→"
						})] }) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-medium",
							children: STAGE_LABELS[t.to_stage] ?? t.to_stage
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-0.5 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10px] uppercase tracking-wider",
								children: t.source
							}),
							t.actor_name ? ` · ${t.actor_name}` : null,
							t.note ? ` · ${t.note}` : null
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "shrink-0 font-mono text-[11px] text-muted-foreground",
					children: fmtDateTime(t.occurred_at)
				})]
			}, t.id))
		})
	});
}
//#endregion
export { DealPage as component };
