export function normalizeSku(input?: string | null): string {
  if (!input) {
    return "";
  }

  return input
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}
