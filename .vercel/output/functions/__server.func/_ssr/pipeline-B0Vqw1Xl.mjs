import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as useDroppable, i as useDraggable, n as DragOverlay, o as useSensor, r as PointerSensor, s as useSensors, t as DndContext } from "../_libs/@dnd-kit/core+[...].mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as STAGE_LABELS, t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { B as useProfile, I as canEditSales, O as pipelineQuery, dn as cn, mt as moveDealStage, ot as addDeal, pt as importDeals } from "./router-DuzTz6dO.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { a as Upload, u as Plus } from "../_libs/lucide-react.mjs";
import { a as DialogHeader, n as DialogContent, o as DialogTitle, r as DialogDescription, t as Dialog } from "./dialog-CwLzEEob.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/pipeline-B0Vqw1Xl.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function daysIn(since) {
	return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 864e5));
}
function fmtArr(arr) {
	if (arr == null) return "—";
	return `$${Number(arr).toLocaleString()}`;
}
function DealCard({ deal, overlay = false }) {
	const days = daysIn(deal.stage_entered_at);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("rounded-sm border border-border bg-card px-2.5 py-2", overlay ? "rotate-1 shadow-md" : "hover:bg-muted/60"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "truncate text-[13px] font-medium leading-snug",
				children: deal.name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtArr(deal.arr) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					title: "Days in stage",
					className: cn(days > 14 && deal.stage !== "onboarding_complete" && "text-status-risk-foreground"),
					children: [days, "d"]
				})]
			}),
			deal.am_owner_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-0.5 truncate text-[11px] text-muted-foreground/70",
				children: deal.am_owner_name
			}) : null
		]
	});
}
function DraggableCard({ deal, canDrag }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: deal.id,
		disabled: !canDrag
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: setNodeRef,
		...listeners,
		...attributes,
		className: isDragging ? "opacity-30" : "",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/deals/$dealId",
			params: { dealId: deal.id },
			onClick: (e) => {
				if (isDragging) e.preventDefault();
			},
			className: "block",
			draggable: false,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DealCard, { deal })
		})
	});
}
function Column({ stage, deals, canDrag }) {
	const { setNodeRef, isOver } = useDroppable({ id: stage });
	const arrTotal = deals.reduce((sum, d) => sum + (d.arr ?? 0), 0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex w-60 flex-none flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-1.5 flex items-baseline justify-between px-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
				children: [STAGE_LABELS[stage], /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-1.5 text-muted-foreground/60",
					children: deals.length
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[10px] text-muted-foreground/60",
				children: arrTotal > 0 ? `$${arrTotal.toLocaleString()}` : ""
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: setNodeRef,
			className: cn("flex min-h-44 flex-1 flex-col gap-1.5 rounded-md border p-1.5 transition-colors", isOver ? "border-primary/50 bg-muted" : "border-transparent bg-surface"),
			children: [deals.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DraggableCard, {
				deal: d,
				canDrag
			}, d.id)), deals.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "py-6 text-center text-[11px] text-muted-foreground/60",
				children: "No deals"
			}) : null]
		})]
	});
}
/**
* Presale Kanban. Drag is an optimistic stage move; `onMove` performs the real
* transition (portal_transition_stage via serverFn) and rejects to revert.
*/
function DealBoard({ deals: incoming, canDrag, onMove }) {
	const [deals, setDeals] = (0, import_react.useState)(incoming);
	const [activeId, setActiveId] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => setDeals(incoming), [incoming]);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
	function onDragStart(e) {
		setActiveId(String(e.active.id));
	}
	function onDragEnd(e) {
		setActiveId(null);
		const dealId = String(e.active.id);
		const target = e.over?.id ? String(e.over.id) : null;
		if (!target) return;
		const deal = deals.find((d) => d.id === dealId);
		if (!deal || deal.stage === target) return;
		const previousStage = deal.stage;
		setDeals((prev) => prev.map((d) => d.id === dealId ? {
			...d,
			stage: target,
			stage_entered_at: (/* @__PURE__ */ new Date()).toISOString()
		} : d));
		onMove(dealId, target).catch(() => {
			setDeals((prev) => prev.map((d) => d.id === dealId ? {
				...d,
				stage: previousStage
			} : d));
		});
	}
	const active = activeId ? deals.find((d) => d.id === activeId) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DndContext, {
		sensors,
		onDragStart,
		onDragEnd,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex gap-3 overflow-x-auto pb-4",
			children: STAGES.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Column, {
				stage,
				canDrag,
				deals: deals.filter((d) => d.stage === stage)
			}, stage))
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DragOverlay, { children: active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DealCard, {
			deal: active,
			overlay: true
		}) : null })]
	});
}
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var areaClass = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryButtonClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable = (v) => v.trim() === "" ? null : v.trim();
var emptyDeal = {
	name: "",
	domain: "",
	salesforceId: "",
	arr: "",
	summary: ""
};
function NewDealDialog() {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyDeal);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const create = useServerFn(addDeal);
	const set = (patch) => setDraft((d) => ({
		...d,
		...patch
	}));
	const mutation = useMutation({
		mutationFn: async () => {
			const arrRaw = draft.arr.trim().replace(/[$,]/g, "");
			const arr = arrRaw === "" ? null : Number(arrRaw);
			if (arr != null && !Number.isFinite(arr)) throw new Error("ARR must be a number");
			return create({ data: {
				name: draft.name.trim(),
				domain: nullable(draft.domain),
				salesforceId: nullable(draft.salesforceId),
				arr,
				summary: nullable(draft.summary)
			} });
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["pipeline"] });
			setOpen(false);
			setDraft(emptyDeal);
			navigate({
				to: "/deals/$dealId",
				params: { dealId: result.account.id }
			});
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => setOpen(true),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " New deal"]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange: setOpen,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-md",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
				className: "text-[14px]",
				children: "New deal"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, {
				className: "text-[12px]",
				children: "Creates a presale account in Prospect. Matching on Salesforce ID or name updates the existing record instead of duplicating it."
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "space-y-2.5",
				onSubmit: (e) => {
					e.preventDefault();
					if (!mutation.isPending) mutation.mutate();
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: labelClass,
						children: "Name *"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						value: draft.name,
						onChange: (e) => set({ name: e.target.value }),
						required: true
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: labelClass,
							children: "Domain"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: draft.domain,
							placeholder: "acme.com",
							onChange: (e) => set({ domain: e.target.value })
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: labelClass,
							children: "Salesforce ID"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							value: draft.salesforceId,
							onChange: (e) => set({ salesforceId: e.target.value })
						})] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: labelClass,
						children: "ARR"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						value: draft.arr,
						placeholder: "120000",
						onChange: (e) => set({ arr: e.target.value })
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: labelClass,
						children: "Summary"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						className: areaClass,
						rows: 3,
						value: draft.summary,
						onChange: (e) => set({ summary: e.target.value })
					})] }),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] text-destructive",
						children: mutation.error.message
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-end gap-2 pt-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass,
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: primaryButtonClass,
							disabled: mutation.isPending || draft.name.trim() === "",
							children: mutation.isPending ? "Creating…" : "Create deal"
						})]
					})
				]
			})]
		})
	})] });
}
function CsvImportDialog() {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [fileName, setFileName] = (0, import_react.useState)(null);
	const [csvText, setCsvText] = (0, import_react.useState)(null);
	const [summary, setSummary] = (0, import_react.useState)(null);
	const fileRef = (0, import_react.useRef)(null);
	const queryClient = useQueryClient();
	const runImport = useServerFn(importDeals);
	const mutation = useMutation({
		mutationFn: async () => {
			if (!csvText) throw new Error("Choose a CSV file first");
			return runImport({ data: { csv: csvText } });
		},
		onSuccess: (result) => {
			setSummary(result);
			queryClient.invalidateQueries({ queryKey: ["pipeline"] });
		}
	});
	const reset = () => {
		setFileName(null);
		setCsvText(null);
		setSummary(null);
		mutation.reset();
		if (fileRef.current) fileRef.current.value = "";
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => setOpen(true),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, { className: "h-3 w-3" }), " Import CSV"]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange: (next) => {
			setOpen(next);
			if (!next) reset();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-md",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
				className: "text-[14px]",
				children: "Import deals from CSV"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, {
				className: "text-[12px]",
				children: "Columns: name (required), salesforce_id, domain, stage, arr, am_owner_email, summary. Rows upsert by Salesforce ID, then by name."
			})] }), summary ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-3 gap-2 text-center",
						children: [
							["Created", summary.created],
							["Updated", summary.updated],
							["Stage changes", summary.stage_changes]
						].map(([label, n]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-sm border border-border bg-surface px-2 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-[15px] font-semibold",
								children: n
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
								children: label
							})]
						}, label))
					}),
					summary.errors.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "max-h-40 overflow-y-auto rounded-sm border border-border",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "border-b border-border bg-surface px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
							children: [
								summary.errors.length,
								" row",
								summary.errors.length === 1 ? "" : "s",
								" skipped"
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "divide-y divide-border",
							children: summary.errors.map((e, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "px-2 py-1 text-[11px]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "font-mono text-muted-foreground",
										children: ["Row ", e.row]
									}),
									" ·",
									" ",
									e.message
								]
							}, i))
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: "Every row imported cleanly."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-end gap-2 pt-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass,
							onClick: reset,
							children: "Import another file"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: primaryButtonClass,
							onClick: () => {
								setOpen(false);
								reset();
							},
							children: "Done"
						})]
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: labelClass,
							children: "CSV file (max 2 MB)"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							ref: fileRef,
							type: "file",
							accept: ".csv,text/csv",
							className: "block w-full text-[12px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-card file:px-2 file:py-0.5 file:text-[11px] file:text-foreground",
							onChange: async (e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								if (file.size > 2097152) {
									setFileName(null);
									setCsvText(null);
									alert("CSV must be under 2 MB");
									return;
								}
								setFileName(file.name);
								setCsvText(await file.text());
							}
						}),
						fileName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 font-mono text-[11px] text-muted-foreground",
							children: fileName
						}) : null
					] }),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] text-destructive",
						children: mutation.error.message
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-end gap-2 pt-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass,
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: primaryButtonClass,
							disabled: !csvText || mutation.isPending,
							onClick: () => mutation.mutate(),
							children: mutation.isPending ? "Importing…" : "Import"
						})]
					})
				]
			})]
		})
	})] });
}
function PipelinePage() {
	const { data } = useSuspenseQuery(pipelineQuery);
	const { profile } = useProfile();
	const queryClient = useQueryClient();
	const move = useServerFn(moveDealStage);
	const editable = canEditSales(profile?.role);
	const moveMutation = useMutation({
		mutationFn: (vars) => move({ data: vars }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["pipeline"] })
	});
	const arrTotal = data.deals.reduce((sum, d) => sum + (d.arr ?? 0), 0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Pipeline",
		description: "Presale deals by stage. Drag a card to record a stage transition; every move is written to the stage history.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-mono text-[11px] text-muted-foreground",
				children: [
					data.deals.length,
					" deals · $",
					arrTotal.toLocaleString()
				]
			}), editable ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CsvImportDialog, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewDealDialog, {})] }) : null]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DealBoard, {
		deals: data.deals,
		canDrag: editable,
		onMove: (dealId, toStage) => moveMutation.mutateAsync({
			dealId,
			toStage
		})
	}), moveMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		role: "alert",
		className: "mt-2 text-[12px] text-destructive",
		children: ["The stage change was not saved: ", moveMutation.error.message]
	}) : null] })] });
}
//#endregion
export { PipelinePage as component };
