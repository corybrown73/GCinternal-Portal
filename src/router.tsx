import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Thirty seconds of trust in what was just fetched. With the default of
  // zero, every navigation refetched every query on the page it landed on,
  // and a page with a dozen queries paid a dozen round trips before it
  // settled. Mutations invalidate what they change, so nothing goes stale
  // for longer than a person would notice.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a page when the pointer reaches its link, not on click.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
