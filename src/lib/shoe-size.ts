export type ShoeSizeSystem =
  | "us"
  | "us_men"
  | "us_women"
  | "eu"
  | "unknown";

export interface ParsedShoeSize {
  raw: string;
  normalized_label: string;
  identity_key: string;
  system: ShoeSizeSystem;
  numeric_value: number | null;
  approx_us_men: number | null;
  approx_us_women: number | null;
  inferred: boolean;
}

const EU_TO_US_MEN_APPROX: Array<[number, number]> = [
  [35.5, 3.5],
  [36, 4],
  [36.5, 4.5],
  [37.5, 5],
  [38, 5.5],
  [38.5, 6],
  [39, 6.5],
  [40, 7],
  [40.5, 7.5],
  [41, 8],
  [42, 8.5],
  [42.5, 9],
  [43, 9.5],
  [44, 10],
  [44.5, 10.5],
  [45, 11],
  [45.5, 11.5],
  [46, 12],
  [47, 12.5],
  [47.5, 13],
  [48, 13.5],
  [48.5, 14],
  [49, 14.5],
  [49.5, 15],
  [50.5, 16],
];

export function parseShoeSize(rawValue: string | null | undefined): ParsedShoeSize {
  const raw = String(rawValue || "")
    .replace(/\u00A0/g, " ")
    .trim();

  if (!raw) {
    return {
      raw: "",
      normalized_label: "",
      identity_key: "UNKNOWN",
      system: "unknown",
      numeric_value: null,
      approx_us_men: null,
      approx_us_women: null,
      inferred: false,
    };
  }

  const upper = raw
    .toUpperCase()
    .replace(/WOMEN'?S/g, "W")
    .replace(/WMNS/g, "W")
    .replace(/MEN'?S/g, "M")
    .replace(/MENS/g, "M")
    .replace(/EUROPEAN/g, "EU")
    .replace(/EUR/g, "EU")
    .replace(/\s+/g, " ")
    .trim();

  const explicitEu = /\bEU\b/.test(upper);
  const explicitWomen =
    /(^|\s)W\s*\d/.test(upper) ||
    /\d(?:\.\d+)?\s*W$/.test(upper);
  const explicitMen =
    /(^|\s)M\s*\d/.test(upper) ||
    /\d(?:\.\d+)?\s*M$/.test(upper);
  const numericValue = extractShoeSizeNumber(upper);

  let system: ShoeSizeSystem = "unknown";
  let inferred = false;

  if (explicitEu) {
    system = "eu";
  } else if (explicitWomen) {
    system = "us_women";
  } else if (explicitMen) {
    system = "us_men";
  } else if (numericValue !== null && numericValue >= 20 && numericValue <= 55) {
    system = "eu";
    inferred = true;
  } else if (numericValue !== null && numericValue > 0 && numericValue <= 20) {
    system = "us";
  }

  const normalizedLabel = buildNormalizedShoeSizeLabel(upper, system, numericValue);
  const approxUsMen = deriveApproxUsMen(system, numericValue);
  const approxUsWomen =
    approxUsMen !== null ? Number((approxUsMen + 1.5).toFixed(1)) : null;

  return {
    raw,
    normalized_label: normalizedLabel,
    identity_key: buildShoeSizeIdentityKeyFromParsed({
      normalized_label: normalizedLabel,
      system,
      numeric_value: numericValue,
      approx_us_men: approxUsMen,
    }),
    system,
    numeric_value: numericValue,
    approx_us_men: approxUsMen,
    approx_us_women: approxUsWomen,
    inferred,
  };
}

export function getShoeSizeIdentityKey(rawValue: string | null | undefined): string {
  return parseShoeSize(rawValue).identity_key;
}

export function compareShoeSizeLabels(left: string, right: string): number {
  const parsedLeft = parseShoeSize(left);
  const parsedRight = parseShoeSize(right);

  if (
    parsedLeft.system === parsedRight.system &&
    parsedLeft.numeric_value !== null &&
    parsedRight.numeric_value !== null &&
    parsedLeft.numeric_value !== parsedRight.numeric_value
  ) {
    return parsedLeft.numeric_value - parsedRight.numeric_value;
  }

  if (
    parsedLeft.approx_us_men !== null &&
    parsedRight.approx_us_men !== null &&
    parsedLeft.approx_us_men !== parsedRight.approx_us_men
  ) {
    return parsedLeft.approx_us_men - parsedRight.approx_us_men;
  }

  const systemCompare = getSystemRank(parsedLeft.system) - getSystemRank(parsedRight.system);
  if (systemCompare !== 0) {
    return systemCompare;
  }

  return parsedLeft.normalized_label.localeCompare(parsedRight.normalized_label, undefined, {
    numeric: true,
  });
}

export function getShoeSizeMatchScore(targetSize: string, candidateSize: string): number {
  const target = parseShoeSize(targetSize);
  const candidate = parseShoeSize(candidateSize);

  if (!target.normalized_label || !candidate.normalized_label) {
    return 0;
  }

  if (target.normalized_label === candidate.normalized_label) {
    return 100;
  }

  if (
    target.identity_key === candidate.identity_key &&
    target.identity_key !== "UNKNOWN"
  ) {
    return 96;
  }

  if (
    target.system === candidate.system &&
    target.numeric_value !== null &&
    candidate.numeric_value !== null &&
    Math.abs(target.numeric_value - candidate.numeric_value) < 0.001
  ) {
    return 92;
  }

  if (
    target.approx_us_men !== null &&
    candidate.approx_us_men !== null &&
    Math.abs(target.approx_us_men - candidate.approx_us_men) < 0.001
  ) {
    return 84;
  }

  if (
    target.approx_us_men !== null &&
    candidate.approx_us_men !== null &&
    Math.abs(target.approx_us_men - candidate.approx_us_men) <= 0.5 &&
    (target.system === "eu" || candidate.system === "eu")
  ) {
    return 70;
  }

  return 0;
}

export function buildShoeSizeWarning(rawValue: string | null | undefined): string | null {
  const parsed = parseShoeSize(rawValue);
  if (!parsed.raw || !parsed.normalized_label) {
    return null;
  }

  if (parsed.inferred && parsed.system === "eu") {
    return `Size ${parsed.raw} was interpreted as ${parsed.normalized_label}.`;
  }

  const normalizedRaw = parsed.raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (normalizedRaw !== parsed.normalized_label) {
    return `Size ${parsed.raw} was normalized to ${parsed.normalized_label}.`;
  }

  return null;
}

function buildNormalizedShoeSizeLabel(
  upper: string,
  system: ShoeSizeSystem,
  numericValue: number | null
): string {
  if (numericValue === null) {
    return upper;
  }

  const formattedNumber = formatSizeNumber(numericValue);
  if (system === "eu") {
    return `EU ${formattedNumber}`;
  }

  if (system === "us_women") {
    return `W ${formattedNumber}`;
  }

  if (system === "us_men") {
    return `M ${formattedNumber}`;
  }

  return formattedNumber;
}

function buildShoeSizeIdentityKeyFromParsed(input: {
  normalized_label: string;
  system: ShoeSizeSystem;
  numeric_value: number | null;
  approx_us_men: number | null;
}): string {
  if (!input.normalized_label) {
    return "UNKNOWN";
  }

  if (input.system === "eu" && input.numeric_value !== null) {
    return `EU:${formatSizeNumber(input.numeric_value)}`;
  }

  if (input.system === "us_women" && input.numeric_value !== null) {
    return `USW:${formatSizeNumber(input.numeric_value)}`;
  }

  if (
    (input.system === "us" || input.system === "us_men") &&
    input.approx_us_men !== null
  ) {
    return `US:${formatSizeNumber(input.approx_us_men)}`;
  }

  return `LABEL:${input.normalized_label}`;
}

function deriveApproxUsMen(
  system: ShoeSizeSystem,
  numericValue: number | null
): number | null {
  if (numericValue === null) {
    return null;
  }

  if (system === "us" || system === "us_men") {
    return numericValue;
  }

  if (system === "us_women") {
    return Number((numericValue - 1.5).toFixed(1));
  }

  if (system === "eu") {
    return convertEuToApproxUsMen(numericValue);
  }

  return null;
}

function convertEuToApproxUsMen(euSize: number): number | null {
  let bestMatch: [number, number] | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of EU_TO_US_MEN_APPROX) {
    const distance = Math.abs(candidate[0] - euSize);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      bestMatch = candidate;
    }
  }

  if (!bestMatch || smallestDistance > 0.76) {
    return null;
  }

  return bestMatch[1];
}

function extractShoeSizeNumber(value: string): number | null {
  const normalized = value
    .replace(/1\/3/g, ".33")
    .replace(/2\/3/g, ".67");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSizeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function getSystemRank(system: ShoeSizeSystem): number {
  if (system === "us" || system === "us_men") {
    return 0;
  }
  if (system === "us_women") {
    return 1;
  }
  if (system === "eu") {
    return 2;
  }
  return 3;
}
