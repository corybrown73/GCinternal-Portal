import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // The app sits behind auth: the SSR document request carries no Supabase
    // bearer token, so route loaders that call auth-required server functions
    // would throw during server rendering. Render routes client-side (the
    // root shell still SSRs); loaders then run with the attached session.
    defaultSsr: false,
  });

  return router;
};
