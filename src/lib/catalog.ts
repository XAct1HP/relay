import { normalizeSku } from "@/lib/listings";

export interface CatalogProductSeed {
  sku: string;
  normalizedSku: string;
  brand: string;
  model: string;
  nickname: string;
  description: string;
  images: string[];
  source: "placeholder";
}

const BRAND_GUESSES: Array<{ prefixes: string[]; brand: string }> = [
  { prefixes: ["DZ", "DQ", "FD", "FQ", "FV", "HF", "DR", "DH", "DJ", "DD", "CT", "CW", "DV", "DM", "DX", "FB", "FN", "FZ"], brand: "Nike" },
  { prefixes: ["GX", "GY", "HQ", "HP", "IE", "IG", "ID", "IF", "JI"], brand: "Adidas" },
  { prefixes: ["BB", "M", "U"], brand: "New Balance" },
  { prefixes: ["VN"], brand: "Vans" },
  { prefixes: ["CN"], brand: "Converse" },
];

export async function getCatalogProductSeed(rawSku: string): Promise<CatalogProductSeed | null> {
  const normalizedSku = normalizeSku(rawSku);

  if (!normalizedSku) {
    return null;
  }

  const brand = guessBrandFromSku(normalizedSku);
  const formattedSku = formatSkuForDisplay(rawSku, normalizedSku);

  return {
    sku: formattedSku,
    normalizedSku,
    brand,
    model: `${brand} Catalog Item`,
    nickname: formattedSku,
    description: `Catalog placeholder for SKU ${formattedSku}. Replace this helper with a real catalog lookup to hydrate official product title, description, and images later.`,
    images: [],
    source: "placeholder",
  };
}

function guessBrandFromSku(normalizedSku: string): string {
  for (const rule of BRAND_GUESSES) {
    if (rule.prefixes.some((prefix) => normalizedSku.startsWith(prefix))) {
      return rule.brand;
    }
  }

  return "Catalog Sneaker";
}

function formatSkuForDisplay(rawSku: string, normalizedSku: string): string {
  const trimmed = rawSku.trim();
  if (trimmed) {
    return trimmed.toUpperCase();
  }

  if (normalizedSku.length === 9) {
    return `${normalizedSku.slice(0, 6)}-${normalizedSku.slice(6)}`;
  }

  return normalizedSku;
}
