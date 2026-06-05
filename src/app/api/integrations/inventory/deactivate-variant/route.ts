import { processIntegrationVariantDeactivate } from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";

export async function POST(request: Request) {
  return handleIntegrationRoute({
    request,
    handler: async ({ admin, auth, body }) =>
      processIntegrationVariantDeactivate(admin, auth.sellerId, body),
  });
}
