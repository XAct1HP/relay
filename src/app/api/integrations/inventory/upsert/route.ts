import {
  IntegrationInventoryError,
  processIntegrationInventoryUpsert,
} from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";
import { createAdminClient } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface IntegrationInventoryUpsertBody {
  items?: unknown;
}

export async function POST(request: Request) {
  return handleIntegrationRoute<IntegrationInventoryUpsertBody>({
    request,
    parseBody: async ({ request, admin, auth }) => {
      const contentType = request.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return (await request.json()) as IntegrationInventoryUpsertBody;
      }

      const formData = await request.formData();
      const rawItems = formData.get("items");

      if (typeof rawItems !== "string" || !rawItems.trim()) {
        return { items: undefined };
      }

      const parsedItems = JSON.parse(rawItems) as unknown;
      if (!Array.isArray(parsedItems)) {
        return {
          items: parsedItems,
        };
      }

      const itemsWithFiles = await Promise.all(
        parsedItems.map(async (rawItem, index) => {
          const item = isRecord(rawItem) ? { ...rawItem } : rawItem;
          if (!isRecord(item)) {
            return item;
          }

          const fileField = resolveConditionPhotoFile(formData, index);

          if (!fileField) {
            return item;
          }

          const uploadedPhotoUrl = await uploadConditionPhotoFile(admin, auth.sellerId, fileField);
          return {
            ...item,
            condition_photo_url: uploadedPhotoUrl,
          };
        })
      );

      return {
        items: itemsWithFiles,
      };
    },
    handler: async ({ admin, auth, body }) =>
      processIntegrationInventoryUpsert(admin, auth.sellerId, body?.items),
  });
}

function extractFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

function resolveConditionPhotoFile(formData: FormData, index: number): File | null {
  const fieldNames = [
    `condition_photo_${index}`,
    `condition_photo_file_${index}`,
    `conditionPhoto_${index}`,
    `conditionPhotoFile_${index}`,
  ];

  if (index === 0) {
    fieldNames.push(
      "condition_photo",
      "condition_photo_file",
      "conditionPhoto",
      "conditionPhotoFile",
      "file"
    );
  }

  for (const fieldName of fieldNames) {
    const file = extractFile(formData.get(fieldName));
    if (file) {
      return file;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getSafeExtension(file: File): string {
  const extensionFromName = file.name.split(".").pop()?.trim().toLowerCase();
  if (extensionFromName) {
    return extensionFromName.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  const extensionFromType = file.type.split("/").pop()?.trim().toLowerCase();
  return extensionFromType?.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function uploadConditionPhotoFile(
  admin: ReturnType<typeof createAdminClient>,
  sellerId: string,
  file: File
) {
  if (!file.type.startsWith("image/")) {
    throw new IntegrationInventoryError("Condition photo must be an image file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new IntegrationInventoryError("Condition photo is too large. Maximum size is 10MB.");
  }

  const extension = getSafeExtension(file);
  const path = `${sellerId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from("listing-images").upload(path, buffer, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });

  if (uploadError) {
    throw new IntegrationInventoryError(`Condition photo upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = admin.storage.from("listing-images").getPublicUrl(path);
  return publicUrlData.publicUrl;
}
