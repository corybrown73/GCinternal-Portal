import { type CustomerMeetingInput } from "./journal-input";
import { assertImplementationInOrg, callerOrgId } from "./org-scope.server";

/**
 * Records a customer meeting without a transcript. It writes one journal entry
 * and nothing else: no risk, issue, decision, commitment, date change or stage
 * movement comes from it. The transcript flow is a separate path and is not
 * touched by this.
 */
export async function saveCustomerMeeting(args: {
  input: CustomerMeetingInput;
  profileId: string;
  teamMemberId: string | null;
}) {
  const orgId = await callerOrgId(args.profileId);
  await assertImplementationInOrg(args.input.implementationId, orgId);
  const { createJournalEntry } = await import("./hub.server");
  return createJournalEntry({
    implementationId: args.input.implementationId,
    note: args.input.note,
    authorId: args.teamMemberId,
    links: null,
    attachmentUrl: null,
    attachmentName: null,
    kind: "customer_meeting",
    meetingDate: args.input.meetingDate,
    participants: args.input.participants,
  });
}
