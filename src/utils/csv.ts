import { writeFileSync, readFileSync, existsSync } from "fs";

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function readCsv(path: string): { h: string[]; rows: string[][] } | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf-8").trim();
  if (!text) return null;
  const lines = text.split("\n");
  if (lines.length < 2) return null;
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = false; }
        } else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { result.push(current); current = ""; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  };
  return { h: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

export function writeCsv(path: string, rows: (string | number | null | undefined)[][]): void {
  const lines = rows.map(row => row.map(csvEscape).join(","));
  writeFileSync(path, lines.join("\n"));
}
