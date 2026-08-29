import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { d as replyTicket, dn as cn, f as submitTicket, u as portalTicketsQuery } from "./router-BT3neubm.mjs";
import { S as ChevronRight, w as ChevronDown, x as Clock } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal.tickets-CMLBbHLz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var CATEGORIES = [
	"technical",
	"training",
	"billing",
	"data",
	"integration",
	"other"
];
var PRIORITIES = [
	"low",
	"normal",
	"high",
	"urgent"
];
var inputClass = "w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var labelClass = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
var STATUS_TONE = {
	open: "bg-status-idle text-status-idle-foreground",
	in_progress: "bg-status-ontrack text-status-ontrack-foreground",
	waiting_customer: "bg-status-risk text-status-risk-foreground",
	resolved: "bg-status-ontrack text-status-ontrack-foreground",
	closed: "bg-surface text-muted-foreground"
};
function PortalTicketsPage() {
	const { data } = useSuspenseQuery(portalTicketsQuery);
	const queryClient = useQueryClient();
	const submit = useServerFn(submitTicket);
	const [category, setCategory] = (0, import_react.useState)("technical");
	const [priority, setPriority] = (0, import_react.useState)("normal");
	const [subject, setSubject] = (0, import_react.useState)("");
	const [body, setBody] = (0, import_react.useState)("");
	const [customerId, setCustomerId] = (0, import_react.useState)(data.customers[0]?.id ?? "");
	const [openTicket, setOpenTicket] = (0, import_react.useState)(null);
	const mutation = useMutation({
		mutationFn: () => submit({ data: {
			customerId: customerId || data.customers[0]?.id,
			category,
			subject: subject.trim(),
			body: body.trim(),
			priority
		} }),
		onSuccess: async () => {
			setSubject("");
			setBody("");
			await queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] });
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-md border border-border bg-card p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-[15px] font-semibold tracking-tight",
					children: "Ask a question / Get help"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-3.5 w-3.5" }), "Your GoCanvas team responds within 24 hours."]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid gap-3 sm:grid-cols-2",
					children: [
						data.customers.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1 sm:col-span-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Company"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: inputClass,
								value: customerId,
								onChange: (e) => setCustomerId(e.target.value),
								children: data.customers.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: c.id,
									children: c.name
								}, c.id))
							})]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Category"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: inputClass,
								value: category,
								onChange: (e) => setCategory(e.target.value),
								children: CATEGORIES.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: c,
									children: humanize(c)
								}, c))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Priority"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: inputClass,
								value: priority,
								onChange: (e) => setPriority(e.target.value),
								children: PRIORITIES.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: p,
									children: humanize(p)
								}, p))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1 sm:col-span-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Subject"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass,
								value: subject,
								placeholder: "One line describing what you need",
								onChange: (e) => setSubject(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1 sm:col-span-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Description"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: cn(inputClass, "min-h-[110px] resize-y"),
								value: body,
								placeholder: "What happened, what you expected, and anything that helps us reproduce it",
								onChange: (e) => setBody(e.target.value)
							})]
						})
					]
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[12px] text-destructive",
					children: mutation.error instanceof Error ? mutation.error.message : "Could not submit"
				}) : null,
				mutation.isSuccess ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[12px] text-status-ontrack-foreground",
					children: "Request received — we'll get back to you within 24 hours."
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mt-3 inline-flex items-center rounded-sm bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50",
					disabled: mutation.isPending || subject.trim().length < 3 || body.trim().length < 5,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Sending…" : "Send request"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-md border border-border bg-card",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "border-b border-border px-4 py-2.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[13px] font-semibold",
					children: "Your requests"
				})
			}), data.tickets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-4 py-8 text-center text-[12px] text-muted-foreground",
				children: "No requests yet — anything you send appears here with its status."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "divide-y divide-border",
				children: data.tickets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TicketRow, {
					ticket: t,
					open: openTicket === t.id,
					onToggle: () => setOpenTicket(openTicket === t.id ? null : t.id)
				}, t.id))
			})]
		})]
	});
}
function TicketRow({ ticket, open, onToggle }) {
	const queryClient = useQueryClient();
	const reply = useServerFn(replyTicket);
	const [draft, setDraft] = (0, import_react.useState)("");
	const mutation = useMutation({
		mutationFn: () => reply({ data: {
			ticketId: ticket.id,
			body: draft.trim()
		} }),
		onSuccess: async () => {
			setDraft("");
			await queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] });
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: onToggle,
		className: "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60",
		"aria-expanded": open,
		children: [
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-[13px] font-medium",
					children: ticket.subject
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[11px] text-muted-foreground",
					children: [
						humanize(ticket.category),
						" · ",
						humanize(ticket.priority),
						" ·",
						" ",
						fmtDateTime(ticket.created_at)
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", STATUS_TONE[ticket.status] ?? "bg-surface text-muted-foreground"),
				children: humanize(ticket.status)
			})
		]
	}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 border-t border-border bg-surface px-4 py-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "whitespace-pre-wrap text-[13px]",
				children: ticket.body
			}),
			ticket.comments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2",
				children: ticket.comments.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: cn("rounded-sm border border-border p-2.5", c.author_is_team ? "bg-card" : "bg-background"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: c.author_is_team ? "GoCanvas team" : c.author_name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtDateTime(c.created_at) })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "whitespace-pre-wrap text-[13px]",
						children: c.body
					})]
				}, c.id))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						className: "min-h-[64px] w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-ring",
						placeholder: "Reply to your GoCanvas team…",
						value: draft,
						onChange: (e) => setDraft(e.target.value)
					}),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] text-destructive",
						children: mutation.error instanceof Error ? mutation.error.message : "Could not reply"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rounded-sm bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50",
						disabled: mutation.isPending || draft.trim().length === 0,
						onClick: () => mutation.mutate(),
						children: mutation.isPending ? "Sending…" : "Send reply"
					})
				]
			})
		]
	}) : null] });
}
//#endregion
export { PortalTicketsPage as component };
