import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");

function readCsv(p: string) { if(!existsSync(p)) return null; const l=readFileSync(p,"utf8").trim().split("\n"); if(l.length<2) return null; return {h:l[0].split(","),rows:l.slice(1).map(x=>x.split(","))}; }
function col(r:string[],h:string[],n:string):string{const i=h.indexOf(n);return i>=0?r[i]||"":"";}
function num(r:string[],h:string[],n:string):number{const v=parseFloat(col(r,h,n));return isNaN(v)?0:v;}

interface Event {
  idx: number; ts: string; type: string; price: number; oi: number; oiChg: number; oi4h: number;
  fund: number; fundChg: number; liq: number; liqChg: number; score: number; state: string;
  evidence: string; confidence: string; freshness: string;
}

interface PathResult {
  eventIdx: number; eventType: string;
  next1_price: number; next2_price: number; next3_price: number; next6_price: number;
  next1_oi: number; next3_oi: number; next6_oi: number;
  adverse_move: number; favorable_move: number; follow_through: boolean; reversal: boolean;
  path_vol: number; max_dd: number; max_rebound: number;
}

function detectEvents(data: {h:string[],rows:string[][]}): Event[] {
  const h=data.h, rows=data.rows; if(rows.length<3) return [];
  const events: Event[] = [];
  for(let i=2;i<rows.length;i++){
    const r=rows[i], p=rows[i-1], p2=rows[i-2];
    const price=num(r,h,"price_usd"), oi=num(r,h,"coinglass_oi_usd"), oiChg=num(r,h,"oi_change_from_prev");
    const oi4h=num(r,h,"oi_change_4h"), fund=num(r,h,"funding_rate_percent"), fundChg=num(r,h,"funding_change_from_prev");
    const liq=num(r,h,"liq_4h"), liqChg=num(r,h,"liq_change_from_prev"), liqUp=num(r,h,"liq_upward"), liqDown=num(r,h,"liq_downward");
    const score=num(r,h,"risk_score"), state=col(r,h,"fast_watch_state"), fresh=col(r,h,"data_freshness"), ts=col(r,h,"timestamp")?.slice(11,19)||"";

    const prevPrice=num(p,h,"price_usd"), prevOI=num(p,h,"coinglass_oi_usd"), prevFund=num(p,h,"funding_rate_percent"), prevLiq=num(p,h,"liq_4h");
    const p2Fund=num(p2,h,"funding_rate_percent");

    const oiDrop=oiChg<0, oiBigDrop=oiChg<-10e6, oiAccel=oiChg>5e6;
    const fundRising=fundChg>0.3, fundDropping=fundChg<-0.5, fundExtreme=fund>=15, fundCooling=fund<prevFund&&fund>5;
    const liqSpike=liqChg>3e5, liqReset=liqChg<-3e5, liqHigh=liq>1e6, liqVeryHigh=liq>2e6;
    const priceDown=price<prevPrice, priceUp=price>prevPrice;
    const scoreUp=score>num(p,h,"risk_score")+4, scoreDown=score<num(p,h,"risk_score")-4;

    // E1: Funding extreme up
    if(fundExtreme&&!fundCooling&&fund>=prevFund){events.push({idx:i,ts,type:"FUNDING_EXTREME_UP",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`funding ${fund.toFixed(1)}% extreme`,confidence:fund>=17?"HIGH":"MEDIUM",freshness:fresh});}
    // E2: Funding cooling
    if(fundDropping&&fundCooling&&prevFund>10){events.push({idx:i,ts,type:"FUNDING_COOLING",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`funding ${prevFund.toFixed(1)}→${fund.toFixed(1)}%`,confidence:fundChg<-1?"HIGH":"MEDIUM",freshness:fresh});}
    // E3: OI acceleration
    if(oiAccel&&!oiDrop){events.push({idx:i,ts,type:"OI_ACCELERATION",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`OI +$${(oiChg/1e6).toFixed(1)}M`,confidence:oiChg>10e6?"HIGH":"MEDIUM",freshness:fresh});}
    // E4: OI rollover
    if(oiBigDrop||(oiDrop&&num(p,h,"oi_change_from_prev")<0)){events.push({idx:i,ts,type:"OI_ROLLOVER",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`OI -$${(Math.abs(oiChg)/1e6).toFixed(1)}M${oiDrop&&num(p,h,"oi_change_from_prev")<0?" (连续)":""}`,confidence:oiBigDrop?"HIGH":"MEDIUM",freshness:fresh});}
    // E5: Liquidation expansion
    if(liqSpike||liqHigh){events.push({idx:i,ts,type:"LIQUIDATION_EXPANSION",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`liq $${(liq/1e3).toFixed(0)}K${liqSpike?" +$"+(liqChg/1e3).toFixed(0)+"K":""}`,confidence:liqVeryHigh?"HIGH":liqHigh?"MEDIUM":"LOW",freshness:fresh});}
    // E6: Liquidation reset
    if(liqReset&&prevLiq>1e6){events.push({idx:i,ts,type:"LIQUIDATION_RESET",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`liq $${(prevLiq/1e3).toFixed(0)}→$${(liq/1e3).toFixed(0)}K`,confidence:"HIGH",freshness:fresh});}
    // E7: Price+OI both down
    if(priceDown&&oiDrop){events.push({idx:i,ts,type:"PRICE_OI_BOTH_DOWN",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`price ${prevPrice.toFixed(2)}→${price.toFixed(2)} OI -$${(Math.abs(oiChg)/1e6).toFixed(1)}M`,confidence:"HIGH",freshness:fresh});}
    // E8: Price up + liq high (squeeze/rebound)
    if(priceUp&&liqHigh){events.push({idx:i,ts,type:"SQUEEZE_REBOUND",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`price +$${(price-prevPrice).toFixed(2)} liq $${(liq/1e3).toFixed(0)}K`,confidence:"MEDIUM",freshness:fresh});}
    // E9/E10: Risk score cross
    const prevScore=num(p,h,"risk_score");
    if(scoreUp&&(prevScore<30&&score>=30||prevScore<50&&score>=50||prevScore<70&&score>=70)){events.push({idx:i,ts,type:"RISK_SCORE_UPGRADE",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`${prevScore}→${score}`,confidence:"HIGH",freshness:fresh});}
    if(scoreDown&&(prevScore>=70&&score<70||prevScore>=50&&score<50||prevScore>=30&&score<30)){events.push({idx:i,ts,type:"RISK_SCORE_DOWNGRADE",price,oi,oiChg,oi4h,fund,fundChg,liq,liqChg,score,state,evidence:`${prevScore}→${score}`,confidence:"HIGH",freshness:fresh});}
  }
  return events;
}

