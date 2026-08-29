import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { B as useProfile, L as canManage, _ as journeysQuery, dn as cn, et as addJourney } from "./router-DuzTz6dO.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { u as Plus } from "../_libs/lucide-react.mjs";
import { r as NoRows } from "./record-BXejhTdA.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/journeys.index-5PcvgSlK.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function JourneysPage() {
	const { data } = useSuspenseQuery(journeysQuery);
	const { profile } = useProfile();
	const canEdit = canManage(profile?.role) || profile?.role === "implementation" || profile?.role === "onboarding";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Journeys",
		description: "Automated email sequences that walk customer contacts through onboarding content.",
		actions: canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewJourney, {}) : void 0
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, {
		className: "space-y-3",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-hidden rounded-md border border-border bg-card",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full text-left",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "border-b border-border bg-surface text-[10px] text-muted-foreground",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "Journey"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "Trigger"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "Steps"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "Enrolled"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "Status"
						})
					] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", {
					className: "divide-y divide-border",
					children: [data.map((j) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "hover:bg-muted/60",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: "/journeys/$journeyId",
									params: { journeyId: j.id },
									className: "block text-[13px] font-medium hover:underline",
									children: [j.name, j.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-2 text-[11px] font-normal text-muted-foreground",
										children: j.description
									}) : null]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 font-mono text-[11px] text-muted-foreground",
								children: humanize(j.trigger_event)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 font-mono text-[12px]",
								children: j.step_count
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 font-mono text-[12px]",
								children: j.enrolled_count
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", j.active ? "bg-status-ontrack text-status-ontrack-foreground" : "bg-status-idle text-status-idle-foreground"),
									children: j.active ? "Active" : "Paused"
								})
							})
						]
					}, j.id)), data.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 5,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No journeys yet." })
					}) }) : null]
				})]
			})
		})
	})] });
}
function NewJourney() {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [name, setName] = (0, import_react.useState)("");
	const [description, setDescription] = (0, import_react.useState)("");
	const [trigger, setTrigger] = (0, import_react.useState)("manual");
	const queryClient = useQueryClient();
	const create = useServerFn(addJourney);
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			name: name.trim(),
			description: description.trim() || null,
			trigger_event: trigger
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["journeys"] });
			setOpen(false);
			setName("");
			setDescription("");
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => setOpen(true),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " New journey"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "w-72 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Name"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					value: name,
					onChange: (e) => setName(e.target.value)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Description"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					value: description,
					onChange: (e) => setDescription(e.target.value)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Trigger"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: inputClass,
					value: trigger,
					onChange: (e) => setTrigger(e.target.value),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "manual",
							children: "Manual"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "customer_created",
							children: "Customer created"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "stage_entered",
							children: "Stage entered"
						})
					]
				})]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error instanceof Error ? mutation.error.message : "Could not create"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || name.trim().length < 2,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Creating…" : "Create"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
//#endregion
export { JourneysPage as component };
