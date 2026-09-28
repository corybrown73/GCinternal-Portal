/**
 * Moving a deal from any surface.
 *
 * The server refuses a move into Closed Won while the deal has no call note
 * or no SOW, and says which. Nothing here asks a browser dialog: the caller
 * reads the refusal with `parseWonGate` and shows the gate notice, whose
 * "Add" buttons open the missing piece and whose "Move it anyway" (managers
 * only) retries with `force`.
 */
export { WON_GATE_PREFIX, parseWonGate } from "./won-gate";
