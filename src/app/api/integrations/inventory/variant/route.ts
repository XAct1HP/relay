import { processIntegrationVariantUpdate } from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";

export async function PATCH(request: Request) {
  return handleIntegrationRoute({
    request,
    handler: async ({ admin, auth, body }) =>
      processIntegrationVariantUpdate(admin, auth.sellerId, body),
  });
}
