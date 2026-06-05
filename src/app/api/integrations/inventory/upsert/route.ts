import { processIntegrationInventoryUpsert } from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";

export async function POST(request: Request) {
  return handleIntegrationRoute<{ items?: unknown }>({
    request,
    handler: async ({ admin, auth, body }) =>
      processIntegrationInventoryUpsert(admin, auth.sellerId, body?.items),
  });
}
