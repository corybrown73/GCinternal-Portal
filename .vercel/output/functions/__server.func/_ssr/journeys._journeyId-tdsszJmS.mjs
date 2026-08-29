import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { $ as addContentItem, B as useProfile, L as canManage, at as toggleJourneyActive, dn as cn, g as detailQuery, h as Route$18, it as saveStep, rt as removeStep, tt as enrollJourneyContact } from "./router-DuzTz6dO.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { d as Pencil, f as Mail, i as UserPlus, k as ArrowLeft, o as Trash2, u as Plus } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/journeys._journeyId-tdsszJmS.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass = "min-h-[90px] w-full resize-y rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function useInvalidate(journeyId) {
	const queryClient = useQueryClient();
	return () => Promise.all([queryClient.invalidateQueries({ queryKey: ["journeys", journeyId] }), queryClient.invalidateQueries({ queryKey: ["journeys"] })]);
}
function JourneyDetailPage() {
	const { journeyId } = Route$18.useParams();
	const { data } = useSuspenseQuery(detailQuery(journeyId));
	const { profile } = useProfile();
	const canEdit = canManage(profile?.role) || profile?.role === "implementation" || profile?.role === "onboarding";
	const invalidate = useInvalidate(journeyId);
	const toggle = useServerFn(toggleJourneyActive);
	const toggleMutation = useMutation({
		mutationFn: () => toggle({ data: {
			journeyId,
			active: !data.journey.active
		} }),
		onSuccess: () => invalidate()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: data.journey.name,
		...data.journey.description ? { description: data.journey.description } : {},
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
				children: ["Trigger: ", humanize(data.journey.trigger_event)]
			}), canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: cn("rounded-sm px-2 py-0.5 text-[11px] font-medium", data.journey.active ? "bg-status-ontrack text-status-ontrack-foreground" : "bg-status-idle text-status-idle-foreground"),
				disabled: toggleMutation.isPending,
				onClick: () => toggleMutation.mutate(),
				title: data.journey.active ? "Pause this journey" : "Activate this journey",
				children: data.journey.active ? "Active — pause" : "Paused — activate"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", data.journey.active ? "bg-status-ontrack text-status-ontrack-foreground" : "bg-status-idle text-status-idle-foreground"),
				children: data.journey.active ? "Active" : "Paused"
			})]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/journeys",
				className: "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "h-3 w-3" }), " All journeys"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepsPanel, {
				data,
				journeyId,
				canEdit
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EnrollmentsPanel, {
				data,
				journeyId,
				canEdit
			})
		]
	})] });
}
var emptyStepDraft = () => ({
	title: "",
	contentItemId: "",
	newContentTitle: "",
	newContentUrl: "",
	newContentKind: "video",
	emailSubject: "",
	emailBody: "",
	advanceOn: "viewed",
	delayHours: "48"
});
function StepsPanel({ data, journeyId, canEdit }) {
	const [editing, setEditing] = (0, import_react.useState)(null);
	const invalidate = useInvalidate(journeyId);
	const remove = useServerFn(removeStep);
	const removeMutation = useMutation({
		mutationFn: (stepId) => remove({ data: {
			journeyId,
			stepId
		} }),
		onSuccess: () => invalidate()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-md border border-border bg-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between border-b border-border px-4 py-2.5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[13px] font-semibold",
				children: "Steps"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-muted-foreground",
				children: "Sent in order. ‘On viewed’ advances when the tracked link is opened; ‘delay’ advances after the wait."
			})] }), canEdit && editing !== "new" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: buttonClass,
				onClick: () => setEditing("new"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add step"]
			}) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
			className: "divide-y divide-border",
			children: [
				data.steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "px-4 py-2.5",
					children: editing === step.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepForm, {
						journeyId,
						stepId: step.id,
						contentItems: data.content_items,
						initial: {
							title: step.title,
							contentItemId: step.content_item_id ?? "",
							newContentTitle: "",
							newContentUrl: "",
							newContentKind: "video",
							emailSubject: step.email_subject,
							emailBody: step.email_body,
							advanceOn: step.advance_on,
							delayHours: String(step.delay_hours ?? 48)
						},
						onDone: () => setEditing(null)
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[10px] font-medium",
								children: step.step_order
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[13px] font-medium",
										children: step.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "inline-flex items-center gap-1",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mail, { className: "h-3 w-3" }),
												" ",
												step.email_subject
											]
										}), step.content_item ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
											"· ",
											humanize(step.content_item.kind),
											": ",
											step.content_item.title
										] }) : null]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
										children: step.advance_on === "viewed" ? "Advances on viewed" : `Advances after ${step.delay_hours ?? "?"}h`
									})
								]
							}),
							canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex shrink-0 items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: buttonClass,
									onClick: () => setEditing(step.id),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: cn(buttonClass, "hover:text-destructive"),
									disabled: removeMutation.isPending,
									onClick: () => {
										if (window.confirm(`Delete step "${step.title}"?`)) removeMutation.mutate(step.id);
									},
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" }), " Delete"]
								})]
							}) : null
						]
					})
				}, step.id)),
				data.steps.length === 0 && editing !== "new" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "px-4 py-6 text-center text-[12px] text-muted-foreground",
					children: "No steps yet — add the first email in this sequence."
				}) : null,
				editing === "new" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "px-4 py-2.5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepForm, {
						journeyId,
						stepId: null,
						contentItems: data.content_items,
						initial: emptyStepDraft(),
						onDone: () => setEditing(null)
					})
				}) : null
			]
		})]
	});
}
function StepForm({ journeyId, stepId, contentItems, initial, onDone }) {
	const [draft, setDraft] = (0, import_react.useState)(initial);
	const set = (patch) => setDraft((d) => ({
		...d,
		...patch
	}));
	const invalidate = useInvalidate(journeyId);
	const save = useServerFn(saveStep);
	const createContent = useServerFn(addContentItem);
	const mutation = useMutation({
		mutationFn: async () => {
			let contentItemId = draft.contentItemId || null;
			if (draft.contentItemId === "__new__") contentItemId = (await createContent({ data: {
				title: draft.newContentTitle.trim(),
				kind: draft.newContentKind,
				url: draft.newContentUrl.trim()
			} })).id;
			return save({ data: {
				journeyId,
				stepId,
				title: draft.title.trim(),
				content_item_id: contentItemId,
				email_subject: draft.emailSubject.trim(),
				email_body: draft.emailBody.trim(),
				advance_on: draft.advanceOn,
				delay_hours: draft.advanceOn === "delay" ? Number(draft.delayHours) || null : null
			} });
		},
		onSuccess: async () => {
			await invalidate();
			onDone();
		}
	});
	const creatingContent = draft.contentItemId === "__new__";
	const valid = draft.title.trim().length >= 2 && draft.emailSubject.trim().length >= 2 && draft.emailBody.trim().length >= 2 && (!creatingContent || draft.newContentTitle.trim() && draft.newContentUrl.trim()) && (draft.advanceOn !== "delay" || Number(draft.delayHours) > 0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Step title"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						value: draft.title,
						onChange: (e) => set({ title: e.target.value })
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Content item"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass,
						value: draft.contentItemId,
						onChange: (e) => set({ contentItemId: e.target.value }),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "No linked content"
							}),
							contentItems.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
								value: c.id,
								children: [
									c.title,
									" (",
									c.kind,
									")"
								]
							}, c.id)),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "__new__",
								children: "+ New content item…"
							})
						]
					})]
				})]
			}),
			creatingContent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 rounded-sm border border-dashed border-border p-2 md:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Content title"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: draft.newContentTitle,
							onChange: (e) => set({ newContentTitle: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "URL"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							placeholder: "https://…",
							value: draft.newContentUrl,
							onChange: (e) => set({ newContentUrl: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Kind"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass,
							value: draft.newContentKind,
							onChange: (e) => set({ newContentKind: e.target.value }),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "video",
									children: "Video"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "doc",
									children: "Doc"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "link",
									children: "Link"
								})
							]
						})]
					})
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Email subject"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: inputClass,
					value: draft.emailSubject,
					onChange: (e) => set({ emailSubject: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-0.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Email body"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: areaClass,
					value: draft.emailBody,
					onChange: (e) => set({ emailBody: e.target.value })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-mono text-[10px] text-muted-foreground",
				children: [
					"Placeholders: ",
					"{{first_name}}",
					" and ",
					"{{content_url}}",
					" (the tracked link) are replaced at send time."
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-end gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Advance"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: cn(inputClass, "w-40"),
						value: draft.advanceOn,
						onChange: (e) => set({ advanceOn: e.target.value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "viewed",
							children: "When link is viewed"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "delay",
							children: "After a delay"
						})]
					})]
				}), draft.advanceOn === "delay" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Delay (hours)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: cn(inputClass, "w-24"),
						type: "number",
						min: 1,
						value: draft.delayHours,
						onChange: (e) => set({ delayHours: e.target.value })
					})]
				}) : null]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error instanceof Error ? mutation.error.message : "Could not save step"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || !valid,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : stepId ? "Save step" : "Add step"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled: mutation.isPending,
					onClick: onDone,
					children: "Cancel"
				})]
			})
		]
	});
}
var EVENT_TONE = {
	sent: "bg-surface text-muted-foreground",
	viewed: "bg-status-ontrack text-status-ontrack-foreground",
	clicked: "bg-status-ontrack text-status-ontrack-foreground"
};
function EnrollmentsPanel({ data, journeyId, canEdit }) {
	const [enrolling, setEnrolling] = (0, import_react.useState)(false);
	const stepTitle = new Map(data.steps.map((s) => [s.id, `${s.step_order}. ${s.title}`]));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-md border border-border bg-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between border-b border-border px-4 py-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[13px] font-semibold",
					children: "Enrollments"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[11px] text-muted-foreground",
					children: "Who is in this journey and how far they've gotten."
				})] }), canEdit && !enrolling ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: buttonClass,
					onClick: () => setEnrolling(true),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserPlus, { className: "h-3 w-3" }), " Enroll contact"]
				}) : null]
			}),
			enrolling ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-b border-border px-4 py-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EnrollForm, {
					journeyId,
					customers: data.customers,
					onDone: () => setEnrolling(false)
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-x-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-left",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "border-b border-border bg-surface text-[10px] text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Contact"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Customer"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Step"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Last sent"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
								children: "Engagement"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", {
						className: "divide-y divide-border",
						children: [data.enrollments.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "align-top hover:bg-muted/60",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "px-3 py-1.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[12px] font-medium",
										children: e.contact_name ?? e.contact_email
									}), e.contact_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[10px] text-muted-foreground",
										children: e.contact_email
									}) : null]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5 text-[12px]",
									children: e.customer_name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "px-3 py-1.5 font-mono text-[12px]",
									children: [
										e.current_step,
										" / ",
										data.steps.length
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", e.status === "active" ? "bg-status-ontrack text-status-ontrack-foreground" : e.status === "completed" ? "bg-surface text-muted-foreground" : "bg-status-risk text-status-risk-foreground"),
										children: e.status
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5 font-mono text-[11px] text-muted-foreground",
									children: fmtDateTime(e.last_sent_at)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-1.5",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex max-w-64 flex-wrap gap-1",
										children: e.events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-[10px] text-muted-foreground",
											children: "—"
										}) : e.events.map((ev) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: cn("rounded-sm px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider", EVENT_TONE[ev.event] ?? "bg-surface text-muted-foreground"),
											title: `${ev.event} · ${ev.step_id ? stepTitle.get(ev.step_id) ?? "" : ""} · ${fmtDateTime(ev.created_at)}`,
											children: ev.event
										}, ev.id))
									})
								})
							]
						}, e.id)), data.enrollments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 6,
							className: "px-3 py-6 text-center text-[12px] text-muted-foreground",
							children: "No one is enrolled yet."
						}) }) : null]
					})]
				})
			})
		]
	});
}
function EnrollForm({ journeyId, customers, onDone }) {
	const [customerId, setCustomerId] = (0, import_react.useState)("");
	const [contactId, setContactId] = (0, import_react.useState)("");
	const [email, setEmail] = (0, import_react.useState)("");
	const [firstName, setFirstName] = (0, import_react.useState)("");
	const invalidate = useInvalidate(journeyId);
	const enroll = useServerFn(enrollJourneyContact);
	const customer = customers.find((c) => c.id === customerId);
	const contact = customer?.contacts.find((c) => c.id === contactId);
	const effectiveEmail = contact?.email ?? email;
	const mutation = useMutation({
		mutationFn: () => enroll({ data: {
			journeyId,
			customerId,
			contactId: contactId || null,
			contactEmail: effectiveEmail.trim(),
			firstName: contact?.name ?? (firstName.trim() || null)
		} }),
		onSuccess: async () => {
			await invalidate();
			onDone();
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 md:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Customer"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass,
							value: customerId,
							onChange: (e) => {
								setCustomerId(e.target.value);
								setContactId("");
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Select…"
							}), customers.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: c.id,
								children: c.name
							}, c.id))]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Contact"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: inputClass,
							value: contactId,
							disabled: !customer,
							onChange: (e) => setContactId(e.target.value),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Free email…"
							}), (customer?.contacts ?? []).filter((c) => c.email).map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
								value: c.id,
								children: [
									c.name,
									" (",
									c.email,
									")"
								]
							}, c.id))]
						})]
					}),
					!contactId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Email"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							placeholder: "name@customer.com",
							value: email,
							onChange: (e) => setEmail(e.target.value)
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "First name"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: firstName,
							onChange: (e) => setFirstName(e.target.value)
						})]
					})] }) : null
				]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error instanceof Error ? mutation.error.message : "Could not enroll"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || !customerId || !effectiveEmail?.includes("@"),
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Enrolling…" : "Enroll & send step 1"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled: mutation.isPending,
					onClick: onDone,
					children: "Cancel"
				})]
			})
		]
	});
}
//#endregion
export { JourneyDetailPage as component };
