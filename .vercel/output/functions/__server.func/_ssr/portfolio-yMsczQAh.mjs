import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { d as stageLabel, i as fmtMoney, n as fmtDate, o as humanize } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { D as leadershipQuery$1, dn as cn } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { O as ArrowRight, t as X } from "../_libs/lucide-react.mjs";
import { i as Panel, o as SeverityChip, r as NoRows, s as StageBadge } from "./record-BXejhTdA.mjs";
import { t as READINESS_STATE_LABEL } from "./graduation-readiness-DKDYA6-i.mjs";
import { a as completedStageDwell, c as interventions, f as portfolioFilterAccounts, g as valueCoverage, h as stuckWork, i as adoptionCoverage, l as launchBoard, m as stageDistribution, n as PORTFOLIO_FILTER_LABEL, o as completedTransitions, p as portfolioRollup, r as accountRows, s as graduationGate, t as AccountRowList, u as ownerLoad } from "./account-rows-AVdgXCys.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portfolio-yMsczQAh.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function CustomerLink({ impl, tab = "overview", className, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
		to: "/customers/$customerId",
		params: { customerId: impl.customer_id },
		search: { tab },
		className: cn("font-medium hover:underline", className),
		children: children ?? impl.customer_name
	});
}
function Owner({ name, emphasis }) {
	const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("uppercase tracking-[0.08em] text-muted-foreground", emphasis && "text-[10px]"),
		children: "Owner"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(emphasis && "font-semibold tracking-tight"),
		children: name ?? "Unassigned"
	})] });
	const base = cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", name ? "border-border bg-muted text-foreground" : "border-dashed border-destructive/50 text-destructive", emphasis && name && "border-foreground/25 bg-secondary text-[12px]");
	if (!name) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: base,
		children: body
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
		to: "/owners/$owner",
		params: { owner: name },
		className: cn(base, "hover:border-foreground/40 hover:bg-secondary"),
		title: `Open ${name}'s portfolio`,
		children: body
	});
}
function Metric({ label, value, tone, active, onSelect }) {
	const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
		children: label
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("mt-0.5 font-mono text-[18px] font-semibold leading-none", tone === "bad" && "text-status-blocked-foreground", tone === "warn" && "text-status-risk-foreground", tone === "good" && "text-status-on-track-foreground", tone === "muted" && "text-muted-foreground"),
		children: value
	})] });
	const base = "min-w-0 rounded-md border border-border bg-card px-3 py-2 text-left";
	if (!onSelect) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: base,
		children: body
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: onSelect,
		"aria-pressed": !!active,
		className: cn(base, "transition-colors hover:border-foreground/30 hover:bg-muted/50", active && "border-foreground/60 bg-secondary ring-1 ring-foreground/20"),
		children: body
	});
}
function implMeta(impl) {
	return [
		impl.arr != null ? `${fmtMoney(impl.arr)} ARR` : null,
		impl.tier ?? impl.segment ?? null,
		impl.target_launch_date ? `launch ${fmtDate(impl.target_launch_date)}` : null
	].filter(Boolean).join(" · ");
}
function LeadershipPage() {
	const { data } = useSuspenseQuery(leadershipQuery$1);
	const [filter, setFilter] = (0, import_react.useState)(null);
	const [stageFilter, setStageFilter] = (0, import_react.useState)(null);
	const [dwellStage, setDwellStage] = (0, import_react.useState)(null);
	const toggleFilter = (id) => setFilter((cur) => cur === id ? null : id);
	const rollup = portfolioRollup(data);
	const rows = interventions(data);
	const owners = ownerLoad(data);
	const stages = stageDistribution(data);
	const dwell = completedStageDwell(data.stage_history);
	const launches = launchBoard(data);
	const value = valueCoverage(data);
	const adoption = adoptionCoverage(data);
	const stuck = stuckWork(data);
	const gates = graduationGate(data);
	const accounts = filter ? portfolioFilterAccounts(data, filter) : accountRows(data, rows.map((r) => r.row.impl));
	const stageRow = stageFilter ? stages.find((s) => s.id === stageFilter) : null;
	const stageAccounts = stageRow ? accountRows(data, stageRow.implementations) : null;
	const transitions = dwellStage ? completedTransitions(data, dwellStage) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Leadership",
		description: "Where the team needs management intervention — concentration, coverage and the calls only a lead can make. Every row deep-links into the account it came from.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "font-mono text-[11px] text-muted-foreground",
			children: [
				rollup.total,
				" implementations · ",
				rollup.owners,
				" owners"
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 sm:grid-cols-3 lg:grid-cols-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "Act now",
						value: rollup.act_now,
						tone: rollup.act_now ? "bad" : "good",
						active: filter === "act_now",
						onSelect: () => toggleFilter("act_now")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "Needs attention",
						value: rollup.needs_attention,
						tone: rollup.needs_attention ? "warn" : "good",
						active: filter === "needs_attention",
						onSelect: () => toggleFilter("needs_attention")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "Blocked",
						value: rollup.health.blocked,
						tone: rollup.health.blocked ? "bad" : "muted",
						active: filter === "blocked",
						onSelect: () => toggleFilter("blocked")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "At risk",
						value: rollup.health.at_risk,
						tone: rollup.health.at_risk ? "warn" : "muted",
						active: filter === "at_risk",
						onSelect: () => toggleFilter("at_risk")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "On track",
						value: rollup.health.on_track,
						tone: "good",
						active: filter === "on_track",
						onSelect: () => toggleFilter("on_track")
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
						label: "Unassigned",
						value: rollup.unassigned,
						tone: rollup.unassigned ? "bad" : "muted",
						active: filter === "unassigned",
						onSelect: () => toggleFilter("unassigned")
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: filter ? `${PORTFOLIO_FILTER_LABEL[filter]} accounts` : "Accounts needing attention",
				count: accounts.length,
				meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: filter ? "Exactly the accounts counted by the selected card" : "Accounts a lead needs to step into · action derived from stored records only" }), filter ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setFilter(null),
						className: "flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
							className: "h-3 w-3",
							strokeWidth: 2
						}), "Show all"]
					}) : null]
				}),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountRowList, {
					accounts,
					showOwner: true,
					emptyLabel: filter ? `No ${PORTFOLIO_FILTER_LABEL[filter].toLowerCase()} accounts.` : "No account currently needs lead-level attention."
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Owner workload",
				count: owners.length,
				meta: "Counts and named accounts only — no capacity model, no utilisation",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-border",
					children: [owners.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "px-3 py-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1",
								children: [
									o.unassigned ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[13px] font-semibold text-destructive",
										children: o.owner
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/owners/$owner",
										params: { owner: o.owner },
										className: "text-[13px] font-semibold hover:underline",
										children: o.owner
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "font-mono text-[11px] text-muted-foreground",
										children: [
											o.implementations.length,
											" impl · ",
											o.act_now,
											" act now · ",
											o.blocked,
											" blocked ·",
											" ",
											o.at_risk,
											" at risk · ",
											o.launches_30d,
											" launch ≤30d"
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto font-mono text-[11px] text-muted-foreground",
										children: o.arr != null ? `${fmtMoney(o.arr)} ARR` : "ARR not recorded"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px]",
								children: o.implementations.map((impl) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
									impl,
									className: "text-[12px]"
								}, impl.id))
							}),
							o.flags.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-1 space-y-0.5",
								children: o.flags.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
									className: "text-[11px] text-status-risk-foreground",
									children: f
								}, f))
							}) : null
						]
					}, o.owner)), owners.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No implementations recorded." }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Lifecycle distribution",
					meta: "Select a stage to see the implementations in it",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: stages.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setStageFilter((cur) => cur === s.id ? null : s.id),
							"aria-pressed": stageFilter === s.id,
							disabled: s.implementations.length === 0,
							className: cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left", s.implementations.length ? "hover:bg-muted/60" : "cursor-default opacity-70", stageFilter === s.id && "bg-secondary"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "w-36 shrink-0 text-[13px] font-medium",
									children: s.label
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground",
									children: s.phase
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[12px]",
									children: s.implementations.length
								}),
								s.implementations.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-[11px] text-muted-foreground",
									children: [
										"longest ",
										s.longest_dwell_days,
										"d · ",
										s.longest_dwell_customer,
										s.over_flag ? ` · ${s.over_flag} over 14d` : ""
									]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] text-muted-foreground",
									children: "empty"
								})
							]
						}) }, s.id))
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Observed dwell (completed transitions)",
					count: dwell.length,
					meta: "Select a stage to see the completed transitions behind it",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "divide-y divide-border",
						children: [dwell.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setDwellStage((cur) => cur === d.stage ? null : d.stage),
							"aria-pressed": dwellStage === d.stage,
							className: cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60", dwellStage === d.stage && "bg-secondary"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "w-36 shrink-0 text-[13px] font-medium",
								children: d.stage
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [
									d.transitions,
									" completed · ",
									d.shortest_days,
									"–",
									d.longest_days,
									"d observed"
								]
							})]
						}) }, d.stage)), dwell.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No completed stage transitions recorded yet." }) : null]
					})
				})]
			}),
			stageRow && stageAccounts ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: `In ${stageRow.label} now`,
				count: stageAccounts.length,
				meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Implementations currently sitting in this stage" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setStageFilter(null),
						className: "flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
							className: "h-3 w-3",
							strokeWidth: 2
						}), "Close"]
					})]
				}),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountRowList, {
					accounts: stageAccounts,
					showOwner: true,
					showDaysInStage: true,
					emptyLabel: "Nothing is in this stage."
				})
			}) : null,
			dwellStage && transitions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: `Completed transitions through ${dwellStage}`,
				count: transitions.length,
				meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Every entry and exit behind the observed range" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setDwellStage(null),
						className: "flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
							className: "h-3 w-3",
							strokeWidth: 2
						}), "Close"]
					})]
				}),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-border",
					children: [transitions.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
						children: [
							t.impl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
								impl: t.impl,
								className: "text-[13px]"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[13px] text-muted-foreground",
								children: "Customer not recorded"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground",
								children: t.stage
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [
									fmtDate(t.entered_at),
									" → ",
									fmtDate(t.exited_at),
									" · ",
									t.days,
									"d"
								]
							}),
							t.impl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: t.impl.owner_name }) : null,
							t.impl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: "/customers/$customerId",
								params: { customerId: t.impl.customer_id },
								search: { tab: "journey" },
								className: "ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline",
								children: ["journey", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
									className: "h-3 w-3",
									strokeWidth: 2
								})]
							}) : null
						]
					}, t.key)), transitions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No completed transitions for this stage." }) : null]
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Launch and delivery risk",
				count: launches.slipped.length + launches.landing_30d.length + launches.conflict.length,
				meta: "Slipped · landing ≤30 days · recorded-state conflicts",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "divide-y divide-border",
					children: [
						[
							"Slipped",
							launches.slipped,
							"text-status-blocked-foreground"
						],
						[
							"Landing ≤30 days",
							launches.landing_30d,
							"text-status-risk-foreground"
						],
						[
							"Data conflict",
							launches.conflict,
							"text-muted-foreground"
						]
					].map(([label, group, tone]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: cn("text-[11px] font-medium uppercase tracking-[0.08em]", tone),
							children: [
								label,
								" · ",
								group.length
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-1 space-y-1",
							children: [group.map(({ impl, detail }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
										impl,
										tab: "journey",
										className: "text-[13px]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: impl.current_stage }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: impl.owner_name }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[11px] text-muted-foreground",
										children: detail
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto font-mono text-[11px] text-muted-foreground",
										children: implMeta(impl) || "No commercial context recorded"
									})
								]
							}, impl.id)), group.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
								className: "text-[11px] text-muted-foreground",
								children: "None."
							}) : null]
						})]
					}, label))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Value-proof coverage",
					count: value.rows.length,
					meta: `${value.no_criteria} of ${value.total} implementations have no success measure recorded`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "divide-y divide-border",
						children: [value.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
										impl: r.impl,
										className: "text-[13px]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: r.impl.current_stage }),
									r.late ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "rounded-sm bg-status-risk px-1.5 py-0.5 text-[11px] font-medium text-status-risk-foreground",
										children: [r.late, " late"]
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: r.impl.owner_name })
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: r.summary
							})]
						}, r.impl.id)), value.rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No implementations recorded." }) : null]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Adoption coverage",
					count: adoption.length,
					meta: "Implementations at or past Build · areas defined vs ever observed",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "divide-y divide-border",
						children: [adoption.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
										impl: r.impl,
										className: "text-[13px]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: r.impl.current_stage }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
										children: r.level_label
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: r.impl.owner_name })
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-0.5 text-[11px] text-muted-foreground",
								children: r.areas ? `${r.observed} of ${r.areas} areas observed${r.workarounds ? ` · ${r.workarounds} with a workaround in use` : ""}` : "No usage areas defined"
							})]
						}, r.impl.id)), adoption.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No implementations at or past Build." }) : null]
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Stuck work across the team",
				count: stuck.length,
				meta: "Item level · unowned, older than 14 days, overdue, or any open escalation",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-border",
					children: [stuck.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
								children: i.kind
							}),
							i.severity ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { value: i.severity }) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate text-[13px]",
								children: i.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
								impl: {
									customer_id: i.customer_id,
									customer_name: i.customer_name
								},
								tab: "risks",
								className: "text-[12px]"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: i.owner_name }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [
									i.age_days != null ? `${i.age_days}d` : "age unknown",
									i.overdue ? " · overdue" : "",
									i.stale ? " · stale" : ""
								]
							})
						]
					}, i.key)), stuck.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "Nothing stuck across the portfolio." }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Ready to hand over — gate review",
				count: gates.length,
				meta: "Scoped to Adopt and Graduate to CS · same readiness assessment as Customer 360",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-border",
					children: [gates.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "px-3 py-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
										impl: g.impl,
										className: "text-[13px]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: g.impl.current_stage }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Owner, { name: g.impl.owner_name }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: cn("ml-auto font-mono text-[11px]", g.summary.attention ? "text-status-risk-foreground" : "text-status-on-track-foreground"),
										children: [
											g.summary.attention,
											" attention · ",
											g.summary.ready,
											" ready"
										]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[12px]",
								children: g.summary.line
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-1 grid gap-x-6 gap-y-0.5 md:grid-cols-2",
								children: g.areas.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "text-[11px] text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-medium text-foreground",
											children: a.label
										}),
										" ·",
										" ",
										READINESS_STATE_LABEL[a.state],
										" · ",
										a.reason
									]
								}, a.id))
							})
						]
					}, g.impl.id)), gates.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No implementation is in Adopt or Graduate to CS." }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[11px] text-muted-foreground",
				children: [
					"No auth yet — this is the whole portfolio, not a filtered team. Nothing here is a score, forecast or trend: ",
					humanize("stage"),
					" dwell and counts come straight from stored records, and stages shown are the eight owned stages from ",
					stageLabel("handoff"),
					" onward."
				]
			})
		]
	})] });
}
//#endregion
export { LeadershipPage as component };
