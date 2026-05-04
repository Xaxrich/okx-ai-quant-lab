import { spawn } from "child_process";

export interface OkxCliResult {
  ok: boolean;
  data: unknown;
  stderr: string;
  exitCode: number | null;
}

const SECRET_PATTERNS = [
  /--api-key\s+\S+/gi,
  /--secret-key\s+\S+/gi,
  /--passphrase\s+\S+/gi,
  /-k\s+\S+/gi,
  /-s\s+\S+/gi,
  /-p\s+\S+/gi,
  /api[_-]?key[=:]\s*\S+/gi,
  /secret[_-]?key[=:]\s*\S+/gi,
  /passphrase[=:]\s*\S+/gi,
];

function sanitizeForLog(args: string[]): string {
  const joined = args.join(" ");
  let sanitized = joined;
  for (const pat of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pat, (match) => {
      const prefix = match.slice(0, match.indexOf(match.match(/\S+$/)![0]));
      return prefix + "***REDACTED***";
    });
  }
  return sanitized;
}

export async function okx(args: string[]): Promise<OkxCliResult> {
  const cmd = "okx";
  const sanitizedCmd = `${cmd} ${sanitizeForLog(args)}`;

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0 || stderr.trim()) {
        resolve({
          ok: false,
          data: null,
          stderr: stderr.trim(),
          exitCode,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          ok: true,
          data: parsed,
          stderr: stderr.trim(),
          exitCode,
        });
      } catch {
        resolve({
          ok: true,
          data: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
        });
      }
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        data: null,
        stderr: err.message,
        exitCode: null,
      });
    });
  });
}

export async function okxJson(args: string[]): Promise<OkxCliResult> {
  if (!args.includes("--json")) {
    args = [...args, "--json"];
  }
  return okx(args);
}
