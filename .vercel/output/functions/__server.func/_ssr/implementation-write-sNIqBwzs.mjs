import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { _ as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { i as useQuery, o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { $t as setImplementation, At as addImplementation, Wt as getTeamOptions, ln as uploadAttachment } from "./router-BT3neubm.mjs";
import { u as Plus } from "../_libs/lucide-react.mjs";
import { n as fileToBase64, r as groupOf, t as OwnerPicker } from "./owner-picker-4BjhSJLG.mjs";
import { a as DialogHeader, n as DialogContent, o as DialogTitle, r as DialogDescription, t as Dialog } from "./dialog-CwLzEEob.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/implementation-write-sNIqBwzs.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var selectClass = inputClass;
var areaClass = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var emptyDraft = {
	mode: "existing",
	customerId: "",
	customerSearch: "",
	newCustomerName: "",
	newCustomerIndustry: "",
	newCustomerRegion: "",
	newCustomerSegment: "",
	newCustomerArr: "",
	name: "",
	ownerGroup: "",
	ownerId: "",
	salesOwner: "",
	tier: "",
	sowReference: "",
	sowValue: "",
	sowSignedDate: "",
	contractStartDate: "",
	targetLaunchDate: "",
	customerGoals: "",
	externalRef: ""
};
var nullable = (v) => v.trim() === "" ? null : v.trim();
var nullableNumber = (v) => {
	const t = v.trim();
	if (t === "") return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
};
function payload(draft) {
	return {
		customerId: draft.mode === "existing" ? nullable(draft.customerId) : null,
		newCustomer: draft.mode === "new" ? {
			name: draft.newCustomerName.trim(),
			industry: nullable(draft.newCustomerIndustry),
			region: nullable(draft.newCustomerRegion),
			segment: nullable(draft.newCustomerSegment),
			arr: nullableNumber(draft.newCustomerArr)
		} : null,
		name: draft.name.trim(),
		ownerId: nullable(draft.ownerId),
		salesOwner: nullable(draft.salesOwner),
		tier: nullable(draft.tier),
		sowReference: nullable(draft.sowReference),
		sowValue: nullableNumber(draft.sowValue),
		sowSignedDate: nullable(draft.sowSignedDate),
		contractStartDate: nullable(draft.contractStartDate),
		targetLaunchDate: nullable(draft.targetLaunchDate),
		customerGoals: nullable(draft.customerGoals),
		externalRef: nullable(draft.externalRef)
	};
}
function NewImplementation({ customers }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(emptyDraft);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const create = useServerFn(addImplementation);
	const upload = useServerFn(uploadAttachment);
	const [sowFile, setSowFile] = (0, import_react.useState)(null);
	const team = useQuery({
		queryKey: ["team-options"],
		queryFn: () => getTeamOptions(),
		enabled: open
	});
	const set = (patch) => setDraft((d) => ({
		...d,
		...patch
	}));
	const matches = (0, import_react.useMemo)(() => {
		const q = draft.customerSearch.trim().toLowerCase();
		return (q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers).slice(0, 40);
	}, [customers, draft.customerSearch]);
	const selected = customers.find((c) => c.id === draft.customerId);
	const mutation = useMutation({
		mutationFn: async () => {
			let sowDocumentUrl = null;
			let sowDocumentName = null;
			if (sowFile) {
				if (sowFile.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "sow",
					fileName: sowFile.name,
					contentType: sowFile.type || "application/octet-stream",
					dataBase64: await fileToBase64(sowFile)
				} });
				sowDocumentUrl = stored.path;
				sowDocumentName = stored.name;
			}
			return create({ data: {
				...payload(draft),
				sowDocumentUrl,
				sowDocumentName
			} });
		},
		onSuccess: async (result) => {
			await queryClient.invalidateQueries({ queryKey: ["home"] });
			setOpen(false);
			setDraft(emptyDraft);
			setSowFile(null);
			navigate({
				to: "/customers/$customerId",
				params: { customerId: result.customerId }
			});
		}
	});
	const canSave = (draft.mode === "existing" ? draft.customerId !== "" : draft.newCustomerName.trim() !== "") && draft.name.trim() !== "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => {
			mutation.reset();
			setDraft(emptyDraft);
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " New implementation"]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange: (v) => mutation.isPending ? null : setOpen(v),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-2xl",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
				className: "text-[14px]",
				children: "New implementation"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, {
				className: "text-[11px]",
				children: "Originates the record at Handoff. Nothing else is created or inferred."
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-2 rounded-sm border border-border/70 bg-muted/30 p-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: labelClass,
								children: "Customer"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass,
								disabled: mutation.isPending,
								onClick: () => set({ mode: draft.mode === "existing" ? "new" : "existing" }),
								children: draft.mode === "existing" ? "New customer" : "Select existing"
							})]
						}), draft.mode === "existing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-2 md:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Search"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "Search customers",
										value: draft.customerSearch,
										disabled: mutation.isPending,
										placeholder: "Filter by name",
										onChange: (e) => set({ customerSearch: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Existing customer"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										className: selectClass,
										"aria-label": "Existing customer",
										value: draft.customerId,
										disabled: mutation.isPending,
										onChange: (e) => set({ customerId: e.target.value }),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Not selected"
										}), matches.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: c.id,
											children: c.name
										}, c.id))]
									})]
								}),
								selected?.hasImplementation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "md:col-span-2 text-[11px] text-status-risk-foreground",
									children: "This customer already has an implementation on record — Customer 360 shows only the most recent implementation per customer, so creating a new one will replace what's shown there."
								}) : null
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-2 md:grid-cols-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Customer name"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "Customer name",
										value: draft.newCustomerName,
										disabled: mutation.isPending,
										onChange: (e) => set({ newCustomerName: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Industry"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "Industry",
										value: draft.newCustomerIndustry,
										disabled: mutation.isPending,
										placeholder: "Not provided",
										onChange: (e) => set({ newCustomerIndustry: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Region"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "Region",
										value: draft.newCustomerRegion,
										disabled: mutation.isPending,
										placeholder: "Not provided",
										onChange: (e) => set({ newCustomerRegion: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "Segment"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "Segment",
										value: draft.newCustomerSegment,
										disabled: mutation.isPending,
										placeholder: "Not provided",
										onChange: (e) => set({ newCustomerSegment: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block space-y-0.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "ARR"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: inputClass,
										"aria-label": "ARR",
										inputMode: "decimal",
										value: draft.newCustomerArr,
										disabled: mutation.isPending,
										placeholder: "Not provided",
										onChange: (e) => set({ newCustomerArr: e.target.value })
									})]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 md:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5 md:col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Implementation name"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "Implementation name",
									value: draft.name,
									disabled: mutation.isPending,
									placeholder: "e.g. Core rollout — Phase 1",
									onChange: (e) => set({ name: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerPicker, {
								team: team.data ?? [],
								group: draft.ownerGroup,
								ownerId: draft.ownerId,
								disabled: mutation.isPending,
								personLabel: "Implementation owner",
								onChange: (next) => set({
									ownerGroup: next.group,
									ownerId: next.ownerId
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Sales owner (transferred from)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "Sales owner",
									value: draft.salesOwner,
									disabled: mutation.isPending,
									placeholder: "Not provided",
									onChange: (e) => set({ salesOwner: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Tier"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "Tier",
									value: draft.tier,
									disabled: mutation.isPending,
									placeholder: "e.g. Tier 1",
									onChange: (e) => set({ tier: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "SOW reference"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "SOW reference",
									value: draft.sowReference,
									disabled: mutation.isPending,
									placeholder: "Not provided",
									onChange: (e) => set({ sowReference: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5 md:col-span-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: labelClass,
										children: "SOW document (optional)"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "file",
										className: "w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-background file:px-1.5 file:py-0.5 file:text-[11px] file:text-foreground",
										"aria-label": "SOW document",
										disabled: mutation.isPending,
										onChange: (e) => setSowFile(e.target.files?.[0] ?? null)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-[10px] text-muted-foreground",
										children: "Attach the SOW now and you can analyse it from the implementation once it exists."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "SOW value"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "SOW value",
									inputMode: "decimal",
									value: draft.sowValue,
									disabled: mutation.isPending,
									placeholder: "Not provided",
									onChange: (e) => set({ sowValue: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "SOW signed date"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									className: inputClass,
									"aria-label": "SOW signed date",
									value: draft.sowSignedDate,
									disabled: mutation.isPending,
									onChange: (e) => set({ sowSignedDate: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Contract start date"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									className: inputClass,
									"aria-label": "Contract start date",
									value: draft.contractStartDate,
									disabled: mutation.isPending,
									onChange: (e) => set({ contractStartDate: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Target launch date"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									className: inputClass,
									"aria-label": "Target launch date",
									value: draft.targetLaunchDate,
									disabled: mutation.isPending,
									onChange: (e) => set({ targetLaunchDate: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5 md:col-span-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "External reference (e.g. Rocketlane / Salesforce ID)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: inputClass,
									"aria-label": "External reference",
									value: draft.externalRef,
									disabled: mutation.isPending,
									placeholder: "Not provided",
									onChange: (e) => set({ externalRef: e.target.value })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-0.5 md:col-span-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: labelClass,
									children: "Customer goals"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
									className: areaClass,
									"aria-label": "Customer goals",
									rows: 3,
									value: draft.customerGoals,
									disabled: mutation.isPending,
									placeholder: "What the customer said they want to achieve",
									onChange: (e) => set({ customerGoals: e.target.value })
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass,
								disabled: mutation.isPending || !canSave,
								onClick: () => mutation.mutate(),
								children: mutation.isPending ? "Saving…" : "Save"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: buttonClass,
								disabled: mutation.isPending,
								onClick: () => {
									mutation.reset();
									setDraft(emptyDraft);
									setOpen(false);
								},
								children: "Cancel"
							}),
							mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11px] text-destructive",
								children: ["Save failed — values kept", mutation.error instanceof Error ? `: ${mutation.error.message}` : ""]
							}) : null
						]
					})
				]
			})]
		})
	})] });
}
var STATUS_CHOICE = [
	{
		value: "on_track",
		label: "On track"
	},
	{
		value: "at_risk",
		label: "At risk"
	},
	{
		value: "blocked",
		label: "Blocked"
	},
	{
		value: "idle",
		label: "Nothing moving"
	}
];
var dateOnly = (v) => v ? String(v).slice(0, 10) : "";
/**
* Deferred Save/Cancel editor for the facts of an implementation. Current stage
* is intentionally not here — that only moves through stage advancement.
*/
function EditImplementation({ customerId, implementation, team }) {
	const queryClient = useQueryClient();
	const save = useServerFn(setImplementation);
	const [open, setOpen] = (0, import_react.useState)(false);
	const from = () => ({
		name: implementation.name ?? "",
		ownerGroup: groupOf(team, implementation.owner_id),
		ownerId: implementation.owner_id ?? "",
		salesOwner: implementation.sales_owner ?? "",
		tier: implementation.tier ?? "",
		status: implementation.status ?? "on_track",
		sowReference: implementation.sow_reference ?? "",
		sowValue: implementation.sow_value == null ? "" : String(implementation.sow_value),
		sowSignedDate: dateOnly(implementation.sow_signed_date),
		contractStartDate: dateOnly(implementation.contract_start_date),
		targetLaunchDate: dateOnly(implementation.target_launch_date),
		actualLaunchDate: dateOnly(implementation.actual_launch_date),
		customerGoals: implementation.customer_goals ?? ""
	});
	const [draft, setDraft] = (0, import_react.useState)(from);
	const set = (patch) => setDraft((d) => ({
		...d,
		...patch
	}));
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: implementation.id,
			name: draft.name.trim(),
			ownerId: nullable(draft.ownerId),
			salesOwner: nullable(draft.salesOwner),
			tier: nullable(draft.tier),
			status: draft.status,
			sowReference: nullable(draft.sowReference),
			sowValue: nullableNumber(draft.sowValue),
			sowSignedDate: nullable(draft.sowSignedDate),
			contractStartDate: nullable(draft.contractStartDate),
			targetLaunchDate: nullable(draft.targetLaunchDate),
			actualLaunchDate: nullable(draft.actualLaunchDate),
			customerGoals: nullable(draft.customerGoals)
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			setOpen(false);
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: buttonClass,
		onClick: () => {
			mutation.reset();
			setDraft(from());
			setOpen(true);
		},
		children: "Edit details"
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2 md:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5 md:col-span-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Implementation name"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							"aria-label": "Implementation name",
							value: draft.name,
							disabled,
							onChange: (e) => set({ name: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerPicker, {
						team,
						group: draft.ownerGroup,
						ownerId: draft.ownerId,
						disabled,
						personLabel: "Who owns this",
						onChange: (next) => set({
							ownerGroup: next.group,
							ownerId: next.ownerId
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "How it's going"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							className: selectClass,
							"aria-label": "How it's going",
							value: draft.status,
							disabled,
							onChange: (e) => set({ status: e.target.value }),
							children: STATUS_CHOICE.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: s.value,
								children: s.label
							}, s.value))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Target launch date"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass,
							"aria-label": "Target launch date",
							value: draft.targetLaunchDate,
							disabled,
							onChange: (e) => set({ targetLaunchDate: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Went live on"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass,
							"aria-label": "Went live on",
							value: draft.actualLaunchDate,
							disabled,
							onChange: (e) => set({ actualLaunchDate: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Contract start date"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass,
							"aria-label": "Contract start date",
							value: draft.contractStartDate,
							disabled,
							onChange: (e) => set({ contractStartDate: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Tier"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							"aria-label": "Tier",
							value: draft.tier,
							disabled,
							placeholder: "Not recorded",
							onChange: (e) => set({ tier: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "Handed over by"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							"aria-label": "Handed over by",
							value: draft.salesOwner,
							disabled,
							placeholder: "Not recorded",
							onChange: (e) => set({ salesOwner: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "SOW reference"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							"aria-label": "SOW reference",
							value: draft.sowReference,
							disabled,
							placeholder: "Not recorded",
							onChange: (e) => set({ sowReference: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "SOW value"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputClass,
							"aria-label": "SOW value",
							value: draft.sowValue,
							disabled,
							placeholder: "Not recorded",
							onChange: (e) => set({ sowValue: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "SOW signed date"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							className: inputClass,
							"aria-label": "SOW signed date",
							value: draft.sowSignedDate,
							disabled,
							onChange: (e) => set({ sowSignedDate: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block space-y-0.5 md:col-span-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: labelClass,
							children: "What we're trying to achieve for the customer"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							className: areaClass,
							"aria-label": "What we're trying to achieve for the customer",
							rows: 2,
							value: draft.customerGoals,
							disabled,
							placeholder: "Leave blank if it hasn't been confirmed with the customer yet",
							onChange: (e) => set({ customerGoals: e.target.value })
						})]
					})
				]
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[11px] text-destructive",
				children: ["Couldn't save — your entries are still here", mutation.error instanceof Error ? `: ${mutation.error.message}` : ""]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50",
					disabled: disabled || draft.name.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled,
					onClick: () => setOpen(false),
					children: "Cancel"
				})]
			})
		]
	});
}
//#endregion
export { NewImplementation as n, EditImplementation as t };
