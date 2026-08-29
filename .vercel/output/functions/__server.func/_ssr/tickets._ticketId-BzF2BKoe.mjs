import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { i as useQuery, o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { H as PriorityChip, K as TICKET_STATUSES, Q as selectClass, U as SlaChip, V as BreachBadge, X as microLabelClass, Y as inputClass, Z as primaryButtonClass, dn as cn, q as TicketStatusChip, r as Route$11 } from "./router-DuzTz6dO.mjs";
import { n as PageBody } from "./page-wX17g2fe.mjs";
import { a as getInternalProfiles, d as setTicketStatus, l as setTicketAssignee, o as getTicket, r as addTicketComment } from "./tickets.functions-bkjSIB31.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets._ticketId-BzF2BKoe.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function TicketDetailPage() {
	const { ticketId } = Route$11.useParams();
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: ["ticket", ticketId],
		queryFn: () => getTicket({ data: { ticketId } })
	});
	const teamQuery = useQuery({
		queryKey: ["internal-profiles"],
		queryFn: () => getInternalProfiles()
	});
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
		queryClient.invalidateQueries({ queryKey: ["tickets"] });
	};
	const assignFn = useServerFn(setTicketAssignee);
	const statusFn = useServerFn(setTicketStatus);
	const assignMutation = useMutation({
		mutationFn: (assigneeId) => assignFn({ data: {
			ticketId,
			assigneeId
		} }),
		onSuccess: invalidate
	});
	const statusMutation = useMutation({
		mutationFn: (status) => statusFn({ data: {
			ticketId,
			status
		} }),
		onSuccess: invalidate
	});
	if (query.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
		children: "Loading ticket…"
	}) });
	if (query.isError || !query.data) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		role: "alert",
		className: "text-[13px] text-destructive",
		children: ["Could not load this ticket: ", query.error?.message ?? "not found"]
	}) });
	const { ticket, comments } = query.data;
	const team = teamQuery.data ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 text-[11px] text-muted-foreground",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/tickets",
					className: "hover:text-foreground hover:underline",
					children: "Queue"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "/" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "truncate font-mono text-[10px] uppercase tracking-wider",
					children: ticket.id
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-4 lg:flex-row",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1 space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-md border border-border bg-card p-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[15px] font-semibold tracking-tight",
									children: ticket.subject
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex shrink-0 items-center gap-1.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlaChip, {
										slaDueAt: ticket.sla_due_at,
										firstResponseAt: ticket.first_response_at,
										breached: false
									}), ticket.sla_breached ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BreachBadge, {}) : null]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-[11px] text-muted-foreground",
								children: [
									ticket.submitter_email ?? "Unknown submitter",
									" · ",
									fmtDateTime(ticket.created_at)
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 whitespace-pre-wrap text-[13px]",
								children: ticket.body
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-2",
						children: [comments.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: cn("rounded-md border border-border p-3", c.internal ? "bg-surface" : "bg-card"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[12px] font-medium",
									children: c.author_name ?? c.author_email ?? "Unknown"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "flex items-center gap-2",
									children: [c.internal ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
										children: "internal"
									}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[11px] text-muted-foreground",
										children: fmtDateTime(c.created_at)
									})]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1.5 whitespace-pre-wrap text-[13px]",
								children: c.body
							})]
						}, c.id)), comments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] text-muted-foreground",
							children: "No replies yet."
						}) : null]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplyBox, {
						ticketId,
						onDone: invalidate
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
				className: "w-full shrink-0 space-y-3 lg:w-64",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-md border border-border bg-card p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
						className: "space-y-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "Customer",
								children: ticket.customer_id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/customers/$customerId",
									params: { customerId: ticket.customer_id },
									className: "hover:underline",
									children: ticket.customer_name ?? "Customer"
								}) : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "Category",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[11px]",
									children: ticket.category
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "Priority",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityChip, { value: ticket.priority })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "Status",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TicketStatusChip, { value: ticket.status }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
										className: cn(selectClass, "w-full"),
										"aria-label": "Change status",
										value: ticket.status,
										disabled: statusMutation.isPending,
										onChange: (e) => statusMutation.mutate(e.target.value),
										children: TICKET_STATUSES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: s,
											children: humanize(s)
										}, s))
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "Assignee",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									className: cn(selectClass, "w-full"),
									"aria-label": "Assignee",
									value: ticket.assigned_to ?? "",
									disabled: assignMutation.isPending || teamQuery.isPending,
									onChange: (e) => assignMutation.mutate(e.target.value === "" ? null : e.target.value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: ticket.assigned_role ? `Unassigned (${humanize(ticket.assigned_role)} pool)` : "Unassigned"
									}), team.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: p.id,
										children: p.full_name ?? p.email
									}, p.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaField, {
								label: "SLA",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-1 text-[11px] text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["First response due ", fmtDateTime(ticket.sla_due_at)] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: ticket.first_response_at ? `First response ${fmtDateTime(ticket.first_response_at)}` : ticket.sla_breached ? "Breached — no first response inside the window" : "No first response yet" }),
										ticket.resolved_at ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Resolved ", fmtDateTime(ticket.resolved_at)] }) : null
									]
								})
							})
						]
					}), assignMutation.isError || statusMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "mt-2 text-[12px] text-destructive",
						children: (assignMutation.error ?? statusMutation.error).message
					}) : null]
				})
			})]
		})]
	});
}
function MetaField({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "mt-0.5 text-[13px]",
			children
		})]
	});
}
function ReplyBox({ ticketId, onDone }) {
	const [body, setBody] = (0, import_react.useState)("");
	const [internal, setInternal] = (0, import_react.useState)(false);
	const reply = useServerFn(addTicketComment);
	const mutation = useMutation({
		mutationFn: () => reply({ data: {
			ticketId,
			body: body.trim(),
			internal
		} }),
		onSuccess: () => {
			setBody("");
			setInternal(false);
			onDone();
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("rounded-md border border-border p-3", internal ? "bg-surface" : "bg-card"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: microLabelClass,
					children: internal ? "Internal note" : "Reply to submitter"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: internal,
						onChange: (e) => setInternal(e.target.checked),
						className: "h-3 w-3 accent-current"
					}), "Internal note"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				className: cn(inputClass, "mt-2 min-h-20"),
				value: body,
				onChange: (e) => setBody(e.target.value),
				placeholder: internal ? "Visible to the team only" : "Sent to the submitter by email — this counts as the first response"
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
					disabled: mutation.isPending || body.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Posting…" : internal ? "Add note" : "Send reply"
				})
			})
		]
	});
}
//#endregion
export { TicketDetailPage as component };
