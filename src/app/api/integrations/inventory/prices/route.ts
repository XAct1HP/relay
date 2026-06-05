import { processIntegrationPriceUpdates } from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";

export async function PATCH(request: Request) {
  return handleIntegrationRoute<{ updates?: unknown }>({
    request,
    handler: async ({ admin, auth, body }) =>
      processIntegrationPriceUpdates(admin, auth.sellerId, body?.updates),
  });
}
