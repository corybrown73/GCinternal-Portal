import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/journeys")({
  component: () => <Outlet />,
});
