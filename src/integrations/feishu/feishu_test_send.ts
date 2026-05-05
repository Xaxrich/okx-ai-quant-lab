import { isFeishuEnabled, sendFeishuText, sanitizeMessage, isDryRun, getChatIdMasked } from "./feishu_client.js";

const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

async function main() {
  const dryRun = isDryRun();
  console.log(`=== Feishu Test Send ${dryRun ? "(DRY-RUN)" : "(LIVE)"} ===\n`);
  console.log(`Feishu enabled: ${process.env.FEISHU_ENABLED}`);
  console.log(`Chat ID: ${getChatIdMasked()}`);
  console.log(`App ID: ${process.env.FEISHU_APP_ID?.slice(0, 8) || "not set"}***\n`);

  if (!CHAT_ID) {
    console.log("FEISHU_CHAT_ID not set — set it in .env to send messages");
    console.log("Get chat_id: send any message in the target group, then use Feishu API to list chats");
    return;
  }

  if (!process.env.FEISHU_APP_SECRET) {
    console.log("FEISHU_APP_SECRET not set");
    return;
  }

  const testMessages = [
    {
      label: "template_fast_alert",
      text: `【LAB Fast Watch｜WATCH】
State: LAB_FAST_FUNDING_OVERHEATED
Risk: 45/100
Price: $2.49
Funding: 15.7%
OI: $394,000,000
OI Δ4h: +$40,900,000
Liq 4h: $433,000
Freshness: FRESH

Why pushed:
- risk_score crossed 30 threshold
- funding extreme at 15.7%

Manual review:
- OI rollover?
- Liquidation spike?
- Price efficiency decay?
- Funding reversing?

No trading recommendation. Cannot infer directional intent.`,
    },
    {
      label: "template_standard_brief",
      text: `【LAB 15m Intelligence Brief】
主状态：LAB_FAST_FUNDING_OVERHEATED
风险评分：45/100（WATCH）
数据新鲜度：FRESH

1. Market
- Price: $2.49
- Return 24h: +20.8%
- Price source: coingecko

2. Derivatives
- OI: $394,000,000
- OI Δ4h: +$40,900,000
- Funding: 15.7% (src: cache)
- Liq 4h: $433,000

3. Next Watch
- Funding持续高位?
- OI由正转负?
- 清算突然放大?
- 价格失去推进效率?
- CG budget充足? (剩余: 485)

No trading recommendation. Cannot infer directional intent.`,
    },
    {
      label: "forbidden_terms_test",
      text: "Test with BUY signal and SHORT entry suggestion — should be BLOCKED",
    },
  ];

  for (const tm of testMessages) {
    console.log(`\n── ${tm.label} ──`);

    const s = sanitizeMessage(tm.text);
    if (!s.clean) {
      console.log(`BLOCKED: ${s.violations.join(", ")}`);
      continue;
    }

    if (dryRun) {
      console.log("[DRY-RUN PREVIEW]");
      console.log(tm.text.slice(0, 200) + "...");
      continue;
    }

    console.log(`Sending to ${getChatIdMasked()}...`);
    const r = await sendFeishuText(CHAT_ID, tm.text);
    console.log(r.ok ? `Sent! msgId=${r.msgId}` : `Failed: ${r.error}`);
  }

  console.log("\nTest complete.");
}

main().catch(console.error);
