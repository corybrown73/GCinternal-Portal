import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { d as stageLabel, l as normalizeStage, n as fmtDate, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { dn as cn, l as portalHomeQuery } from "./router-BT3neubm.mjs";
import { E as CalendarDays, T as Check, h as LifeBuoy, s as Sparkles } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal.index-6ODr3kCv.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Customer-facing horizontal stage tracker: completed / current / upcoming.
* Warmer and bigger than the internal rail, same token system.
*/
function StageTracker({ currentStage }) {
	const normalized = normalizeStage(currentStage);
	const currentIndex = normalized ? LIFECYCLE_STAGES.findIndex((s) => s.id === normalized) : -1;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
		className: "flex w-full items-start gap-0 overflow-x-auto pb-1",
		"aria-label": "Onboarding stages",
		children: LIFECYCLE_STAGES.map((stage, i) => {
			const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "flex min-w-[72px] flex-1 flex-col items-center gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex w-full items-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= currentIndex ? "bg-status-ontrack-foreground/60" : "bg-border") }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium", state === "done" && "border-status-ontrack-foreground/40 bg-status-ontrack text-status-ontrack-foreground", state === "current" && "border-primary bg-primary text-primary-foreground shadow-sm", state === "upcoming" && "border-border bg-card text-muted-foreground"),
							"aria-current": state === "current" ? "step" : void 0,
							children: state === "done" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-3.5 w-3.5" }) : i + 1
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("h-0.5 flex-1", i === LIFECYCLE_STAGES.length - 1 ? "bg-transparent" : i < currentIndex ? "bg-status-ontrack-foreground/60" : "bg-border") })
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("px-1 text-center text-[11px] leading-tight", state === "current" ? "font-semibold text-foreground" : "text-muted-foreground"),
					children: stage.label
				})]
			}, stage.id);
		})
	});
}
function ProgressBar({ pct }) {
	const clamped = Math.max(0, Math.min(100, pct));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "h-2.5 flex-1 overflow-hidden rounded-full bg-surface",
			role: "progressbar",
			"aria-valuenow": clamped,
			"aria-valuemin": 0,
			"aria-valuemax": 100,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "h-full rounded-full bg-primary transition-all",
				style: { width: `${clamped}%` }
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "font-mono text-[13px] font-medium tabular-nums",
			children: [clamped, "%"]
		})]
	});
}
function PortalHomePage() {
	const { data } = useSuspenseQuery(portalHomeQuery);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			data.implementations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md border border-border bg-card px-6 py-10 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[14px] font-medium",
					children: "Your onboarding hasn't started yet"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px] text-muted-foreground",
					children: "Once your implementation kicks off, you'll see live progress here."
				})]
			}) : data.implementations.map((impl) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-md border border-border bg-card p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-start justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
								children: "Your implementation"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "mt-0.5 text-[17px] font-semibold tracking-tight",
								children: impl.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-0.5 text-[12px] text-muted-foreground",
								children: ["Currently in ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium text-foreground",
									children: stageLabel(impl.current_stage)
								})]
							})
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-right",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { className: "mr-1 inline h-3 w-3 align-[-2px]" }), "Target launch"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 font-mono text-[13px] font-medium",
								children: fmtDate(impl.target_launch_date)
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageTracker, { currentStage: impl.current_stage })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
							children: "Overall progress"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProgressBar, { pct: impl.progress_pct })]
					})
				]
			}, impl.id)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-6 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-md border border-border bg-card",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "border-b border-border px-4 py-2.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-[13px] font-semibold",
							children: "Your next steps"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted-foreground",
							children: "What's coming up — items past their date are flagged."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: data.next_steps.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "px-4 py-6 text-center text-[12px] text-muted-foreground",
							children: "Nothing outstanding right now."
						}) : data.next_steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: cn("px-4 py-2.5", step.overdue && "bg-status-risk"),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: cn("text-[13px]", step.overdue && "text-status-risk-foreground font-medium"),
									children: step.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-0.5 text-[11px] text-muted-foreground",
									children: [
										step.kind === "commitment" ? "Commitment" : "Milestone",
										step.who ? ` · with ${step.who}` : "",
										" · ",
										step.implementation_name
									]
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: cn("shrink-0 font-mono text-[11px]", step.overdue ? "text-status-risk-foreground" : "text-muted-foreground"),
									children: [step.overdue ? "overdue · " : "", fmtDate(step.due_date)]
								})]
							})
						}, `${step.kind}-${step.id}`))
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-md border border-border bg-card",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "border-b border-border px-4 py-2.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-[13px] font-semibold",
							children: "Recent activity"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted-foreground",
							children: "Stage changes and completed milestones."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: data.activity.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "px-4 py-6 text-center text-[12px] text-muted-foreground",
							children: "No activity recorded yet."
						}) : data.activity.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-start gap-2.5 px-4 py-2.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "mt-0.5 h-3.5 w-3.5 shrink-0 text-status-ontrack-foreground" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate text-[13px]",
										children: item.label
									}), item.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[11px] text-muted-foreground",
										children: item.detail
									}) : null]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 font-mono text-[10px] text-muted-foreground",
									children: fmtDateTime(item.at)
								})
							]
						}, item.id))
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/portal/tickets",
				className: "block rounded-md border border-border bg-surface p-5 transition-colors hover:border-primary/50",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LifeBuoy, { className: "h-5 w-5" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-[14px] font-semibold",
								children: "Ask a question / Get help"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[12px] text-muted-foreground",
								children: "Send a question to your GoCanvas team — you'll get a response within 24 hours."
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[12px] font-medium text-primary",
							children: "Open →"
						})
					]
				})
			})
		]
	});
}
//#endregion
export { PortalHomePage as component };
