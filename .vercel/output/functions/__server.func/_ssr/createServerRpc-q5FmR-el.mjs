import { t as TSS_SERVER_FUNCTION } from "./server-C995c9rK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/createServerRpc-q5FmR-el.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
//#endregion
export { createServerRpc as t };
