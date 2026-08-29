import { r as __exportAll } from "../_runtime.mjs";
import { n as __exportAll$1 } from "./server-C995c9rK2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/presale-stages-BXcdOdDO.js
var presale_stages_BXcdOdDO_exports = /* @__PURE__ */ __exportAll({
	i: () => presale_stages_exports,
	n: () => STAGE_LABELS,
	r: () => isStage,
	t: () => STAGES
});
var presale_stages_exports = /* @__PURE__ */ __exportAll$1({
	STAGES: () => STAGES,
	STAGE_LABELS: () => STAGE_LABELS,
	isStage: () => isStage
});
var STAGES = [
	"prospect",
	"closed_won",
	"onboarding_kickoff",
	"in_onboarding",
	"onboarding_complete"
];
var STAGE_LABELS = {
	prospect: "Prospect",
	closed_won: "Closed Won",
	onboarding_kickoff: "Onboarding Kickoff",
	in_onboarding: "In Onboarding",
	onboarding_complete: "Onboarding Complete"
};
function isStage(value) {
	return STAGES.includes(value);
}
//#endregion
export { presale_stages_BXcdOdDO_exports as i, STAGE_LABELS as n, isStage as r, STAGES as t };
