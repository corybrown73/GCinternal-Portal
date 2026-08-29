import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { i as useQuery, o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { B as useProfile, G as TICKET_PRIORITIES, H as PriorityChip, J as buttonClass, Q as selectClass, U as SlaChip, Ut as getHome, V as BreachBadge, W as TICKET_CATEGORIES, X as microLabelClass, Y as inputClass, Z as primaryButtonClass, dn as cn, i as Route$12 } from "./router-DuzTz6dO.mjs";
import { n as PageBody } from "./page-wX17g2fe.mjs";
import { r as NoRows } from "./record-BXejhTdA.mjs";
import { c as getTickets, n as addTicket } from "./tickets.functions-bkjSIB31.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets.index-Cpv5bvlm.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var FOURTEEN_DAYS_MS = 12096e5;
function TicketQueuePage() {
	const { profile } = useProfile();
	const { category, assignee } = Route$12.useSearch();
	const navigate = useNavigate({ from: Route$12.fullPath });
	const query = useQuery({
		queryKey: ["tickets"],
		queryFn: () => getTickets()
	});
	const setSearch = (patch) => navigate({ search: (prev) => ({
		...prev,
		...patch
	}) });
	const filtered = (query.data ?? []).filter((t) => category ? t.category === category : true).filter((t) => assignee === "mine" && profile ? t.assigned_to === profile.id : true);
	const bySla = (a, b) => a.sla_due_at.localeCompare(b.sla_due_at);
	const needsResponse = filtered.filter((t) => t.status === "open").sort(bySla);
	const inProgress = filtered.filter((t) => t.status === "in_progress").sort(bySla);
	const waiting = filtered.filter((t) => t.status === "waiting_customer").sort(bySla);
	const resolved = filtered.filter((t) => (t.status === "resolved" || t.status === "closed") && Date.now() - new Date(t.resolved_at ?? t.updated_at).getTime() < FOURTEEN_DAYS_MS).sort((a, b) => (b.resolved_at ?? b.updated_at).localeCompare(a.resolved_at ?? a.updated_at));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
							children: "Category"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterButton, {
							active: category === void 0,
							label: "All",
							onClick: () => setSearch({ category: void 0 })
						}),
						TICKET_CATEGORIES.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterButton, {
							active: category === c,
							label: humanize(c),
							onClick: () => setSearch({ category: category === c ? void 0 : c })
						}, c))
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
							children: "Assignee"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterButton, {
							active: assignee !== "mine",
							label: "All",
							onClick: () => setSearch({ assignee: void 0 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterButton, {
							active: assignee === "mine",
							label: "Mine",
							onClick: () => setSearch({ assignee: assignee === "mine" ? void 0 : "mine" })
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewTicket, {})]
		}), query.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
			children: "Loading tickets…"
		}) : query.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			role: "alert",
			className: "text-[13px] text-destructive",
			children: ["Could not load tickets: ", query.error.message]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSection, {
					title: "Needs first response",
					rows: needsResponse,
					emptyLabel: "Nothing waiting on a first response."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSection, {
					title: "In progress",
					rows: inProgress,
					emptyLabel: "Nothing in progress."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSection, {
					title: "Waiting on customer",
					rows: waiting,
					emptyLabel: "Nothing waiting on a customer."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSection, {
					title: "Resolved (last 14 days)",
					rows: resolved,
					emptyLabel: "Nothing resolved in the last 14 days."
				})
			]
		})]
	});
}
function FilterButton({ active, label, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: cn("rounded-sm border border-border px-1.5 py-0.5 text-[11px]", active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"),
		children: label
	});
}
function QueueSection({ title, rows, emptyLabel }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "overflow-hidden rounded-md border border-border bg-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center gap-2 border-b border-border bg-surface px-3 py-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[12px] font-semibold uppercase tracking-[0.08em]",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[11px] text-muted-foreground",
				children: rows.length
			})]
		}), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: emptyLabel }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
			className: "w-full text-left",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
				className: "border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "Subject"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "Customer"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "Category"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "Priority"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "Assignee"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-1.5 font-medium",
						children: "SLA"
					})
				] })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
				className: "divide-y divide-border",
				children: rows.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "hover:bg-muted/60",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/tickets/$ticketId",
								params: { ticketId: t.id },
								className: "block text-[13px] font-medium hover:underline",
								children: t.subject
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-muted-foreground",
								children: [
									fmtDateTime(t.created_at),
									" · ",
									t.submitter_email ?? "unknown"
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5 text-[12px]",
							children: t.customer_name ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5 font-mono text-[11px]",
							children: t.category
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityChip, { value: t.priority })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5 text-[12px]",
							children: t.assignee_name ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: t.assigned_role ? `${humanize(t.assigned_role)} (pool)` : "Unassigned"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-1.5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlaChip, {
									slaDueAt: t.sla_due_at,
									firstResponseAt: t.first_response_at,
									breached: false
								}), t.sla_breached ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BreachBadge, {}) : null]
							})
						})
					]
				}, t.id))
			})]
		})]
	});
}
function NewTicket() {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [customerId, setCustomerId] = (0, import_react.useState)("");
	const [category, setCategory] = (0, import_react.useState)("technical");
	const [priority, setPriority] = (0, import_react.useState)("normal");
	const [subject, setSubject] = (0, import_react.useState)("");
	const [body, setBody] = (0, import_react.useState)("");
	const queryClient = useQueryClient();
	const create = useServerFn(addTicket);
	const home = useQuery({
		queryKey: ["home"],
		queryFn: () => getHome(),
		enabled: open
	});
	const customers = Array.from(new Map((home.data?.implementations ?? []).map((i) => [i.customer_id, i.customer_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			customerId: customerId === "" ? null : customerId,
			category,
			subject: subject.trim(),
			body: body.trim(),
			priority
		} }),
		onSuccess: () => {
			setOpen(false);
			setSubject("");
			setBody("");
			setCustomerId("");
			queryClient.invalidateQueries({ queryKey: ["tickets"] });
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: primaryButtonClass,
		onClick: () => setOpen(true),
		children: "New ticket"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "w-full rounded-md border border-border bg-card p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
					children: "New ticket"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 grid gap-2 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: microLabelClass,
							children: "Customer"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: cn(selectClass, "w-full"),
							value: customerId,
							onChange: (e) => setCustomerId(e.target.value),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "No customer"
							}), customers.map(([id, name]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: id,
								children: name
							}, id))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: microLabelClass,
							children: "Category"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							className: cn(selectClass, "w-full"),
							value: category,
							onChange: (e) => setCategory(e.target.value),
							children: TICKET_CATEGORIES.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: c,
								children: humanize(c)
							}, c))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: microLabelClass,
							children: "Priority"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							className: cn(selectClass, "w-full"),
							value: priority,
							onChange: (e) => setPriority(e.target.value),
							children: TICKET_PRIORITIES.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: p,
								children: humanize(p)
							}, p))
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "mt-2 block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: microLabelClass,
					children: "Subject"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					value: subject,
					onChange: (e) => setSubject(e.target.value),
					placeholder: "Short summary"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "mt-2 block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: microLabelClass,
					children: "Details"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: cn(inputClass, "min-h-20"),
					value: body,
					onChange: (e) => setBody(e.target.value),
					placeholder: "What happened, what is needed"
				})]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "mt-2 text-[12px] text-destructive",
				children: mutation.error.message
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 flex justify-end",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryButtonClass,
					disabled: mutation.isPending || subject.trim() === "" || body.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Creating…" : "Create ticket"
				})
			})
		]
	});
}
//#endregion
export { TicketQueuePage as component };
