export function readSanitizedEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  return trimmed.replace(/(?:\\n|\r?\n)+$/g, '').trim() || undefined;
}

export function readSanitizedEnvNumber(name: string, fallback: number): number {
  const raw = readSanitizedEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
