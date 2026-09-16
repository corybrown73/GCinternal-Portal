import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

export const getDeliveryAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadDeliveryAnalytics } = await import("./delivery-analytics.server");
    return loadDeliveryAnalytics();
  });
