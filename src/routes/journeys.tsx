import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The email-drip feature was renamed to Sequences in v2 so the `journey_`
 * vocabulary could be given to the delivery lifecycle. This permanent redirect
 * stays for good — people have these URLs bookmarked and in old emails.
 */
export const Route = createFileRoute("/journeys")({
  beforeLoad: () => {
    throw redirect({ to: "/sequences", statusCode: 301 });
  },
});
