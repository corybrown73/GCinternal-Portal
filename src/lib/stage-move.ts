/**
 * Moving a deal past the Closed Won check, from any surface.
 *
 * The server refuses a move into Closed Won while the deal has no call note
 * or no SOW, and says which. This asks the person, and retries with `force`
 * when they insist — so the board and the deal page behave the same way.
 */
export const WON_GATE_PREFIX = "Not ready for Closed Won:";

export async function moveWithGate<T>(
  run: (force: boolean) => Promise<T>,
  confirm: (message: string) => boolean = (m) => window.confirm(m),
): Promise<T> {
  try {
    return await run(false);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes(WON_GATE_PREFIX)) throw e;
    const ok = confirm(
      `${message.slice(message.indexOf(WON_GATE_PREFIX))}\n\nClosed Won starts the clock, tells the team to claim it and builds the customer's plan from what is here. Move it anyway?`,
    );
    if (!ok) throw new Error("Left where it was.");
    return run(true);
  }
}
