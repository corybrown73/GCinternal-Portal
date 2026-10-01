import { describe, expect, it } from "vitest";
import { waitingOn, WAITING_ON_LABEL } from "../customer360-derive";

/**
 * Owner resolution: "Sarah — SE" beats "Waiting on Technical Solutions"
 * whenever the deciding record names a specific person, and the generic
 * party label is the floor, never invented past what the record says.
 */
describe("waitingOn — owner resolution", () => {
  it("falls back to the generic party label when no owner is recorded", () => {
    const w = waitingOn({
      technical_solutions: [{ id: "s1", title: "QuickBooks Integration", status: "in_progress" }],
    });
    expect(w.party).toBe("technical_solutions");
    expect(w.owner).toBeNull();
    expect(w.reason).toBe(
      `Waiting on ${WAITING_ON_LABEL.technical_solutions} to finish QuickBooks Integration — still In progress`,
    );
  });

  it("names the specific owner, with role, when the technical solution has one", () => {
    const w = waitingOn({
      technical_solutions: [
        {
          id: "s1",
          title: "QuickBooks Integration",
          status: "in_progress",
          owner_name: "Sarah",
          owner_role: "se",
        },
      ],
    });
    expect(w.party).toBe("technical_solutions");
    expect(w.owner).toEqual({ name: "Sarah", role: "se" });
    // humanize("se") reads "SE" via the existing acronym dictionary — nothing invented here.
    expect(w.reason).toBe(
      "Waiting on Sarah — SE to finish QuickBooks Integration — still In progress",
    );
    expect(w.task).toBe("finish QuickBooks Integration — still In progress");
  });

  it("names the owner with no role qualifier when the role isn't resolvable", () => {
    const w = waitingOn({
      technical_solutions: [
        { id: "s1", title: "Custom PDF", status: "draft", owner_name: "Priya", owner_role: null },
      ],
    });
    expect(w.owner).toEqual({ name: "Priya", role: null });
    // No fake role is ever glued on: just the name, not "Priya — Technical Solutions".
    expect(w.reason).toBe("Waiting on Priya to finish Custom PDF — still Draft");
  });

  it("names the owner on an open escalation, distinct from the generic TIS label", () => {
    const w = waitingOn({
      escalations: [
        {
          id: "e1",
          status: "open",
          severity: "high",
          title: "Launch at risk",
          owner_name: "Marcus",
          owner_role: "tis",
          raised_at: "2026-01-01",
        },
      ],
    });
    expect(w.party).toBe("tis");
    expect(w.owner).toEqual({ name: "Marcus", role: "tis" });
    expect(w.reason).toBe("Waiting on Marcus — TIS to resolve the open escalation: Launch at risk");
  });

  it("falls back to the generic TIS label when an escalation has no owner_id", () => {
    const w = waitingOn({
      escalations: [
        {
          id: "e1",
          status: "open",
          severity: "high",
          title: "Launch at risk",
          raised_at: "2026-01-01",
        },
      ],
    });
    expect(w.owner).toBeNull();
    expect(w.reason).toBe(
      `Waiting on ${WAITING_ON_LABEL.tis} to resolve the open escalation: Launch at risk`,
    );
  });

  it("names the owner on a risk and on a commitment the same way", () => {
    const risk = waitingOn({
      risks: [
        {
          id: "r1",
          status: "open",
          severity: "high",
          title: "Data migration risk",
          owner_name: "Jo",
          owner_role: "TIS",
          identified_at: "2026-01-01",
        },
      ],
    });
    expect(risk.owner).toEqual({ name: "Jo", role: "TIS" });

    const commitment = waitingOn({
      commitments: [
        {
          id: "c1",
          status: "open",
          description: "Finish the mapping doc",
          committed_to: "GoCanvas",
          owner_name: "Jo",
          owner_role: "TIS",
          due_date: "2026-01-10",
        },
      ],
    });
    expect(commitment.owner).toEqual({ name: "Jo", role: "TIS" });
  });

  it("never invents an owner for a customer-side overdue commitment", () => {
    const w = waitingOn({
      commitments: [
        {
          id: "c1",
          status: "open",
          description: "Send the field user list",
          committed_to: "customer",
          due_date: "2020-01-01",
        },
      ],
    });
    expect(w.party).toBe("customer");
    expect(w.owner).toBeNull();
  });

  it("uses the decision's free-text decided_by as a name, with no role — never a resolvable team_members role", () => {
    const w = waitingOn({
      decisions: [{ id: "d1", status: "pending", title: "Pick the SLA", decided_by: "Avery" }],
    });
    expect(w.owner).toEqual({ name: "Avery", role: null });
    expect(w.reason).toBe("Waiting on Avery to resolve an open decision: Pick the SLA");
  });

  it("the customer approval branch already names a person and is left untouched", () => {
    const w = waitingOn({
      approvals: [
        {
          id: "a1",
          status: "pending",
          title: "SOW sign-off",
          approver_name: "Dana Reed",
          requested_at: "2026-01-01",
        },
      ],
    });
    expect(w.party).toBe("customer");
    expect(w.owner).toEqual({ name: "Dana Reed", role: null });
  });

  it("returns no owner and an empty task when nothing is open", () => {
    const w = waitingOn({});
    expect(w.party).toBe("none");
    expect(w.owner).toBeNull();
    expect(w.task).toBe("");
  });
});
