import { randomBytes } from "crypto";

const PREFIX = "okxql";

export function generateClOrdId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(6).toString("hex");
  return `${PREFIX}${date}${random}`;
}

export function validateClOrdId(id: string): boolean {
  const pattern = new RegExp(`^${PREFIX}\\d{8}[0-9a-f]{12}$`);
  return pattern.test(id) && id.length <= 32;
}

export function parseClOrdId(id: string): { prefix: string; date: string; random: string } | null {
  if (!validateClOrdId(id)) return null;
  return {
    prefix: id.slice(0, PREFIX.length),
    date: id.slice(PREFIX.length, PREFIX.length + 8),
    random: id.slice(PREFIX.length + 8),
  };
}
