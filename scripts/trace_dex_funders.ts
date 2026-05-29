// Trace DEX trader funding sources to detect bot networks
import { fetchCompatWithFallback as fetch } from "../src/utils/http.js";

const MORALIS_KEY = process.env.MORALIS_API_KEY || "";
const LAB = "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A";
const DEX = "0x085f29091ee8a818ede960a89bd578fe4ac8e824";
const BASE = "https://deep-index.moralis.io/api/v2.2";

async function get(url: string) {
  const r = await fetch(BASE + url, { headers: { "X-API-Key": MORALIS_KEY, Accept: "application/json" } });
  return r.json();
}

async function main() {
  console.log("=== DEX 资金来源追踪 ===\n");

  // Get recent transfers, extract DEX sellers
  console.log("获取转账记录...");
  const txs: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 3; i++) {
    const data = await get(`/erc20/${LAB}/transfers?chain=bsc&limit=200&order=DESC${cursor ? "&cursor=" + cursor : ""}`);
    txs.push(...(data.result || []));
    cursor = data.cursor;
    if ((data.result || []).length < 200) break;
  }
  console.log(`总转账: ${txs.length}`);

  // DEX sellers
  const sellers = new Map<string, number>();
  for (const t of txs) {
    if (t.to_address?.toLowerCase() === DEX.toLowerCase()) {
      const addr = t.from_address?.toLowerCase();
      sellers.set(addr, (sellers.get(addr) || 0) + parseFloat(t.value_decimal || "0"));
    }
  }
  console.log(`DEX卖家: ${sellers.size}个地址`);

  const topSellers = [...sellers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  console.log("\n── 资金来源追踪 ──");
  const funderMap = new Map<string, string[]>();

  for (const [addr, vol] of topSellers) {
    try {
      const data = await get(`/erc20/${LAB}/transfers?chain=bsc&limit=5&order=ASC&to_address=${addr}`);
      const results = data.result || [];
      const firstReceive = results[0];

      if (firstReceive) {
        const funder = firstReceive.from_address;
        const entity = firstReceive.from_address_entity || firstReceive.from_address_label || "未知";
        const amount = firstReceive.value_decimal;
        const time = (firstReceive.block_timestamp || "").slice(0, 10);
        console.log(`${addr.slice(0, 8)}...(卖$${vol.toFixed(0)})`);
        console.log(`  ← ${funder.slice(0, 10)} [${entity}] $${amount} (${time})`);

        const fk = funder.toLowerCase();
        const list = funderMap.get(fk) || [];
        list.push(addr);
        funderMap.set(fk, list);
      } else {
        console.log(`${addr.slice(0, 8)}...(卖$${vol.toFixed(0)}) ← 无历史`);
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 250));
  }

  console.log("\n── 共享资金来源 ──");
  let found = false;
  for (const [funder, addrs] of funderMap) {
    if (addrs.length >= 2) {
      found = true;
      console.log(`⚠️ ${funder.slice(0, 12)} → ${addrs.length}个DEX地址`);
      addrs.forEach(a => console.log(`   └ ${a.slice(0, 12)}`));
    }
  }
  if (!found) console.log("✅ 未发现共享来源（${topSellers.length}个样本中）");

  // Also check: are these addresses new or old?
  console.log("\n── 地址年龄分析 ──");
  for (const [addr] of topSellers.slice(0, 5)) {
    try {
      const data = await get(`/erc20/${LAB}/transfers?chain=bsc&limit=1&order=ASC&to_address=${addr}`);
      const first = (data.result || [])[0];
      if (first) {
        const age = first.block_timestamp?.slice(0, 10);
        console.log(`${addr.slice(0, 8)}... 首次收LAB: ${age}`);
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 250));
  }
}

main().catch(console.error);