function backtestEvents(events: Event[], data: {h:string[],rows:string[][]}): PathResult[] {
  const h=data.h, rows=data.rows; const results: PathResult[] = [];
  for(const e of events){
    const get=(offset:number,field:string)=>{
      const idx=e.idx+offset; if(idx<0||idx>=rows.length) return null;
      return num(rows[idx],h,field);
    };
    const p1=get(1,"price_usd"), p2=get(2,"price_usd"), p3=get(3,"price_usd"), p6=get(6,"price_usd")||p3;
    const ePrice=e.price, n1=p1||ePrice, n2=p2||n1, n3=p3||n2, n6=p6||n3;
    const adverse=Math.min(0,(n1-ePrice)/ePrice,(n2-ePrice)/ePrice,(n3-ePrice)/ePrice);
    const favorable=Math.max(0,(n1-ePrice)/ePrice,(n2-ePrice)/ePrice,(n3-ePrice)/ePrice);
    const followThrough=(n3>n1&&n1>ePrice)||(n3<n1&&n1<ePrice);
    const reversal=(n3-ePrice)*(n1-ePrice)<0;

    const prices=[ePrice,n1,n2,n3].filter(v=>v>0);
    const vol=prices.length>1?Math.sqrt(prices.slice(1).reduce((s,v,i)=>s+(v-prices[i])**2,0)/prices.length):0;

    results.push({
      eventIdx:e.idx, eventType:e.type,
      next1_price:n1, next2_price:n2, next3_price:n3, next6_price:n6,
      next1_oi:get(1,"coinglass_oi_usd")||0, next3_oi:get(3,"coinglass_oi_usd")||0, next6_oi:get(6,"coinglass_oi_usd")||0,
      adverse_move:adverse, favorable_move:favorable, follow_through:followThrough, reversal,
      path_vol:vol, max_dd:adverse, max_rebound:favorable,
    });
  }
  return results;
}

