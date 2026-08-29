import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { E as keysQuery, _t as revokeApiKey, dn as cn, lt as createApiKey } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { C as ChevronLeft, b as Copy } from "../_libs/lucide-react.mjs";
import { i as Panel, r as NoRows } from "./record-BXejhTdA.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin.api-keys-_Jy3NmcN.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SCOPES = [
	["accounts:read", "List and read presale accounts"],
	["accounts:write", "Upsert accounts (Salesforce closed-won hook)"],
	["transitions:write", "Move accounts between stages"],
	["tam:write", "Create TAM requests"],
	["tickets:write", "Create and update tickets"],
	["alerts:write", "Push monitoring alerts"],
	["reports:write", "Push usage reports"]
];
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
var primaryButtonClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function ApiKeysPage() {
	const { data: keys } = useSuspenseQuery(keysQuery);
	const queryClient = useQueryClient();
	const create = useServerFn(createApiKey);
	const revoke = useServerFn(revokeApiKey);
	const [name, setName] = (0, import_react.useState)("");
	const [scopes, setScopes] = (0, import_react.useState)([]);
	const [freshKey, setFreshKey] = (0, import_react.useState)(null);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });
	const createMutation = useMutation({
		mutationFn: () => create({ data: {
			name: name.trim(),
			scopes
		} }),
		onSuccess: (result) => {
			invalidate();
			setFreshKey({
				name: name.trim(),
				key: result.key
			});
			setCopied(false);
			setName("");
			setScopes([]);
		}
	});
	const revokeMutation = useMutation({
		mutationFn: (keyId) => revoke({ data: { keyId } }),
		onSuccess: invalidate
	});
	const toggleScope = (scope) => setScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "API keys",
		description: "One key per integration, least-privilege scopes. Keys are hashed at rest and shown exactly once. External tools call /api/v1/* with Authorization: Bearer <key>.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/admin",
			className: buttonClass,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "h-3 w-3" }), " Admin"]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "max-w-3xl space-y-4",
		children: [
			freshKey ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md border border-status-ontrack-foreground/40 bg-status-ontrack px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[13px] font-medium text-status-ontrack-foreground",
					children: [
						"Key created for “",
						freshKey.name,
						"” — copy it now, it will not be shown again."
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
							className: "min-w-0 flex-1 truncate rounded-sm border border-border bg-background px-2 py-1 font-mono text-[12px]",
							children: freshKey.key
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: buttonClass,
							onClick: () => {
								navigator.clipboard.writeText(freshKey.key).then(() => setCopied(true));
							},
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "h-3 w-3" }),
								" ",
								copied ? "Copied" : "Copy"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: buttonClass,
							onClick: () => setFreshKey(null),
							children: "Dismiss"
						})
					]
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Create a key",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "space-y-2.5 px-3 py-2.5",
					onSubmit: (e) => {
						e.preventDefault();
						if (!createMutation.isPending) createMutation.mutate();
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "max-w-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: labelClass,
								children: "Name *"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputClass,
								value: name,
								placeholder: "salesforce-closed-won",
								onChange: (e) => setName(e.target.value),
								required: true
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: labelClass,
							children: "Scopes * (pick the minimum this integration needs)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-1 grid gap-1 sm:grid-cols-2",
							children: SCOPES.map(([scope, hint]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1.5 hover:bg-muted/60",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: "mt-0.5",
									checked: scopes.includes(scope),
									onChange: () => toggleScope(scope)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
										className: "font-mono text-[11px]",
										children: scope
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-[11px] text-muted-foreground",
										children: hint
									})]
								})]
							}, scope))
						})] }),
						createMutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-destructive",
							children: createMutation.error.message
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex justify-end",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "submit",
								className: primaryButtonClass,
								disabled: createMutation.isPending || name.trim() === "" || scopes.length === 0,
								children: createMutation.isPending ? "Creating…" : "Create key"
							})
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Existing keys",
				count: keys.length,
				children: keys.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No keys yet." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Name"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Key"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Scopes"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Last used"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Status"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-3 py-1.5" })
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "divide-y divide-border",
							children: keys.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "hover:bg-muted/60",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-1.5 text-[13px] font-medium",
										children: k.name
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "px-3 py-1.5 font-mono text-[11px] text-muted-foreground",
										children: [k.key_prefix, "…"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-1.5",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "flex max-w-56 flex-wrap gap-1",
											children: k.scopes.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
												className: "rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]",
												children: s
											}, s))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-1.5 font-mono text-[11px] text-muted-foreground",
										children: k.last_used_at ? fmtDateTime(k.last_used_at) : "never"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-1.5",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", k.revoked_at ? "bg-status-blocked text-status-blocked-foreground" : "bg-status-ontrack text-status-ontrack-foreground"),
											children: k.revoked_at ? "revoked" : "active"
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-1.5 text-right",
										children: !k.revoked_at ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "text-[11px] text-destructive hover:underline",
											disabled: revokeMutation.isPending,
											onClick: () => {
												if (confirm(`Revoke “${k.name}”? Integrations using it stop working immediately.`)) revokeMutation.mutate(k.id);
											},
											children: "Revoke"
										}) : null
									})
								]
							}, k.id))
						})]
					})
				})
			})
		]
	})] });
}
//#endregion
export { ApiKeysPage as component };
