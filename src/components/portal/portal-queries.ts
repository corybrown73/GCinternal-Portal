import { queryOptions } from "@tanstack/react-query";
import { getPortalHome, getPortalTickets } from "@/lib/portal.functions";

export const portalHomeQuery = queryOptions({
  queryKey: ["portal", "home"],
  queryFn: () => getPortalHome(),
});

export const portalTicketsQuery = queryOptions({
  queryKey: ["portal", "tickets"],
  queryFn: () => getPortalTickets(),
});
