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

const BENIGN_STDERR_PATTERNS = [
  /^Update available for @okx_ai\/okx-trade-cli: .+$/i,
  /^Run: npm install -g @okx_ai\/okx-trade-cli$/i,
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

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function actionableStderr(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const plain = stripAnsi(line);
      return !BENIGN_STDERR_PATTERNS.some((pattern) => pattern.test(plain));
    })
    .join("\n");
}

function quoteCmdArg(arg: string): string {
  if (/^[A-Za-z0-9_/:=.,@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["^&|<>%])/g, "^$1")}"`;
}

export async function okx(args: string[]): Promise<OkxCliResult> {
  const okxCmd = "okx";
  const cmd = process.platform === "win32" ? "cmd.exe" : okxCmd;
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [okxCmd, ...args].map(quoteCmdArg).join(" ")]
    : args;
  const sanitizedCmd = `${okxCmd} ${sanitizeForLog(args)}`;

  return new Promise((resolve) => {
    const child = spawn(cmd, spawnArgs, {
      stdio: ["ignore", "pipe", "pipe"],
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
      const filteredStderr = actionableStderr(stderr);
      if (exitCode !== 0 || filteredStderr) {
        resolve({
          ok: false,
          data: null,
          stderr: filteredStderr || stderr.trim(),
          exitCode,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          ok: true,
          data: parsed,
          stderr: filteredStderr,
          exitCode,
        });
      } catch {
        resolve({
          ok: true,
          data: stdout.trim(),
          stderr: filteredStderr,
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
