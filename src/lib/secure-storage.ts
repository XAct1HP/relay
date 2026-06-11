import "server-only";

const STORAGE_REF_PREFIX = "storage:";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

export function buildStorageObjectRef(bucket: string, path: string) {
  return `${STORAGE_REF_PREFIX}${bucket}:${path}`;
}

export function isStorageObjectRef(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(STORAGE_REF_PREFIX);
}

export function parseStorageObjectRef(value: string | null | undefined) {
  if (!isStorageObjectRef(value)) {
    return null;
  }

  const remainder = value.slice(STORAGE_REF_PREFIX.length);
  const delimiterIndex = remainder.indexOf(":");
  if (delimiterIndex <= 0) {
    return null;
  }

  const bucket = remainder.slice(0, delimiterIndex);
  const path = remainder.slice(delimiterIndex + 1);
  if (!bucket || !path) {
    return null;
  }

  return { bucket, path };
}

export async function createSignedStorageUrl(
  adminClient: SupabaseAdminClient,
  ref: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
) {
  const parsed = parseStorageObjectRef(ref);
  if (!parsed) {
    return ref;
  }

  const { data, error } = await adminClient.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error("Failed to sign storage object:", error);
    return null;
  }

  return data.signedUrl;
}

export async function resolveSignedMediaValue(
  adminClient: SupabaseAdminClient,
  value: string | null | undefined,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
) {
  if (!value) {
    return null;
  }

  if (!isStorageObjectRef(value)) {
    return value;
  }

  return createSignedStorageUrl(adminClient, value, expiresInSeconds);
}

export async function resolveSignedMediaList(
  adminClient: SupabaseAdminClient,
  values: string[] | null | undefined,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const signed = await Promise.all(
    values.map((value) => resolveSignedMediaValue(adminClient, value, expiresInSeconds))
  );

  return signed.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function sanitizeUploadedFileName(fileName: string, fallbackExtension = "jpg") {
  const trimmed = fileName.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9._-]/g, "-");
  if (!sanitized) {
    return `file.${fallbackExtension}`;
  }

  return sanitized;
}

export function assertStorageObjectRefForOrder(
  value: string | null | undefined,
  input: {
    bucket: string;
    orderId: string;
    allowedPrefixes: string[];
  }
) {
  const parsed = parseStorageObjectRef(value);
  if (!parsed) {
    throw new Error("A secure uploaded file reference is required");
  }

  if (parsed.bucket !== input.bucket) {
    throw new Error("Uploaded file bucket is invalid");
  }

  if (!parsed.path.startsWith(`${input.orderId}/`)) {
    throw new Error("Uploaded file does not belong to this order");
  }

  if (!input.allowedPrefixes.some((prefix) => parsed.path.startsWith(`${input.orderId}/${prefix}`))) {
    throw new Error("Uploaded file path is invalid for this submission");
  }

  return parsed;
}
