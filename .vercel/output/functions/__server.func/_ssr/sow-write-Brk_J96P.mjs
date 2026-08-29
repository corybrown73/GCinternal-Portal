import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { $t as setImplementation, Ht as getAttachmentLink, ln as uploadAttachment } from "./router-BT3neubm.mjs";
import { n as fileToBase64 } from "./owner-picker-4BjhSJLG.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sow-write-Brk_J96P.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var nullable = (v) => v.trim() === "" ? null : v.trim();
/** Opens the stored document through a short-lived link. */
function OpenAttachment({ path, label, className }) {
	const link = useServerFn(getAttachmentLink);
	const open = useMutation({
		mutationFn: () => link({ data: { path } }),
		onSuccess: (r) => {
			window.open(r.url, "_blank", "noopener,noreferrer");
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: className ?? buttonClass,
			disabled: open.isPending,
			onClick: () => open.mutate(),
			children: open.isPending ? "Opening…" : label
		}), open.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[11px] text-destructive",
			children: open.error instanceof Error ? open.error.message : "Could not open the file"
		}) : null]
	});
}
/**
* The SOW for one implementation: its reference, the attached document and a way
* to open it. Save/Cancel, like every other editor here.
*/
function SowPanel({ customerId, implementation }) {
	const queryClient = useQueryClient();
	const save = useServerFn(setImplementation);
	const upload = useServerFn(uploadAttachment);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [reference, setReference] = (0, import_react.useState)(implementation.sow_reference ?? "");
	const [file, setFile] = (0, import_react.useState)(null);
	const [documentPath, setDocumentPath] = (0, import_react.useState)(implementation.sow_document_url ?? "");
	const [documentName, setDocumentName] = (0, import_react.useState)(implementation.sow_document_name ?? "");
	const reset = () => {
		setReference(implementation.sow_reference ?? "");
		setDocumentPath(implementation.sow_document_url ?? "");
		setDocumentName(implementation.sow_document_name ?? "");
		setFile(null);
	};
	const mutation = useMutation({
		mutationFn: async () => {
			let path = nullable(documentPath);
			let name = nullable(documentName);
			if (file) {
				if (file.size > 45e5) throw new Error("That file is too large for this preview — keep it under 4 MB.");
				const stored = await upload({ data: {
					folder: "sow",
					fileName: file.name,
					contentType: file.type || "application/octet-stream",
					dataBase64: await fileToBase64(file)
				} });
				path = stored.path;
				name = stored.name;
			}
			return save({ data: {
				id: implementation.id,
				name: implementation.name,
				ownerId: implementation.owner_id,
				salesOwner: implementation.sales_owner,
				tier: implementation.tier,
				status: implementation.status,
				sowReference: reference.trim() === "" ? null : reference.trim(),
				sowDocumentUrl: path,
				sowDocumentName: name,
				sowValue: implementation.sow_value,
				sowSignedDate: implementation.sow_signed_date,
				contractStartDate: implementation.contract_start_date,
				targetLaunchDate: implementation.target_launch_date,
				actualLaunchDate: implementation.actual_launch_date,
				customerGoals: implementation.customer_goals
			} });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
			setFile(null);
			setOpen(false);
		}
	});
	const disabled = mutation.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Reference "
				}), implementation.sow_reference ?? "Not recorded"] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: labelClass,
					children: "Document "
				}), implementation.sow_document_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: implementation.sow_document_name ?? "Attached document" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenAttachment, {
						path: implementation.sow_document_url,
						label: "Open"
					})]
				}) : "Nothing attached"] }),
				!open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: `${buttonClass} ml-auto`,
					onClick: () => {
						mutation.reset();
						reset();
						setOpen(true);
					},
					children: implementation.sow_document_url ? "Replace SOW" : "Attach SOW"
				}) : null
			]
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2 rounded-sm border border-border bg-surface p-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "SOW reference"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						"aria-label": "SOW reference",
						value: reference,
						disabled,
						placeholder: "e.g. SOW-2026-014",
						onChange: (e) => setReference(e.target.value)
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "SOW document"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "file",
						className: "w-full text-[11px]",
						"aria-label": "SOW document",
						disabled,
						onChange: (e) => setFile(e.target.files?.[0] ?? null)
					})]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass,
						disabled,
						onClick: () => mutation.mutate(),
						children: disabled ? "Saving…" : "Save"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: buttonClass,
						disabled,
						onClick: () => {
							mutation.reset();
							reset();
							setOpen(false);
						},
						children: "Cancel"
					}),
					mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-destructive",
						children: mutation.error instanceof Error ? mutation.error.message : "Save failed — values kept"
					}) : null
				]
			})]
		}) : null]
	});
}
//#endregion
export { SowPanel as n, OpenAttachment as t };
