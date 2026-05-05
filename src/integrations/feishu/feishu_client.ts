const APP_ID = process.env.FEISHU_APP_ID || "";
const APP_SECRET = process.env.FEISHU_APP_SECRET || "";
const FEISHU_DOMAIN = process.env.FEISHU_DOMAIN || "https://open.feishu.cn";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export function isFeishuEnabled(): boolean {
  return process.env.FEISHU_ENABLED === "true" && APP_ID.length > 0 && APP_SECRET.length > 0;
}

export function getChatIdMasked(): string {
  const chatId = process.env.FEISHU_CHAT_ID || "";
  if (chatId.length <= 6) return "***";
  return chatId.slice(0, 6) + "***" + chatId.slice(-4);
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  try {
    const r = await fetch(`${FEISHU_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const j = await r.json();
    if (j.code === 0 && j.tenant_access_token) {
      cachedToken = j.tenant_access_token;
      tokenExpiresAt = Date.now() + j.expire * 1000;
      return cachedToken;
    }
    console.error(`Feishu auth failed: ${j.code} ${j.msg}`);
  } catch (e: any) { console.error(`Feishu auth error: ${e.message}`); }
  return null;
}

export async function sendFeishuText(chatId: string, text: string): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const token = await getToken();
  if (!token) return { ok: false, error: "No auth token" };
  try {
    const r = await fetch(`${FEISHU_DOMAIN}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) }),
    });
    const j = await r.json();
    if (j.code === 0) return { ok: true, msgId: j.data?.message_id };
    return { ok: false, error: `Feishu API error: ${j.code} ${j.msg}` };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

const FORBIDDEN_TOKENS = [
  "should buy", "should sell", "should short", "should long",
  "recommend buy", "recommend sell", "recommend short",
  "entry point", "exit point", "entry price", "exit price",
  "stop loss", "stop-loss", "take profit", "take-profit",
  "position size", "leverage ratio",
  "target price", "win rate",
  "suggest buying", "suggest selling",
  "signal to trade", "trading signal",
  "open short", "open long",
  "place order", "set stop",
];

export function sanitizeMessage(text: string): { clean: boolean; text: string; violations: string[] } {
  const violations: string[] = [];
  const upper = text.toUpperCase();
  for (const tok of FORBIDDEN_TOKENS) {
    if (upper.includes(tok.toUpperCase())) {
      violations.push(tok);
    }
  }
  if (violations.length > 0) {
    return { clean: false, text, violations };
  }
  return { clean: true, text, violations: [] };
}

export function isDryRun(): boolean {
  return process.env.FEISHU_ENABLED !== "true";
}