function attributeSignals(results: PathResult[]): {name:string,samples:number,leadLag:string,confidence:string,notes:string}[] {
  const byType=new Map<string,PathResult[]>();
  for(const r of results){const l=byType.get(r.eventType)||[];l.push(r);byType.set(r.eventType,l);}
  const attrs:{name:string,samples:number,leadLag:string,confidence:string,notes:string}[]=[];
  for(const [type,rs] of byType){
    const ft=rs.filter(r=>r.follow_through).length/rs.length;
    const rev=rs.filter(r=>r.reversal).length/rs.length;
    const avgFav=rs.reduce((s,r)=>s+r.favorable_move,0)/rs.length;
    const avgAdv=rs.reduce((s,r)=>s+r.adverse_move,0)/rs.length;
    let leadLag="NOISE",conf="LOW",notes="";
    if(rs.length<2){leadLag="INSUFFICIENT_SAMPLE";conf="LOW";notes="<2 events";}
    else if(ft>0.6&&avgFav>0.02){leadLag="LEADING_CANDIDATE";conf=rs.length>=4?"MEDIUM":"LOW";notes=`follow-through ${(ft*100).toFixed(0)}%`;}
    else if(rev>0.5){leadLag="CONFIRMATION";conf="MEDIUM";notes=`reversal ${(rev*100).toFixed(0)}%`;}
    else if(Math.abs(avgFav)<0.01&&Math.abs(avgAdv)<0.01){leadLag="NOISE";conf="LOW";notes="flat path";}
    else{leadLag="LAGGING";conf="LOW";notes=`fav=${(avgFav*100).toFixed(1)}% adv=${(avgAdv*100).toFixed(1)}%`;}
    attrs.push({name:type,samples:rs.length,leadLag,confidence:conf,notes});
  }
  return attrs.sort((a,b)=>b.samples-a.samples);
}

