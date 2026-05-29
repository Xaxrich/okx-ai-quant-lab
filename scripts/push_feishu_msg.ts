import { readFileSync } from "fs";
import { sendFeishuText, sanitizeMessage, isFeishuEnabled, isDryRun } from "../src/integrations/feishu/feishu_client.js";

const file = process.argv[2] || "data/altcoin/intelligence/lab/live/feishu_enhanced_1.txt";
const msg = readFileSync(file, "utf-8");
const s = sanitizeMessage(msg);
console.log("Clean:", s.clean, "Enabled:", isFeishuEnabled(), "Dry:", isDryRun());

if (s.clean && isFeishuEnabled() && !isDryRun()) {
  const r = await sendFeishuText(process.env.FEISHU_CHAT_ID || "", msg);
  console.log(r.ok ? `Sent! msgId=${r.msgId}` : `Fail: ${r.error || r.status}`);
} else {
  console.log("Skip:", s.violations?.join(", ") || "disabled");
}
