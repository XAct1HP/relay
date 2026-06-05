import { processIntegrationListingDeactivate } from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";

export async function POST(request: Request) {
  return handleIntegrationRoute({
    request,
    handler: async ({ admin, auth, body }) =>
      processIntegrationListingDeactivate(admin, auth.sellerId, body),
  });
}
