import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/technical-solutions")({
  component: () => <Outlet />,
});
