import { execFileSync } from "child_process";

export interface HttpTextResponse {
  status: number;
  text: string;
  headers: Record<string, string>;
  fallbackUsed: boolean;
}

export interface HttpJsonResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Record<string, string>;
  fallbackUsed: boolean;
}

export interface HttpCompatResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  fallbackUsed: boolean;
  text(): Promise<string>;
  json(): Promise<any>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return headersToRecord(headers);
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return { ...headers };
}

function shouldFallback(err: unknown): boolean {
  if (process.platform !== "win32") return false;
  const message = err instanceof Error ? `${err.message} ${(err as any).cause?.message || ""} ${(err as any).cause?.code || ""}` : String(err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(message);
}

export async function fetchTextWithFallback(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<HttpTextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return {
      status: response.status,
      text: await response.text(),
      headers: headersToRecord(response.headers),
      fallbackUsed: false,
    };
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    return powershellRequest(url, init, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonWithFallback(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<HttpJsonResponse> {
  const response = await fetchTextWithFallback(url, init, timeoutMs);
  let body: unknown = null;
  try {
    body = response.text ? JSON.parse(response.text) : null;
  } catch {
    body = response.text;
  }
  return { ...response, body };
}

export async function fetchJsonData<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<{ status: number; data: T | null; text: string; fallbackUsed: boolean }> {
  const response = await fetchJsonWithFallback(url, init, timeoutMs);
  return {
    status: response.status,
    data: response.body as T,
    text: response.text,
    fallbackUsed: response.fallbackUsed,
  };
}

export async function fetchCompatWithFallback(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<HttpCompatResponse> {
  const response = await fetchTextWithFallback(url, init, timeoutMs);
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    headers: response.headers,
    fallbackUsed: response.fallbackUsed,
    text: async () => response.text,
    json: async () => response.text ? JSON.parse(response.text) : null,
  };
}

function powershellRequest(url: string, init: RequestInit, timeoutMs: number): HttpTextResponse {
  const method = (init.method || "GET").toUpperCase();
  const headers = normalizeHeaders(init.headers);
  const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000));
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Net.Http",
    "$headersObj = if ($env:HTTP_HEADERS_JSON) { $env:HTTP_HEADERS_JSON | ConvertFrom-Json } else { $null }",
    "$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($env:HTTP_METHOD), $env:HTTP_URL)",
    "$contentType = ''",
    "if ($headersObj) {",
    "  foreach ($p in $headersObj.PSObject.Properties) {",
    "    if ($p.Name -ieq 'Content-Type') { $contentType = [string]$p.Value }",
    "    else { [void]$request.Headers.TryAddWithoutValidation($p.Name, [string]$p.Value) }",
    "  }",
    "}",
    "if ($env:HTTP_BODY -ne '') {",
    "  if ($contentType -eq '') { $contentType = 'application/json; charset=utf-8' }",
    "  $request.Content = [System.Net.Http.StringContent]::new($env:HTTP_BODY, [System.Text.Encoding]::UTF8)",
    "  $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($contentType)",
    "}",
    "$client = [System.Net.Http.HttpClient]::new()",
    "$client.Timeout = [TimeSpan]::FromSeconds([int]$env:HTTP_TIMEOUT_SEC)",
    "try {",
    "  $response = $client.SendAsync($request).GetAwaiter().GetResult()",
    "  $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()",
    "  $ct = ''",
    "  if ($response.Content.Headers.ContentType) { $ct = [string]$response.Content.Headers.ContentType }",
    "  $retry = ''",
    "  if ($response.Headers.RetryAfter) { $retry = [string]$response.Headers.RetryAfter }",
    "  @{ status = [int]$response.StatusCode; text = $text; contentType = $ct; retryAfter = $retry; error = '' } | ConvertTo-Json -Compress",
    "} catch {",
    "  @{ status = 0; text = ''; contentType = ''; retryAfter = ''; error = $_.Exception.Message } | ConvertTo-Json -Compress",
    "} finally {",
    "  $client.Dispose()",
    "  $request.Dispose()",
    "}",
  ].join("\n");

  let raw: string;
  try {
    raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf-8",
      env: {
        ...process.env,
        HTTP_URL: url,
        HTTP_METHOD: method,
        HTTP_HEADERS_JSON: JSON.stringify(headers),
        HTTP_BODY: body,
        HTTP_TIMEOUT_SEC: String(timeoutSec),
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: Math.max(timeoutMs + 30_000, 60_000),
    }).trim();
  } catch (err) {
    const stderr = String((err as any).stderr || "").trim();
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PowerShell HTTP fallback failed: ${stderr || message}`);
  }
  const parsed = JSON.parse(raw) as { status?: unknown; text?: unknown; contentType?: unknown; retryAfter?: unknown; error?: unknown };
  const status = Number(parsed.status || 0);
  if (status === 0) throw new Error(String(parsed.error || "PowerShell HTTP fallback failed"));
  const headersOut: Record<string, string> = {};
  if (parsed.contentType) headersOut["content-type"] = String(parsed.contentType);
  if (parsed.retryAfter) headersOut["retry-after"] = String(parsed.retryAfter);
  return {
    status,
    text: String(parsed.text || ""),
    headers: headersOut,
    fallbackUsed: true,
  };
}
