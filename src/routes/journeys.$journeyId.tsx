import { createFileRoute, redirect } from "@tanstack/react-router";

/** Permanent redirect to the renamed Sequences detail page. See journeys.tsx. */
export const Route = createFileRoute("/journeys/$journeyId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/sequences/$sequenceId",
      params: { sequenceId: params.journeyId },
      statusCode: 301,
    });
  },
});
