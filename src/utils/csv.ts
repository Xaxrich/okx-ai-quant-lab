import { writeFileSync } from "fs";

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function writeCsv(path: string, rows: (string | number | null | undefined)[][]): void {
  const lines = rows.map(row => row.map(csvEscape).join(","));
  writeFileSync(path, lines.join("\n"));
}
