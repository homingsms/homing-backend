export function matchOptOut(text: string | null | undefined, keywords: readonly string[]): string | null {
  if (!text) {
    return null;
  }
  const normalized = text.trim().replace(/[.!]+$/, '').toUpperCase();
  return keywords.find((keyword) => keyword.toUpperCase() === normalized) ?? null;
}
