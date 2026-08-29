import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as fmtDate, o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { D as SOLUTION_STATUSES, O as TECHNICAL_SOLUTIONS_ROLE, at as splitLinks, g as FIELD_MAPPING_STATUSES, y as NOTE_TYPES } from "./implementation-input-BaYoTLwL.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { Qt as setFieldMapping, Vt as createTechnicalSolutionNote, a as Route$13, cn as setTechnicalSolutionStatus, kt as addFieldMapping, ln as uploadAttachment, o as solutionQuery, rn as setSolutionDesign, sn as setTechnicalSolutionOwner } from "./router-BT3neubm.mjs";
import { n as PageBody } from "./page-wX17g2fe.mjs";
import { O as ArrowRight, S as ChevronRight, d as Pencil, u as Plus } from "../_libs/lucide-react.mjs";
import { a as PrimarySignal, c as StatusChip, i as Panel, n as Field, r as NoRows, s as StageBadge, t as AttentionBand } from "./record-BXejhTdA.mjs";
import { C as waitingOnForSolution, b as technicalSolutionNextAction } from "./customer360-derive-DgUfIdHQ.mjs";
import { n as fileToBase64, t as OwnerPicker } from "./owner-picker-4BjhSJLG.mjs";
import { a as DialogHeader, i as DialogFooter, n as DialogContent, o as DialogTitle, r as DialogDescription, t as Dialog } from "./dialog-CwLzEEob.mjs";
import { t as OpenAttachment } from "./sow-write-Brk_J96P.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/technical-solutions._id-sHjpiSpA.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var selectClass$1 = "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var iconButtonClass$1 = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
function useInvalidate(id) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["technical-solution", id] });
}
function OwnerEditor({ solutionId, ownerId, ownerName, team }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [pending, setPending] = (0, import_react.useState)(ownerId ?? "");
	const invalidate = useInvalidate(solutionId);
	const save = useServerFn(setTechnicalSolutionOwner);
	const mutation = useMutation({
		mutationFn: (next) => save({ data: {
			id: solutionId,
			ownerId: next
		} }),
		onSuccess: async () => {
			await invalidate();
			setEditing(false);
		}
	});
	const options = team.filter((m) => m.role === TECHNICAL_SOLUTIONS_ROLE);
	if (!editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "flex items-center gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: ownerName ?? "Unassigned" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: iconButtonClass$1,
			onClick: () => {
				setPending(ownerId ?? "");
				mutation.reset();
				setEditing(true);
			},
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Assign owner"]
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "flex items-center gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
				"aria-label": "Solution owner",
				className: selectClass$1,
				value: pending,
				disabled: mutation.isPending,
				onChange: (e) => setPending(e.target.value),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: "",
					children: "Unassigned"
				}), options.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: m.id,
					children: m.name
				}, m.id))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass$1,
				disabled: mutation.isPending || pending === (ownerId ?? ""),
				onClick: () => mutation.mutate(pending === "" ? null : pending),
				children: "Save"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass$1,
				disabled: mutation.isPending,
				onClick: () => {
					setPending(ownerId ?? "");
					mutation.reset();
					setEditing(false);
				},
				children: "Cancel"
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[11px] text-destructive",
				children: "Save failed"
			}) : null
		]
	});
}
function StatusEditor({ solutionId, status }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [pending, setPending] = (0, import_react.useState)(status);
	const invalidate = useInvalidate(solutionId);
	const save = useServerFn(setTechnicalSolutionStatus);
	const mutation = useMutation({
		mutationFn: (next) => save({ data: {
			id: solutionId,
			status: next
		} }),
		onSuccess: async () => {
			await invalidate();
			setEditing(false);
		}
	});
	if (!editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: iconButtonClass$1,
		onClick: () => {
			setPending(status);
			mutation.reset();
			setEditing(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Status"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "flex items-center gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				"aria-label": "Solution status",
				className: selectClass$1,
				value: pending,
				disabled: mutation.isPending,
				onChange: (e) => setPending(e.target.value),
				children: SOLUTION_STATUSES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: s,
					children: humanize(s)
				}, s))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass$1,
				disabled: mutation.isPending || pending === status,
				onClick: () => mutation.mutate(pending),
				children: "Save"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass$1,
				disabled: mutation.isPending,
				onClick: () => {
					setPending(status);
					mutation.reset();
					setEditing(false);
				},
				children: "Cancel"
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[11px] text-destructive",
				children: "Save failed"
			}) : null
		]
	});
}
/**
* Working notes for the Technical Solutions team, written from inside the
* solution they belong to. The solution is taken from the page — never picked in
* the form — so an entry stays with the solution it was written against.
*/
function AddNoteAction({ solutionId, team }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [noteType, setNoteType] = (0, import_react.useState)(NOTE_TYPES[0]);
	const [content, setContent] = (0, import_react.useState)("");
	const [links, setLinks] = (0, import_react.useState)("");
	const [group, setGroup] = (0, import_react.useState)(TECHNICAL_SOLUTIONS_ROLE);
	const [authorId, setAuthorId] = (0, import_react.useState)("");
	const [file, setFile] = (0, import_react.useState)(null);
	const invalidate = useInvalidate(solutionId);
	const save = useServerFn(createTechnicalSolutionNote);
	const upload = useServerFn(uploadAttachment);
	const reset = () => {
		setNoteType(NOTE_TYPES[0]);
		setContent("");
		setLinks("");
		setGroup(TECHNICAL_SOLUTIONS_ROLE);
		setAuthorId("");
		setFile(null);
	};
	const mutation = useMutation({
		mutationFn: async () => {
			let attachmentUrl = null;
			let attachmentName = null;
			if (file) {
				if (file.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "solution",
					fileName: file.name,
					contentType: file.type || "application/octet-stream",
					dataBase64: await fileToBase64(file)
				} });
				attachmentUrl = stored.path;
				attachmentName = stored.name;
			}
			return save({ data: {
				technicalSolutionId: solutionId,
				noteType,
				content: content.trim(),
				authorId: authorId === "" ? null : authorId,
				links: links.trim() === "" ? null : links.trim(),
				attachmentUrl,
				attachmentName
			} });
		},
		onSuccess: async () => {
			await invalidate();
			setOpen(false);
			reset();
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: iconButtonClass$1,
		onClick: () => setOpen(true),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add note"]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange: (v) => mutation.isPending ? null : setOpen(v),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "sm:max-w-lg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
					className: "text-[14px]",
					children: "Add journal entry"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, {
					className: "text-[12px]",
					children: "Filed against this solution and kept as written — entries cannot be changed or removed once saved."
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
								children: "Kind of note"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: `${selectClass$1} h-7 w-full`,
								value: noteType,
								disabled: mutation.isPending,
								onChange: (e) => setNoteType(e.target.value),
								children: NOTE_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: t,
									children: humanize(t)
								}, t))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
								children: "What you found, decided or discussed"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: "min-h-24 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring",
								value: content,
								disabled: mutation.isPending,
								onChange: (e) => setContent(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
									children: "Links (one per line)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
									className: "min-h-10 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring",
									placeholder: "https://…",
									value: links,
									disabled: mutation.isPending,
									onChange: (e) => setLinks(e.target.value)
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
									children: "Attachment"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "file",
									className: "w-full text-[11px]",
									"aria-label": "Attachment",
									disabled: mutation.isPending,
									onChange: (e) => setFile(e.target.files?.[0] ?? null)
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerPicker, {
								team,
								group,
								ownerId: authorId,
								disabled: mutation.isPending,
								personLabel: "Written by",
								onChange: (next) => {
									setGroup(next.group);
									setAuthorId(next.ownerId);
								}
							})
						}),
						mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-destructive",
							children: mutation.error instanceof Error ? mutation.error.message : "Could not save this entry."
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: iconButtonClass$1,
					onClick: () => {
						mutation.reset();
						setOpen(false);
					},
					disabled: mutation.isPending,
					children: "Cancel"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "inline-flex items-center rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50",
					disabled: mutation.isPending || content.trim() === "",
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save note"
				})] })
			]
		})
	})] });
}
/**
* The design write-up kept on the solution: what the design is and how it is
* configured. Same Save/Cancel behaviour as every other editor here.
*/
function DesignEditor({ solutionId, designSummary, configurationDetails }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [summary, setSummary] = (0, import_react.useState)(designSummary ?? "");
	const [config, setConfig] = (0, import_react.useState)(configurationDetails ?? "");
	const invalidate = useInvalidate(solutionId);
	const save = useServerFn(setSolutionDesign);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: solutionId,
			designSummary: summary.trim() === "" ? null : summary.trim(),
			configurationDetails: config.trim() === "" ? null : config.trim()
		} }),
		onSuccess: async () => {
			await invalidate();
			setEditing(false);
		}
	});
	const reset = () => {
		setSummary(designSummary ?? "");
		setConfig(configurationDetails ?? "");
		mutation.reset();
	};
	if (!editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: iconButtonClass$1,
		onClick: () => {
			reset();
			setEditing(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit design record"]
	});
	const textareaClass = "min-h-24 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-3 md:grid-cols-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: "Design summary"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: textareaClass,
					"aria-label": "Design summary",
					placeholder: "What the solution does and how it is put together",
					value: summary,
					disabled: mutation.isPending,
					onChange: (e) => setSummary(e.target.value)
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block space-y-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: "Configuration details"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: textareaClass,
					"aria-label": "Configuration details",
					placeholder: "Settings, forms, workflows and anything needed to rebuild this",
					value: config,
					disabled: mutation.isPending,
					onChange: (e) => setConfig(e.target.value)
				})]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: iconButtonClass$1,
					disabled: mutation.isPending,
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Saving…" : "Save"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: iconButtonClass$1,
					disabled: mutation.isPending,
					onClick: () => {
						reset();
						setEditing(false);
					},
					children: "Cancel"
				}),
				mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] text-destructive",
					children: mutation.error instanceof Error ? mutation.error.message : "Save failed"
				}) : null
			]
		})]
	});
}
var selectClass = "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var iconButtonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var dash$1 = (v) => v === null || v === void 0 || v === "" ? "—" : v;
var requiredToken = (v) => v === null || v === void 0 ? "" : v ? "yes" : "no";
var nullable = (v) => v.trim() === "" ? null : v.trim();
var draftFrom = (m) => ({
	sourceField: m?.source_field ?? "",
	sourceSystem: m?.source_system ?? "",
	targetField: m?.target_field ?? "",
	transformationNotes: m?.transformation_notes ?? "",
	required: requiredToken(m?.required),
	status: m?.status ?? ""
});
var draftPayload = (d) => ({
	sourceField: nullable(d.sourceField),
	sourceSystem: nullable(d.sourceSystem),
	targetField: nullable(d.targetField),
	transformationNotes: nullable(d.transformationNotes),
	required: d.required === "" ? null : d.required === "yes",
	status: d.status === "" ? null : d.status
});
function RequiredSelect({ value, disabled, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
		"aria-label": "Required",
		className: selectClass,
		value,
		disabled,
		onChange: (e) => onChange(e.target.value),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "Not set"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "yes",
				children: "Required"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "no",
				children: "Not required"
			})
		]
	});
}
function StatusSelect({ value, disabled, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
		"aria-label": "Mapping status",
		className: selectClass,
		value,
		disabled,
		onChange: (e) => onChange(e.target.value),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
			value: "",
			children: "Not set"
		}), FIELD_MAPPING_STATUSES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
			value: s,
			children: humanize(s)
		}, s))]
	});
}
/** One mapping row: read it, or open it and edit every part of it. */
function FieldMappingRow({ solutionId, mapping }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(() => draftFrom(mapping));
	const queryClient = useQueryClient();
	const save = useServerFn(setFieldMapping);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: mapping.id,
			...draftPayload(draft)
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["technical-solution", solutionId] });
			setEditing(false);
		}
	});
	const reset = () => {
		setDraft(draftFrom(mapping));
		mutation.reset();
	};
	if (!editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
		className: "align-top",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 font-mono text-[12px]",
				children: dash$1(mapping.source_field)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-[12px]",
				children: dash$1(mapping.source_system)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 font-mono text-[12px]",
				children: dash$1(mapping.target_field)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-[12px]",
				children: dash$1(mapping.transformation_notes)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-[12px]",
				children: mapping.required === null || mapping.required === void 0 ? "—" : mapping.required ? "Yes" : "No"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-[12px]",
				children: mapping.status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: mapping.status }) : "—"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-right",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: iconButtonClass,
					onClick: () => {
						reset();
						setEditing(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "h-3 w-3" }), " Edit"]
				})
			})
		]
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
		className: "align-top bg-surface",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					"aria-label": "Source field",
					className: `${inputClass} font-mono`,
					placeholder: "Field in the source system",
					value: draft.sourceField,
					disabled,
					onChange: (e) => setDraft({
						...draft,
						sourceField: e.target.value
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					"aria-label": "Source system",
					className: inputClass,
					placeholder: "Where the data comes from",
					value: draft.sourceSystem,
					disabled,
					onChange: (e) => setDraft({
						...draft,
						sourceSystem: e.target.value
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					"aria-label": "GoCanvas field",
					className: `${inputClass} font-mono`,
					placeholder: "Field it lands in",
					value: draft.targetField,
					disabled,
					onChange: (e) => setDraft({
						...draft,
						targetField: e.target.value
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					"aria-label": "Transformation",
					className: inputClass,
					placeholder: "How the value is changed",
					value: draft.transformationNotes,
					disabled,
					onChange: (e) => setDraft({
						...draft,
						transformationNotes: e.target.value
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequiredSelect, {
					value: draft.required,
					disabled,
					onChange: (v) => setDraft({
						...draft,
						required: v
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusSelect, {
					value: draft.status,
					disabled,
					onChange: (v) => setDraft({
						...draft,
						status: v
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 text-right",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: iconButtonClass,
							disabled,
							onClick: () => mutation.mutate(),
							children: "Save"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: iconButtonClass,
							disabled,
							onClick: () => {
								reset();
								setEditing(false);
							},
							children: "Cancel"
						}),
						mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] text-destructive",
							children: mutation.error.message
						}) : null
					]
				})
			})
		]
	});
}
/**
* Add another mapping to this solution. A solution can carry as many mappings as
* the integration needs, so this stays open for a second entry after each save.
*/
function AddFieldMapping({ solutionId }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(() => draftFrom());
	const queryClient = useQueryClient();
	const create = useServerFn(addFieldMapping);
	const mutation = useMutation({
		mutationFn: () => create({ data: {
			technicalSolutionId: solutionId,
			...draftPayload(draft)
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["technical-solution", solutionId] });
			setDraft(draftFrom());
		}
	});
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: iconButtonClass,
		onClick: () => {
			setDraft(draftFrom());
			mutation.reset();
			setOpen(true);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Add mapping"]
	});
	const disabled = mutation.isPending;
	const ready = draft.sourceField.trim() !== "" || draft.targetField.trim() !== "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass,
				onClick: () => {
					mutation.reset();
					setOpen(false);
				},
				children: "Close"
			}),
			mutation.isSuccess ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[11px] text-muted-foreground",
				children: "Mapping added"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddRowForm, {
				draft,
				disabled,
				ready,
				error: mutation.isError ? mutation.error.message : null,
				onChange: setDraft,
				onSave: () => mutation.mutate()
			})
		]
	});
}
/** The new-mapping fields, laid out to match the table above it. */
function AddRowForm({ draft, disabled, ready, error, onChange, onSave }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex flex-wrap items-center gap-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				"aria-label": "New source field",
				className: `${inputClass} w-28 font-mono`,
				placeholder: "Source field",
				value: draft.sourceField,
				disabled,
				onChange: (e) => onChange({
					...draft,
					sourceField: e.target.value
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				"aria-label": "New source system",
				className: `${inputClass} w-28`,
				placeholder: "Source system",
				value: draft.sourceSystem,
				disabled,
				onChange: (e) => onChange({
					...draft,
					sourceSystem: e.target.value
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				"aria-label": "New GoCanvas field",
				className: `${inputClass} w-28 font-mono`,
				placeholder: "GoCanvas field",
				value: draft.targetField,
				disabled,
				onChange: (e) => onChange({
					...draft,
					targetField: e.target.value
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				"aria-label": "New transformation",
				className: `${inputClass} w-32`,
				placeholder: "Transformation",
				value: draft.transformationNotes,
				disabled,
				onChange: (e) => onChange({
					...draft,
					transformationNotes: e.target.value
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequiredSelect, {
				value: draft.required,
				disabled,
				onChange: (v) => onChange({
					...draft,
					required: v
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusSelect, {
				value: draft.status,
				disabled,
				onChange: (v) => onChange({
					...draft,
					status: v
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: iconButtonClass,
				disabled: disabled || !ready,
				onClick: onSave,
				children: disabled ? "Saving…" : "Save mapping"
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[11px] text-destructive",
				children: error
			}) : null
		]
	});
}
var dash = (v) => v === null || v === void 0 || v === "" ? "—" : v;
var NOTE_TYPE_CLASS = {
	assessment: "bg-muted text-foreground",
	design: "bg-muted text-foreground",
	build: "bg-muted text-foreground",
	limitation: "bg-status-risk text-status-risk-foreground",
	handoff: "bg-status-ontrack text-status-ontrack-foreground"
};
function SolutionDetail() {
	const { id } = Route$13.useParams();
	const { data } = useSuspenseQuery(solutionQuery(id));
	const record = data;
	const { solution, customer, implementation, requirement } = record;
	const next = technicalSolutionNextAction(record);
	const waiting = waitingOnForSolution(record);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "border-b border-border bg-surface px-5 py-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				className: "flex items-center gap-1 text-[11px] text-muted-foreground",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/technical-solutions",
						search: {
							sort: "customer",
							dir: "asc"
						},
						className: "hover:text-foreground",
						children: "Technical Solutions"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3 w-3" }),
					customer.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/customers/$customerId",
						params: { customerId: customer.id },
						className: "hover:text-foreground",
						children: customer.name
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: customer.name }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3 w-3" }),
					customer.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/customers/$customerId",
						params: { customerId: customer.id },
						search: { tab: "solution" },
						className: "hover:text-foreground",
						children: implementation?.name ?? "Implementation"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: implementation?.name ?? "Implementation" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3 w-3" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-foreground",
						children: solution.title
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex flex-wrap items-baseline gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-[18px] font-semibold tracking-tight",
						children: solution.title
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: solution.status }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusEditor, {
						solutionId: solution.id,
						status: solution.status
					}),
					implementation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: implementation.current_stage }) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AttentionBand, { children: [waiting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySignal, {
					label: "Waiting on",
					emphasis: "medium",
					value: "Technical Solutions",
					detail: waiting.reason.replace(/^Waiting on Technical Solutions — /, "")
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySignal, {
					label: "Next action",
					value: next
				})] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Owner",
						value: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerEditor, {
							solutionId: solution.id,
							ownerId: solution.owner_id,
							ownerName: solution.owner_name,
							team: record.team
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Requirement solved",
						value: requirement ? customer.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/customers/$customerId",
							params: { customerId: customer.id },
							search: { tab: "requirements" },
							className: "hover:underline",
							children: requirement.title
						}) : requirement.title : "No requirement linked"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Created",
						value: fmtDate(solution.created_at)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Last updated",
						value: fmtDate(solution.updated_at)
					})
				]
			})
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "space-y-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
					children: "Current state"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Design record",
					meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: humanize(solution.status) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DesignEditor, {
							solutionId: solution.id,
							designSummary: solution.design_summary,
							configurationDetails: solution.configuration_details
						})]
					}),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3 px-3 py-2.5 md:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: "Design summary"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "whitespace-pre-wrap text-[12px] leading-relaxed",
							children: dash(solution.design_summary)
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: "Configuration details"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "whitespace-pre-wrap text-[12px] leading-relaxed",
							children: dash(solution.configuration_details)
						})] })]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Field mapping",
					count: record.field_mappings.length,
					meta: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddFieldMapping, { solutionId: solution.id }),
					children: record.field_mappings.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Source field"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Source system"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "GoCanvas field"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Transformation"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Required"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Status"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 text-right font-medium",
									children: "Maintain"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "divide-y divide-border",
							children: record.field_mappings.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldMappingRow, {
								solutionId: solution.id,
								mapping: m
							}, m.id))
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No field mappings recorded. Add the first one to connect source data to the right fields." })
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "space-y-3 border-t border-border pt-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
					children: "History & context"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Technical Solutions journal",
					count: record.notes.length,
					meta: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Newest first" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddNoteAction, {
							solutionId: solution.id,
							team: record.team
						})]
					}),
					children: record.notes.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: record.notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap items-baseline gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${NOTE_TYPE_CLASS[n.note_type] ?? "bg-muted text-muted-foreground"}`,
										children: humanize(n.note_type)
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[11px] text-muted-foreground",
										children: [
											n.author_name ?? "Author not recorded",
											" · ",
											fmtDateTime(n.created_at)
										]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 whitespace-pre-wrap text-[12px] leading-relaxed",
									children: n.content
								}),
								splitLinks(n.links).length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "mt-1 space-y-0.5",
									children: splitLinks(n.links).map((link) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: link,
										target: "_blank",
										rel: "noopener noreferrer",
										className: "text-[11px] text-primary underline",
										children: link
									}) }, link))
								}) : null,
								n.attachment_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex items-center gap-2 text-[11px]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: n.attachment_name ?? "Attachment" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenAttachment, {
										path: n.attachment_url,
										label: "Open"
									})]
								}) : null
							]
						}, n.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No journal entries recorded yet." })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Ownership changes",
					count: record.ownership_history.length,
					children: record.ownership_history.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: record.ownership_history.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2 text-[12px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[11px] text-muted-foreground",
									children: fmtDateTime(h.changed_at)
								}),
								" ",
								"· ",
								dash(h.old_value),
								" → ",
								dash(h.new_value),
								h.changed_by_name ? ` · by ${h.changed_by_name}` : "",
								h.change_reason ? ` · ${h.change_reason}` : ""
							]
						}, h.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No ownership changes recorded." })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Decisions",
					count: record.decisions.length,
					children: record.decisions.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: record.decisions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-baseline gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[13px] font-medium",
										children: d.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: d.status }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[11px] text-muted-foreground",
										children: fmtDate(d.decision_date)
									}),
									d.decided_by ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[11px] text-muted-foreground",
										children: ["decided by ", d.decided_by]
									}) : null
								]
							}), d.rationale ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[12px] leading-relaxed text-muted-foreground",
								children: d.rationale
							}) : null]
						}, d.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No decisions linked to this solution." })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Proof",
					count: record.evidence.length,
					children: record.evidence.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: record.evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2 text-[12px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium",
									children: e.title
								}),
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-muted-foreground",
									children: [
										"· ",
										humanize(e.type),
										" · ",
										e.uploaded_by_name ?? "Unknown",
										" ·",
										" ",
										fmtDate(e.created_at)
									]
								}),
								e.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-0.5 text-muted-foreground",
									children: e.description
								}) : null
							]
						}, e.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No proof attached to this solution." })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Approvals",
					count: record.approvals.length,
					children: record.approvals.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border",
						children: record.approvals.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "px-3 py-2 text-[12px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium",
									children: a.title
								}),
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: a.status }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-muted-foreground",
									children: [
										" ",
										"· ",
										a.approver_name ?? "Unnamed approver",
										a.approver_role ? ` (${a.approver_role})` : "",
										" · requested",
										" ",
										fmtDate(a.requested_at),
										a.decided_at ? ` · decided ${fmtDate(a.decided_at)}` : ""
									]
								})
							]
						}, a.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No approvals recorded against this solution." })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					level: "reference",
					title: "Traceability",
					count: record.trace.length + record.linked_trace.length,
					meta: "Direct links, plus links via a decision",
					children: record.trace.length || record.linked_trace.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-2.5 px-3 py-2.5",
						children: [
							record.trace.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
									children: "Direct links"
								}), record.trace.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1.5 text-[12px]",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: humanize(s.entity_type)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3 text-muted-foreground" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: s.label }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-mono text-[10px] uppercase tracking-wide text-muted-foreground",
											children: s.relationship
										})
									]
								}, `${s.entity_type}-${s.id}`))]
							}) : null,
							record.linked_trace.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-1.5 border-l-2 border-dashed border-border pl-2.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
									children: "Linked via a decision (indirect)"
								}), record.linked_trace.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1.5 text-[12px] text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: humanize(s.entity_type) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-foreground",
											children: s.label
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-mono text-[10px] uppercase tracking-wide",
											children: s.relationship
										})
									]
								}, `indirect-${s.entity_type}-${s.id}`))]
							}) : null,
							record.trace.some((s) => s.entity_type.startsWith("requirement")) ? null : record.linked_trace.length && record.linked_trace.some((s) => s.entity_type.startsWith("requirement")) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "pt-1 text-[11px] text-muted-foreground",
								children: "No direct link from the requirement to this solution — it is connected via a linked decision instead."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "pt-1 text-[11px] text-muted-foreground",
								children: "No requirement link found in the trace history — the requirement shown in the header comes from this solution's requirement field."
							})
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No trace links exist for this solution." })
				})
			]
		})]
	})] });
}
//#endregion
export { SolutionDetail as component };
