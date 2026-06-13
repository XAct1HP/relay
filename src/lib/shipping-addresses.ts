import type { ShippingAddress } from "@/types";

type AddressLike = Partial<ShippingAddress> & {
  street1?: string | null;
  line1?: string | null;
  line2?: string | null;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = readString(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function normalizeShippingAddress(value: unknown): ShippingAddress | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const address = value as AddressLike;
  const normalized: ShippingAddress = {
    name: firstNonEmpty(address.name),
    street: firstNonEmpty(address.street, address.street1, address.line1),
    street2: firstNonEmpty(address.street2, address.line2) || undefined,
    city: firstNonEmpty(address.city),
    state: firstNonEmpty(address.state),
    zip: firstNonEmpty(address.zip),
    country: firstNonEmpty(address.country) || "US",
  };

  const hasMeaningfulAddress =
    normalized.name ||
    normalized.street ||
    normalized.city ||
    normalized.state ||
    normalized.zip;

  return hasMeaningfulAddress ? normalized : null;
}

export function toShippoAddress(value: unknown) {
  const address = normalizeShippingAddress(value);
  if (!address) {
    return null;
  }

  return {
    name: address.name,
    street1: address.street,
    street2: address.street2 || "",
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country || "US",
  };
}
