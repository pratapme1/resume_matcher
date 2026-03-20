export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function sanitizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#./ -]/g, '').trim();
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeSectionTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

export function tokenizeText(text: string): string[] {
  return sanitizeKeyword(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
