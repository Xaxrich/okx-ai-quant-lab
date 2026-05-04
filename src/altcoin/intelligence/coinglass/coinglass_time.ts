export function normalizeCoinGlassTimestamp(input: unknown): string | null {
  if (input === null || input === undefined) return null;

  // Already an ISO date string
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = new Date(input);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 2020 || y > 2030) return null;
    return input.slice(0, 10);
  }

  // Numeric timestamp
  const num = typeof input === "string" ? parseFloat(input) : Number(input);
  if (isNaN(num) || num <= 0) return null;

  // Auto-detect: 10 digits = seconds, 13 digits = milliseconds
  const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
  let ms: number;
  if (digits <= 10) {
    ms = num * 1000; // seconds → ms
  } else if (digits <= 13) {
    ms = num; // already milliseconds
  } else {
    return null; // invalid range
  }

  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  if (y < 2020 || y > 2030) return null;

  return d.toISOString().slice(0, 10);
}
