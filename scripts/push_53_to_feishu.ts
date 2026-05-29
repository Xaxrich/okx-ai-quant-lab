import { sendFeishuText } from "../src/integrations/feishu/feishu_client.js";
import { readFileSync } from "fs";

const fn = process.argv[2] || "feishu_enhanced_53.txt";
const text = readFileSync(`data/altcoin/intelligence/lab/live/${fn}`, "utf8");
const chatId = process.env.FEISHU_CHAT_ID || "";
console.log(`Pushing ${fn} to Feishu (${text.length} chars)...`);
const r = await sendFeishuText(chatId, text);
console.log(JSON.stringify(r));