function computeCommanderScores(events: Event[], results: PathResult[], attrs: any[], data: {h:string[],rows:string[][]}): any {
  const h=data.h, rows=data.rows; if(rows.length<3) return null;
  const latest=rows[rows.length-1];
  const price=num(latest,h,"price_usd"), oi=num(latest,h,"coinglass_oi_usd"), oiChg=num(latest,h,"oi_change_from_prev");
  const fund=num(latest,h,"funding_rate_percent"), fundChg=num(latest,h,"funding_change_from_prev");
  const liq=num(latest,h,"liq_4h"), liqChg=num(latest,h,"liq_change_from_prev");
  const score=num(latest,h,"risk_score"), state=col(latest,h,"fast_watch_state");

  // Trend continuation (0-100): price up + OI up + funding stable + liq low
  let trendScore=0;
  if(price>num(rows[rows.length-2],h,"price_usd")) trendScore+=25;
  if(oiChg>5e6) trendScore+=25; else if(oiChg>0) trendScore+=15;
  if(fund>15) trendScore-=10; else if(fund<10) trendScore+=15;
  if(liq<5e5) trendScore+=20; else if(liq<1e6) trendScore+=10;
  if(state.includes("过热")) trendScore+=10;
  trendScore=Math.max(0,Math.min(100,trendScore));

  // Reversal risk (0-100): OI dropping + funding dropping + liq rising
  let reversalScore=0;
  if(oiChg<-10e6) reversalScore+=30; else if(oiChg<0) reversalScore+=15;
  if(fundChg<-0.5) reversalScore+=25;
  if(liq>1e6) reversalScore+=20; else if(liq>5e5) reversalScore+=10;
  if(price<num(rows[rows.length-2],h,"price_usd")) reversalScore+=15;
  if(score>=50) reversalScore+=10;
  reversalScore=Math.max(0,Math.min(100,reversalScore));

  // Squeeze/rebound (0-100): liq elevated + price recovering + funding easing
  let squeezeScore=0;
  if(liq>1e6&&price>num(rows[rows.length-2],h,"price_usd")) squeezeScore+=35;
  else if(liq>5e5&&rows.length>=3&&price>num(rows[rows.length-3],h,"price_usd")) squeezeScore+=20;
  if(fundChg<-1) squeezeScore+=25;
  if(oiChg>0&&liq>1e6) squeezeScore+=20;
  if(score<40) squeezeScore+=10;
  squeezeScore=Math.max(0,Math.min(100,squeezeScore));

  // Data confidence
  const snapCount=rows.length;
  const fresh=col(latest,h,"data_freshness");
  let dataConf=snapCount>=12?60:snapCount>=6?40:20;
  if(fresh==="新鲜") dataConf+=20;
  if(fresh==="过期") dataConf-=20;
  dataConf=Math.max(0,Math.min(100,dataConf));

  // Market phase
  let phase="RANGE_EQUILIBRIUM";
  if(trendScore>50&&reversalScore<30) phase="TREND_CONTINUATION";
  else if(trendScore>30&&fund>10) phase="OVERHEATED_BUT_TRENDING";
  else if(reversalScore>40&&oiChg<0) phase="ROLLOVER_WATCH";
  else if(liq>1e6&&reversalScore>30) phase="LIQUIDATION_EXPANSION";
  else if(squeezeScore>40) phase="RESET_OR_REBOUND";
  else if(dataConf<30) phase="DATA_INSUFFICIENT";

  // Evidence
  const strongest=[], weakest=[];
  if(trendScore>=reversalScore){strongest.push(`趋势延续得分 ${trendScore}>反转 ${reversalScore}`);weakest.push(`反转风险证据较弱`);}
  else{strongest.push(`反转风险得分 ${reversalScore}>趋势 ${trendScore}`);weakest.push(`趋势信号减弱`);}
  if(oiChg>0) strongest.push(`OI 仍在上升`); else weakest.push(`OI 开始回落`);
  if(fund>15) strongest.push(`资金费率极端(多头拥挤)`);
  if(liq>1e6) strongest.push(`清算压力偏高`);

  const contradiction=`趋势得分 ${trendScore} vs 反转风险 ${reversalScore}，市场${phase}`;
  const invalidation=phase==="TREND_CONTINUATION"?`OI 转负且价格跌破支撑`:`OI 回升且清算回落`;

  // Next observations
  const nextObs=[];
  if(oiChg>0){nextObs.push(`OI 何时转负——当前 ${oiChg>=0?"+":""}$${(Math.abs(oiChg)/1e6).toFixed(1)}M`);}
  if(liq<1e6){nextObs.push(`清算何时突破 $1M——当前 $${(liq/1e3).toFixed(0)}K`);}
  if(fund>10){nextObs.push(`资金费率是否继续回落——当前 ${fund.toFixed(1)}%`);}
  if(dataConf<60){nextObs.push(`需要更多快照提升数据置信度——当前${snapCount}条`);}

  return {
    timestamp:new Date().toISOString(), market_phase:phase,
    trend_continuation_score:trendScore, reversal_risk_score:reversalScore,
    squeeze_rebound_score:squeezeScore, data_confidence_score:dataConf,
    main_scenario:phase==="TREND_CONTINUATION"?"趋势延续":phase==="ROLLOVER_WATCH"?"OI回落观察":"清算后整理",
    alternative_scenario:phase==="TREND_CONTINUATION"?"反转风险":"趋势恢复",
    invalidation_condition:invalidation,
    strongest_evidence:strongest.join("; "), weakest_evidence:weakest.join("; "),
    main_contradiction:contradiction,
    next_observation:nextObs.join(" | "),
    commander_summary:`LAB 当前处于 ${phase}。趋势${trendScore}/100，反转风险${reversalScore}/100。${strongest[0]||""}。${weakest[0]||""}。`,
  };
}

