import {
  IntegrationInventoryError,
  processIntegrationInventoryUpsert,
} from "@/lib/integration-inventory";
import { handleIntegrationRoute } from "@/lib/integration-route";
import { createAdminClient } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  return handleIntegrationRoute<unknown>({
    request,
    parseBody: async ({ request, admin, auth }) => {
      const contentType = request.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return (await request.json()) as unknown;
      }

      const formData = await request.formData();
      const rawItems = formData.get("items") ?? formData.get("item");

      if (typeof rawItems !== "string" || !rawItems.trim()) {
        return {};
      }

      const parsedPayload = JSON.parse(rawItems) as unknown;
      return await injectUploadedConditionPhotos(parsedPayload, formData, admin, auth.sellerId);
    },
    handler: async ({ admin, auth, body }) =>
      processIntegrationInventoryUpsert(admin, auth.sellerId, body),
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

function resolveInventoryConditionPhotoFile(
  formData: FormData,
  itemIndex: number,
  rowIndex: number,
  allowSingleItemAliases: boolean
): File | null {
  const fieldNames = [
    `condition_photo_${itemIndex}_${rowIndex}`,
    `condition_photo_file_${itemIndex}_${rowIndex}`,
    `conditionPhoto_${itemIndex}_${rowIndex}`,
    `conditionPhotoFile_${itemIndex}_${rowIndex}`,
  ];

  if (allowSingleItemAliases) {
    fieldNames.push(
      `condition_photo_${rowIndex}`,
      `condition_photo_file_${rowIndex}`,
      `conditionPhoto_${rowIndex}`,
      `conditionPhotoFile_${rowIndex}`
    );

    if (rowIndex === 0) {
      fieldNames.push(
        "condition_photo",
        "condition_photo_file",
        "conditionPhoto",
        "conditionPhotoFile",
        "file"
      );
    }
  }

  for (const fieldName of fieldNames) {
    const file = extractFile(formData.get(fieldName));
    if (file) {
      return file;
    }
  }

  return null;
}

async function injectUploadedConditionPhotos(
  payload: unknown,
  formData: FormData,
  admin: ReturnType<typeof createAdminClient>,
  sellerId: string
) {
  const singleItemPayload = isRecord(payload) &&
    (payload.sku !== undefined || payload.inventory !== undefined || payload.variants !== undefined || payload.used_items !== undefined)
      ? payload
      : null;
  const parsedItems = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
    ? payload.items
    : singleItemPayload
    ? [singleItemPayload]
    : null;

  if (!parsedItems) {
    return payload;
  }

  const isSingleItemPayload = parsedItems.length === 1;

  const itemsWithFiles = await Promise.all(
    parsedItems.map(async (rawItem, itemIndex) => {
      const item = isRecord(rawItem) ? { ...rawItem } : rawItem;
      if (!isRecord(item)) {
        return item;
      }

      const inventoryRows = Array.isArray(item.inventory) ? [...item.inventory] : null;
      if (inventoryRows) {
        item.inventory = await Promise.all(
          inventoryRows.map(async (rawRow, rowIndex) => {
            const row = isRecord(rawRow) ? { ...rawRow } : rawRow;
            if (!isRecord(row)) {
              return row;
            }

            const fileField = resolveInventoryConditionPhotoFile(
              formData,
              itemIndex,
              rowIndex,
              isSingleItemPayload
            );

            if (!fileField) {
              return row;
            }

            const uploadedPhotoUrl = await uploadConditionPhotoFile(admin, sellerId, fileField);
            return {
              ...row,
              condition_photo_url: uploadedPhotoUrl,
            };
          })
        );

        return item;
      }

      const usedItems = Array.isArray(item.used_items) ? [...item.used_items] : null;
      if (usedItems) {
        item.used_items = await Promise.all(
          usedItems.map(async (rawRow, rowIndex) => {
            const row = isRecord(rawRow) ? { ...rawRow } : rawRow;
            if (!isRecord(row)) {
              return row;
            }

            const fileField = resolveInventoryConditionPhotoFile(
              formData,
              itemIndex,
              rowIndex,
              isSingleItemPayload
            );

            if (!fileField) {
              return row;
            }

            const uploadedPhotoUrl = await uploadConditionPhotoFile(admin, sellerId, fileField);
            return {
              ...row,
              condition_photo_url: uploadedPhotoUrl,
            };
          })
        );

        return item;
      }

      const fileField = resolveConditionPhotoFile(formData, itemIndex);
      if (!fileField) {
        return item;
      }

      const uploadedPhotoUrl = await uploadConditionPhotoFile(admin, sellerId, fileField);
      return {
        ...item,
        condition_photo_url: uploadedPhotoUrl,
      };
    })
  );

  if (Array.isArray(payload)) {
    return itemsWithFiles;
  }

  if (singleItemPayload) {
    return itemsWithFiles[0] ?? payload;
  }

  if (isRecord(payload) && Array.isArray(payload.items)) {
    return {
      ...payload,
      items: itemsWithFiles,
    };
  }

  return payload;
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