function main() {
  console.log("=== LAB 盘中情报参谋 ===\n");
  for(const d of [OUT_DIR, REPORTS_DIR]){if(!existsSync(d)) mkdirSync(d,{recursive:true});}

  const data=readCsv(join(OUT_DIR,"lab_fast_watch_v2.csv"));
  if(!data||data.rows.length<3){console.log("数据不足（需要至少3条记录）");return;}
  console.log(`读取 ${data.rows.length} 条快照`);

  // 1. Event Detection
  console.log("\n── 事件检测 ──");
  const events=detectEvents(data);
  console.log(`检测到 ${events.length} 个事件`);
  const eventRows:string[][]=[["idx","timestamp","type","price","oi_m","oi_chg_m","fund_pct","liq_k","score","evidence","confidence"]];
  for(const e of events.slice(-15)){
    console.log(`  ${e.ts} ${e.type}: ${e.evidence}`);
    eventRows.push([String(e.idx),e.ts,e.type,e.price.toFixed(2),(e.oi/1e6).toFixed(1),(e.oiChg/1e6).toFixed(1),e.fund.toFixed(2),(e.liq/1e3).toFixed(0),String(e.score),e.evidence,e.confidence]);
  }
  writeFileSync(join(OUT_DIR,"lab_intraday_events.csv"),eventRows.map(r=>r.join(",")).join("\n"));

  // 2. Path Backtesting
  console.log("\n── 路径回测 ──");
  const paths=backtestEvents(events,data);
  console.log(`回测 ${paths.length} 条路径`);
  writeFileSync(join(OUT_DIR,"lab_intraday_event_backtest.csv"),
    ["event_type,idx,follow_through,reversal,favorable_move,adverse_move,path_vol",
      ...paths.map(p=>`${p.eventType},${p.eventIdx},${p.follow_through},${p.reversal},${(p.favorable_move*100).toFixed(1)}%,${(p.adverse_move*100).toFixed(1)}%,${p.path_vol.toFixed(4)}`)].join("\n"));

  // 3. Signal Attribution
  console.log("\n── 信号归因 ──");
  const attrs=attributeSignals(paths);
  for(const a of attrs) console.log(`  ${a.name}: ${a.samples}样本 ${a.leadLag} (${a.confidence}) ${a.notes}`);
  writeFileSync(join(OUT_DIR,"lab_signal_attribution.csv"),
    ["signal_name,sample_count,lead_or_lag,confidence,notes",
      ...attrs.map(a=>`${a.name},${a.samples},${a.leadLag},${a.confidence},${a.notes}`)].join("\n"));

  // 4. Commander Scores
  console.log("\n── 参谋评分 ──");
  const cdr=computeCommanderScores(events,paths,attrs,data);
  if(!cdr){console.log("评分计算失败");return;}
  console.log(`  市场阶段: ${cdr.market_phase}`);
  console.log(`  趋势延续: ${cdr.trend_continuation_score}/100`);
  console.log(`  反转风险: ${cdr.reversal_risk_score}/100`);
  console.log(`  清算反弹: ${cdr.squeeze_rebound_score}/100`);
  console.log(`  数据置信: ${cdr.data_confidence_score}/100`);
  writeFileSync(join(OUT_DIR,"lab_commander_brief.json"),JSON.stringify(cdr,null,2));

  // 5. Report
  const report=[
    "# LAB 盘中情报参谋报告","",
    `生成: ${new Date().toISOString().slice(0,19).replace("T"," ")}`,
    `快照数: ${data.rows.length} | 事件数: ${events.length}`,
    "",
    "## 1. 综合研判","",
    `**${cdr.market_phase}**`,
    cdr.commander_summary,"",
    "## 2. 四分评分","",
    `| 维度 | 得分 |`,
    `|------|------|`,
    `| 趋势延续 | ${cdr.trend_continuation_score}/100 |`,
    `| 反转风险 | ${cdr.reversal_risk_score}/100 |`,
    `| 清算反弹 | ${cdr.squeeze_rebound_score}/100 |`,
    `| 数据置信 | ${cdr.data_confidence_score}/100 |`,
    "",
    "## 3. 事件时间线","",
    "| 时间 | 类型 | 证据 | 置信度 |",
    "|------|------|------|--------|",
    ...events.slice(-10).map(e=>`| ${e.ts} | ${e.type} | ${e.evidence} | ${e.confidence} |`),
    "",
    "## 4. 信号归因","",
    "| 信号 | 样本 | 先行/滞后 | 置信度 |",
    "|------|------|----------|--------|",
    ...attrs.map(a=>`| ${a.name} | ${a.samples} | ${a.leadLag} | ${a.confidence} |`),
    "",
    "## 5. 情景推演","",
    `- 主情景: ${cdr.main_scenario}`,
    `- 替代情景: ${cdr.alternative_scenario}`,
    `- 推翻条件: ${cdr.invalidation_condition}`,
    "",
    "## 6. 最强/最弱证据","",
    `- 最强: ${cdr.strongest_evidence}`,
    `- 最弱: ${cdr.weakest_evidence}`,
    `- 核心矛盾: ${cdr.main_contradiction}`,
    "",
    "## 7. 下次观察","",
    cdr.next_observation,
    "",
    "## 8. 数据边界","",
    `- 快照数: ${data.rows.length}（非严格5m间隔）`,
    "- 单币种: LAB",
    "- 单日行情",
    "- CoinGlass 4h粒度",
    "- 样本偏差: 仅覆盖一次完整去杠杆周期",
    "",
    "## 9. 声明","",
    "状态和证据不是执行指令。本报告仅为情报分析，不包含交易执行建议。",
  ];
  writeFileSync(join(REPORTS_DIR,"lab_intraday_commander_report.md"),report.join("\n"));

  // 6. DeepSeek Prompt
  const dsPrompt=[
    "# LAB 盘中复盘 — DeepSeek 参谋 Prompt","",
    "你是量化研究参谋，不是交易执行员。基于以下 LAB 盘中数据，回答：","",
    "## 数据摘要（最近6条快照）",
    ...data.rows.slice(-6).map(r=>`${col(r,data.h,"timestamp")?.slice(11,19)} | $${num(r,data.h,"price_usd").toFixed(2)} | OI $${(num(r,data.h,"coinglass_oi_usd")/1e6).toFixed(1)}M | 资金${num(r,data.h,"funding_rate_percent").toFixed(2)}% | 清算$${(num(r,data.h,"liq_4h")/1e3).toFixed(0)}K | ${col(r,data.h,"fast_watch_state")}`),
    "",
    "## 近期事件",
    ...events.slice(-8).map(e=>`- ${e.ts} ${e.type}: ${e.evidence}`),
    "",
    "## 参谋评分",
    `趋势延续: ${cdr.trend_continuation_score}/100 | 反转风险: ${cdr.reversal_risk_score}/100 | 清算反弹: ${cdr.squeeze_rebound_score}/100 | 数据置信: ${cdr.data_confidence_score}/100`,
    "",
    "## 请回答",
    "1. 当前主结构是什么？",
    "2. 哪个指标最有解释力？",
    "3. 哪个指标最可能误导？",
    "4. 当前更像趋势延续、反转观察、清算扩张、还是重置反弹？",
    "5. 下一次观察最关键的3个变量是什么？",
    "6. 哪个条件会推翻当前判断？",
    "7. 数据中是否存在隐藏矛盾？",
    "8. 如需改进监控，应新增或重新加权哪个指标？",
    "",
    "禁止回答: 开仓/平仓/仓位/杠杆/止损止盈/收益预测",
  ];
  writeFileSync(join(REPORTS_DIR,"deepseek_prompt_lab_commander.md"),dsPrompt.join("\n"));
  console.log(`\nDeepSeek prompt: ${REPORTS_DIR}/deepseek_prompt_lab_commander.md`);

  // 7. Quality Check
  const checks=[
    cdr.trend_continuation_score>=0&&cdr.trend_continuation_score<=100,
    cdr.reversal_risk_score>=0&&cdr.reversal_risk_score<=100,
    cdr.squeeze_rebound_score>=0&&cdr.squeeze_rebound_score<=100,
    cdr.data_confidence_score>=0&&cdr.data_confidence_score<=100,
    cdr.strongest_evidence.length>0,
    cdr.weakest_evidence.length>0,
    cdr.main_contradiction.length>0,
    cdr.next_observation.length>0,
    cdr.invalidation_condition.length>0,
    cdr.market_phase.length>0,
  ];
  const allPass=checks.every(c=>c);
  console.log(`\n质量检查: ${allPass?"全部通过":"存在未通过项"}`);
  writeFileSync(join(OUT_DIR,"lab_commander_quality.json"),JSON.stringify({passed:allPass,checks,ts:new Date().toISOString()}));

  console.log(`\n报告: ${REPORTS_DIR}/lab_intraday_commander_report.md`);
}

main();
