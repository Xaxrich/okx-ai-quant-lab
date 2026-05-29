import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { readCsv } from "../../../utils/csv.js";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";
import { sendFeishuText, isFeishuEnabled, isDryRun, getChatIdMasked, sanitizeMessage } from "../../../integrations/feishu/feishu_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");
const SNAPSHOT_DIR = join(OUT_DIR, "whale_snapshots");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";
const CG_API = process.env.COINGLASS_API_KEY || "";
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";

// ── Whale snapshot loader ──
interface WhaleSnapshot {
  timestamp: string; token: string; totalHolders: number;
  labelledCount: number; unknownCount: number; cexCount: number;
  top1Share: number; top5Share: number; top10Share: number;
  topCexShare: number; topUnknownShare: number;
  cexTotalShare: number; unknownWhaleShare: number;
  holderConcentration: number;
  dumpPotential: {
    totalWhaleShare: number; whaleShareOnCex: number;
    whaleShareOffCex: number; estimatedDumpableUsd: number;
    marketCap: number; dumpRatio: number;
  };
}

function loadLatestWhaleSnapshot(): WhaleSnapshot | null {
  try {
    if (!existsSync(SNAPSHOT_DIR)) return null;
    const files = readdirSync(SNAPSHOT_DIR).filter((f: string) => f.startsWith("whale_") && f.endsWith(".json")).sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1];
    return JSON.parse(readFileSync(join(SNAPSHOT_DIR, latest), "utf-8")) as WhaleSnapshot;
  } catch { return null; }
}

function col(r:string[],h:string[],n:string):string{const i=h.indexOf(n);return i>=0?(r[i]||""):"";}
function num(r:string[],h:string[],n:string):number{const v=parseFloat(col(r,h,n));return isNaN(v)?0:v;}
function fmt(n:number,d=0):string{return n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});}

// ── 1. DexScreener ──
async function fetchDexScreener(): Promise<any> {
  try {
    const r=await fetch("https://api.dexscreener.com/latest/dex/search?q=LAB");
    const j=await r.json(); const pairs=j?.pairs||[];
    const bsc=pairs.filter((p:any)=>p.chainId==="bsc"&&(p.volume?.h24||0)>0);
    const totalVol=bsc.reduce((s:number,p:any)=>s+(p.volume?.h24||0),0);
    const totalLiq=bsc.reduce((s:number,p:any)=>s+(p.liquidity?.usd||0),0);
    const totalBuys=bsc.reduce((s:number,p:any)=>s+(p.txns?.h24?.buys||0),0);
    const totalSells=bsc.reduce((s:number,p:any)=>s+(p.txns?.h24?.sells||0),0);
    const topLiq=pairs.sort((a:any,b:any)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0));
    const liqTop3=topLiq.slice(0,3).reduce((s:number,p:any)=>s+(p.liquidity?.usd||0),0);
    const volToLiq=totalLiq>0?totalVol/totalLiq:0;
    const buyRatio=totalBuys+totalSells>0?totalBuys/(totalBuys+totalSells):0.5;
    let microState="DEX_BALANCED";
    if(volToLiq>30) microState="DEX_THIN_HIGH_TURNOVER";
    else if(buyRatio>0.55) microState="DEX_BUY_PRESSURE";
    else if(buyRatio<0.45) microState="DEX_SELL_PRESSURE";
    return{total_pairs:bsc.length,total_liquidity:totalLiq,total_volume_24h:totalVol,total_buys:totalBuys,total_sells:totalSells,buy_ratio:buyRatio,volume_to_liquidity:volToLiq,liquidity_concentration:totalLiq>0?liqTop3/totalLiq:0,microstructure_state:microState,top_dex:bsc[0]?.dexId||"?"};
  }catch{return null;}
}

// ── 2. Exchange OI ──
async function fetchExchangeOI(): Promise<any> {
  if(!CG_API) return null;
  try{const r=await fetch("https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=LAB",{headers:{"CG-API-KEY":CG_API}});const j=await r.json();const ex=j?.data||[];const total=ex.find((e:any)=>e.exchange==="All");const sorted=ex.filter((e:any)=>e.exchange!=="All").sort((a:any,b:any)=>b.open_interest_usd-a.open_interest_usd);const hhi=sorted.reduce((s:number,e:any)=>total?s+(e.open_interest_usd/total.open_interest_usd)**2:0,0);const growing=sorted.filter((e:any)=>e.open_interest_change_percent_1h>0).length;const shrinking=sorted.filter((e:any)=>e.open_interest_change_percent_1h<0).length;return{total_oi:total?.open_interest_usd||0,hhi,top3_share:total?sorted.slice(0,3).reduce((s:number,e:any)=>s+e.open_interest_usd,0)/total.open_interest_usd:0,growing_exchanges:growing,shrinking_exchanges:shrinking,okx_share:total?(sorted.find((e:any)=>e.exchange==="OKX")?.open_interest_usd||0)/total.open_interest_usd:0};}catch{return null;}
}

// ── 3. Composite Signal Engine ──
function computeCompositeSignals(fw:any,cg:any,ex:any,dex:any):any[]{
  if(!fw||!cg) return[];
  const h=fw.h,rows=fw.rows; if(rows.length<3) return[];
  const latest=rows[rows.length-1],prev=rows[rows.length-2];
  const price=num(latest,h,"price_usd"),oi=num(latest,h,"coinglass_oi_usd"),oiChg=num(latest,h,"oi_change_4h");
  const fund=num(latest,h,"funding_rate_percent"),liq=num(latest,h,"liq_4h"),score=num(latest,h,"risk_score");

  // Find peaks in last 12
  let maxFund=fund,maxOI=oi,maxLiq=liq; for(const r of rows.slice(-12)){maxFund=Math.max(maxFund,num(r,h,"funding_rate_percent"));maxOI=Math.max(maxOI,num(r,h,"coinglass_oi_usd"));maxLiq=Math.max(maxLiq,num(r,h,"liq_4h"));}
  const oiFromPeak=maxOI>0?(oi-maxOI)/maxOI:0,fundFromPeak=maxFund-fund,liqFromPeak=maxLiq-liq;
  const oiToMcap=oi>0&&cg?.market_cap?oi/cg.market_cap:0;
  const signals:any[]=[];

  // C1: CROWDED_DERIVATIVES_HEAT
  const c1=fund>=10&&oiToMcap>=1&&oiChg>0;
  signals.push({id:"C1",name:"衍生品拥挤热度",triggered:c1,score:c1?80:0,confidence:c1?"HIGH":"MEDIUM",evidence:c1?`funding ${fund.toFixed(1)}%, OI/MCap ${oiToMcap.toFixed(1)}`:"",lead_or_lag:"EARLY_CONFIRMATION"});

  // C2: FUNDING_PEAK_TO_OI_PEAK_CHAIN
  const c2=fundFromPeak>2&&oiFromPeak<-0.03;
  signals.push({id:"C2",name:"资金峰值→OI峰值链",triggered:c2,score:c2?70:0,confidence:c2?"MEDIUM":"LOW",evidence:c2?`funding从${maxFund.toFixed(1)}%回落${fundFromPeak.toFixed(1)}%, OI从峰值${(Math.abs(oiFromPeak)*100).toFixed(0)}%回落`:"",lead_or_lag:"LEADING_CANDIDATE"});

  // C3: DELEVERAGING_RESET
  const c3=fundFromPeak>5&&oiFromPeak<-0.1&&liqFromPeak>1e6;
  signals.push({id:"C3",name:"去杠杆重置",triggered:c3,score:c3?90:0,confidence:c3?"HIGH":"LOW",evidence:c3?`funding-${fundFromPeak.toFixed(0)}%, OI-${(Math.abs(oiFromPeak)*100).toFixed(0)}%, liq峰值$${(maxLiq/1e6).toFixed(1)}M→$${(liq/1e6).toFixed(2)}M`:"",lead_or_lag:"CONFIRMATION"});

  // C4: RESET_REACCELERATION
  const c4=fundFromPeak>3&&oiFromPeak>-0.08&&oiFromPeak<0&&oiChg>=0;
  signals.push({id:"C4",name:"重置后重新加速",triggered:c4,score:c4?65:0,confidence:c4?"MEDIUM":"LOW",evidence:c4?`OI从峰值恢复中(${(oiFromPeak*100).toFixed(0)}%), OI 4h变化${oiChg>=0?"+":""}$${(Math.abs(oiChg)/1e6).toFixed(1)}M`:"",lead_or_lag:"EARLY_CONFIRMATION"});

  // C5: THIN_LIQUIDITY_PERP_DOMINANCE
  const c5=dex&&dex.volume_to_liquidity>20&&oi>1e8&&ex&&ex.okx_share<0.1;
  signals.push({id:"C5",name:"薄流动性+衍生品主导",triggered:c5,score:c5?85:0,confidence:c5?"HIGH":"MEDIUM",evidence:c5?`DEX turnover ${dex.volume_to_liquidity.toFixed(0)}x, OI $${(oi/1e6).toFixed(0)}M, OKX仅${(ex.okx_share*100).toFixed(1)}%`:"",lead_or_lag:"STRUCTURAL_CONTEXT"});

  // C6: DEX_FLOW_DIVERGENCE (DEX balanced but price moving)
  const c6=dex&&Math.abs(dex.buy_ratio-0.5)<0.05&&Math.abs(num(latest,h,"price_usd")-num(prev,h,"price_usd"))>0.02;
  signals.push({id:"C6",name:"DEX流向中性+价格波动",triggered:c6,score:c6?40:0,confidence:"LOW",evidence:c6?`DEX buy ${(dex.buy_ratio*100).toFixed(0)}%, 价格波动主要由衍生品驱动`:"",lead_or_lag:"STRUCTURAL_CONTEXT"});

  // C7: LIQUIDATION_STRESS
  const liqToOI=oi>0?liq/oi:0;
  const c7=liqToOI>0.002||liq>2e6;
  signals.push({id:"C7",name:"清算压力",triggered:c7,score:c7?75:0,confidence:c7?"MEDIUM":"LOW",evidence:c7?`清算/OI ${(liqToOI*100).toFixed(2)}%, liq $${(liq/1e6).toFixed(2)}M`:"",lead_or_lag:"LAGGING"});

  // C8: EQUILIBRIUM_AFTER_RESET
  const c8=liq<1e6&&fund<10&&Math.abs(oiFromPeak)>0.03&&Math.abs(oiFromPeak)<0.2;
  signals.push({id:"C8",name:"重置后均衡",triggered:c8,score:c8?50:0,confidence:c8?"MEDIUM":"LOW",evidence:c8?`清算低位, 资金${fund.toFixed(1)}%<10%, OI从峰值回落${(Math.abs(oiFromPeak)*100).toFixed(0)}%后稳定`:"",lead_or_lag:"CONFIRMATION"});

  return signals;
}

// ── 4. Commander v3 scoring ──
async function main(){
  console.log("=== LAB 情报参谋 v3 ===\n");
  for(const d of[OUT_DIR,REPORTS_DIR]){if(!existsSync(d)) mkdirSync(d,{recursive:true});}

  // Collect all data
  const fw=readCsv(join(OUT_DIR,"lab_fast_watch_v2.csv")); if(!fw||fw.rows.length<3){console.log("快照不足");return;}
  const h=fw.h,rows=fw.rows,latest=rows[rows.length-1];
  const price=num(latest,h,"price_usd"),oi=num(latest,h,"coinglass_oi_usd"),oiChg=num(latest,h,"oi_change_4h");
  const fund=num(latest,h,"funding_rate_percent"),liq=num(latest,h,"liq_4h"),score=num(latest,h,"risk_score");
  const state=col(latest,h,"fast_watch_state"),ret24=num(latest,h,"return_24h");

  console.log("采集数据...");
  const[dex,ex]=await Promise.all([fetchDexScreener(),fetchExchangeOI()]);
  const whale = loadLatestWhaleSnapshot();
  console.log(`DEX: ${dex?dex.total_pairs+"对 $"+dex.total_volume_24h.toFixed(0)+" vol":"不可用"}`);
  console.log(`交易所OI: ${ex?"$"+(ex.total_oi/1e6).toFixed(0)+"M HHI="+ex.hhi.toFixed(3):"不可用"}`);
  console.log(`鲸鱼快照: ${whale?`Top1 ${(whale.top1Share*100).toFixed(1)}% Top5 ${(whale.top5Share*100).toFixed(1)}% CEX ${(whale.cexTotalShare*100).toFixed(1)}% MCap $${(whale.dumpPotential.marketCap/1e6).toFixed(0)}M`:"不可用"}`);

  // Composite signals
  console.log("\n── 组合信号 ──");
  const cg={market_cap:num(latest,h,"market_cap")||oi*2};
  const signals=computeCompositeSignals(fw,cg?{market_cap:cg.market_cap}:null,ex,dex);
  const triggered=signals.filter((s:any)=>s.triggered);
  for(const s of signals){if(s.triggered)console.log(`  ${s.id} ${s.name}: ✓ ${s.confidence}`);}
  const dominant=triggered.length>0?triggered.sort((a:any,b:any)=>b.score-a.score)[0]:null;

  // Market phase
  const peaks={fund:0,oi:0,liq:0}; for(const r of rows.slice(-12)){peaks.fund=Math.max(peaks.fund,num(r,h,"funding_rate_percent"));peaks.oi=Math.max(peaks.oi,num(r,h,"coinglass_oi_usd"));peaks.liq=Math.max(peaks.liq,num(r,h,"liq_4h"));}
  const fundFromPeak=peaks.fund-fund,oiFromPeak=peaks.oi>0?(oi-peaks.oi)/peaks.oi:0;
  const hasLiqReset=peaks.liq>1e6&&liq<peaks.liq*0.5;
  let phase="RESET_EQUILIBRIUM";
  if(fund>10&&oiChg>0) phase="CROWDED_UPTREND";
  else if(fundFromPeak>2&&oiFromPeak<-0.05&&hasLiqReset) phase="DELEVERAGING_RESET";
  else if(hasLiqReset&&oiFromPeak>-0.08&&fund<10) phase="RESET_REACCELERATION";
  else if(fund>10&&oiFromPeak<-0.05) phase="HEAT_PEAK";
  else if(hasLiqReset&&Math.abs(oiFromPeak)<0.15) phase="RESET_EQUILIBRIUM";

  // 5-dimension scoring
  const trend=Math.max(0,Math.min(100,60+(oiChg>0?15:0)+(fund<8?10:0)-(fund>10?10:0)-(oiFromPeak<-0.1?10:0)));
  const reversal=Math.max(0,Math.min(100,(fundFromPeak>2?20:0)+(oiChg<0?15:0)+(liq>1e6?15:0)+(peaks.liq>2e6?15:0)+(score>40?10:0)));
  const resetRebound=Math.max(0,Math.min(100,(hasLiqReset?40:0)+(oiFromPeak>-0.08?20:0)+(fund<10?15:0)+(oiChg>=0?10:0)));
  let liqFrag=Math.max(0,Math.min(100,dex?((dex.volume_to_liquidity>30?50:dex.volume_to_liquidity>15?30:10)):0+(ex&&ex.okx_share<0.05?20:0)));
  const dataConf=Math.max(0,Math.min(100,70+(dex?10:0)+(ex?10:0)-10)); // -10 single-day penalty

  // Evidence chain
  const evidenceChain=[];
  if(hasLiqReset) evidenceChain.push(`清算从峰值$${(peaks.liq/1e6).toFixed(1)}M回落——压力已阶段性释放`);
  if(oiFromPeak<-0.05) evidenceChain.push(`OI从峰值$${(peaks.oi/1e6).toFixed(0)}M回落${(Math.abs(oiFromPeak)*100).toFixed(0)}%`);
  if(fundFromPeak>3) evidenceChain.push(`资金费率从${peaks.fund.toFixed(1)}%峰值回落至${fund.toFixed(1)}%`);
  if(dex&&dex.volume_to_liquidity>20) evidenceChain.push(`DEX流动性极薄(${(dex.volume_to_liquidity).toFixed(0)}x turnover)——价格易被放大`);
  if(dex&&Math.abs(dex.buy_ratio-0.5)<0.05) evidenceChain.push(`DEX买卖均衡(${(dex.buy_ratio*100).toFixed(0)}%买)——无单边情绪`);
  // Whale evidence
  if(whale){
    if(whale.holderConcentration>0.7) evidenceChain.push(`⚠持仓极度集中: Top5持有${(whale.holderConcentration*100).toFixed(0)}%——有效流通远小于名义市值`);
    if(whale.dumpPotential.whaleShareOffCex>0.5) evidenceChain.push(`⚠${(whale.dumpPotential.whaleShareOffCex*100).toFixed(0)}%供应量未上交易所(\$${(whale.dumpPotential.estimatedDumpableUsd/1e6).toFixed(0)}M)——潜在解锁抛压`);
    if(whale.dumpPotential.marketCap>0){
      const oiToEffective = whale.cexTotalShare>0 ? oi/(whale.dumpPotential.marketCap*whale.cexTotalShare) : 0;
      if(oiToEffective>0.3) evidenceChain.push(`⚠OI/CEX流通 = ${(oiToEffective*100).toFixed(0)}%——衍生品规模接近实际可交易供应量`);
    }
    if(whale.cexTotalShare<0.3) evidenceChain.push(`CEX持仓仅${(whale.cexTotalShare*100).toFixed(0)}%——实际流动盘极小，价格易被衍生品主导`);
  }

  // Adjust liqFrag for whale concentration
  if(whale && whale.holderConcentration>0.7) liqFrag = Math.min(100, liqFrag + 25);
  if(whale && whale.cexTotalShare<0.3) liqFrag = Math.min(100, liqFrag + 15);

  const contradiction=`${phase}: ${whale&&whale.holderConcentration>0.7?`持仓极度集中(Top5 ${(whale.holderConcentration*100).toFixed(0)}%)。`:""}去杠杆压力已释放，但资金费率仍处${fund>8?"偏高":"正常"}水平(${fund.toFixed(1)}%)。OI${oiFromPeak<-0.05?"已":"未"}从峰值显著回落。${dex&&dex.volume_to_liquidity>20?"DEX现货池极薄——价格结构脆弱。":""}${whale&&whale.dumpPotential.whaleShareOffCex>0.5?`${(whale.dumpPotential.whaleShareOffCex*100).toFixed(0)}%供应量未上交易所——潜在抛压未释放。`:""}`;

  // Invalidation
  const invalidation=[
    `OI持续下降且不恢复——推翻reset-reacceleration`,
    `清算重新放大至$1M+——推翻压力已消化`,
    `资金费率重新突破10%且OI同步上升——推翻均衡`,
  ];

  // Build result
  const cdr={
    timestamp:new Date().toISOString(),market_phase:phase,previous_phase:"RESET_REBOUND",
    dominant_signal:dominant?{id:dominant.id,name:dominant.name,confidence:dominant.confidence}:null,
    active_signals:triggered.map((s:any)=>s.id),
    trend_continuation_score:trend,reversal_risk_score:reversal,reset_reacceleration_score:resetRebound,liquidity_fragility_score:liqFrag,data_confidence_score:dataConf,
    strongest_evidence_chain:evidenceChain.join("；"),weakest_evidence:"统计样本仅单日单币，组合信号未经多周期验证",
    main_contradiction:contradiction,scenario_main:phase,scenario_alternative:phase.includes("RESET")?"二次去杠杆":"趋势延续",
    invalidation_conditions:invalidation,next_3_observations:[
      `OI是否从${oiFromPeak<-0.05?"回落":"平稳"}转为${oiChg>0?"继续":"重新"}上升`,
      `清算是否突破$1M——当前$${(liq/1e3).toFixed(0)}K`,
      `DEX turnover${dex&&dex.volume_to_liquidity>20?"仍在":"是否升至"}极端水平`,
    ],
    whale_intel: whale ? {
      top5Concentration: whale.holderConcentration,
      cexShare: whale.cexTotalShare,
      offCexShare: whale.dumpPotential.whaleShareOffCex,
      estimatedMCap: whale.dumpPotential.marketCap,
      estimatedDumpableUsd: whale.dumpPotential.estimatedDumpableUsd,
      cexCount: whale.cexCount,
      labelledRatio: whale.labelledCount / Math.max(1, whale.totalHolders),
      keyRisk: whale.holderConcentration > 0.7 ? "EXTREME_CONCENTRATION" : whale.cexTotalShare < 0.3 ? "LOW_FLOAT" : "MODERATE",
    } : null,
    case_insight:hasLiqReset?{signal:"LIQUIDATION_RESET_REBOUND",stat_confidence:"LOW",case_importance:"HIGH",note:"本轮最关键的转折——清算从$2.1M峰值完全回落，标志急性去杠杆结束"}:null,
    sample_limitations:`快照${rows.length}条|单日单币|组合信号未经多周期回测`,
    commander_push_grade:"PREVIEW_OK",
    commander_summary:`${phase}。${whale&&whale.holderConcentration>0.7?`⚠持仓极度集中(Top5 ${(whale.holderConcentration*100).toFixed(0)}%)。`:""}清算压力已释放，OI从峰值回落，资金费率${fund>8?"仍偏高但":"已"}回落至${fund.toFixed(1)}%。${dex&&dex.volume_to_liquidity>20?`⚠DEX现货池极薄(${(dex.volume_to_liquidity).toFixed(0)}x turnover)——价格结构脆弱。`:""}${whale&&whale.dumpPotential.whaleShareOffCex>0.5?`⚠${(whale.dumpPotential.whaleShareOffCex*100).toFixed(0)}%供应量未上交易所(\$${(whale.dumpPotential.estimatedDumpableUsd/1e6).toFixed(0)}M)。`:""}`,
    dex_microstructure:dex?{liquidity:dex.total_liquidity,volume_24h:dex.total_volume_24h,volume_to_liquidity:dex.volume_to_liquidity,buy_ratio:dex.buy_ratio,state:dex.microstructure_state}:"不可用",
    exchange_oi:ex?{total_oi:ex.total_oi,hhi:ex.hhi,top3:ex.top3_share,growing:ex.growing_exchanges,shrinking:ex.shrinking_exchanges}:"不可用",
  };

  // Write JSON
  writeFileSync(join(OUT_DIR,"lab_commander_brief_v3.json"),JSON.stringify(cdr,null,2), "utf-8");

  // Console output
  console.log(`\n── Commander v3 ──`);
  console.log(`阶段: ${cdr.market_phase} | 主导信号: ${dominant?.name||"无"}`);
  console.log(`趋势:${trend} 反转:${reversal} 重置:${resetRebound} 流动脆弱:${liqFrag} 置信:${dataConf}`);
  if(dex) console.log(`DEX: ${dex.microstructure_state} turnover=${dex.volume_to_liquidity.toFixed(0)}x buy=${(dex.buy_ratio*100).toFixed(0)}%`);
  if(ex) console.log(`交易所: $${(ex.total_oi/1e6).toFixed(0)}M HHI=${ex.hhi.toFixed(2)} ${ex.growing_exchanges}+/${ex.shrinking_exchanges}-`);

  // Feishu push
  if(CHAT_ID&&isFeishuEnabled()&&!isDryRun()){
    const msg=`【LAB 盘中参谋 v3｜${cdr.market_phase}】

${cdr.commander_summary}

${dominant?`主导信号: ${dominant.name} (${dominant.confidence})`:"无主导信号"}
触发: ${triggered.map((s:any)=>s.id+" "+s.name).join(", ")||"无"}

当前结构:
${cdr.strongest_evidence_chain}

核心矛盾:
${cdr.main_contradiction}

评分:
趋势${trend} | 反转${reversal} | 重置${resetRebound} | 流动脆弱${liqFrag} | 置信${dataConf}

${whale?`🐋 鲸鱼持仓:
Top5集中度 ${(whale.holderConcentration*100).toFixed(0)}% | CEX持仓 ${(whale.cexTotalShare*100).toFixed(1)}%
非CEX鲸鱼 ${(whale.dumpPotential.whaleShareOffCex*100).toFixed(1)}% (≈\$${(whale.dumpPotential.estimatedDumpableUsd/1e6).toFixed(0)}M)
估算市值 \$${(whale.dumpPotential.marketCap/1e6).toFixed(0)}M | 风险: ${cdr.whale_intel?.keyRisk||"N/A"}
`:""}
DEX微观:
${dex?`流动性$${(dex.total_liquidity/1e6).toFixed(2)}M | 24h量$${(dex.total_volume_24h/1e6).toFixed(2)}M | 换手${dex.volume_to_liquidity.toFixed(0)}x | 买入${(dex.buy_ratio*100).toFixed(0)}% | ${dex.microstructure_state}`:"不可用"}

交易所:
${ex?`总OI$${(ex.total_oi/1e6).toFixed(0)}M | 集中度${ex.hhi.toFixed(2)} | ${ex.growing_exchanges}↑/${ex.shrinking_exchanges}↓`:""}

下次看:
1. ${cdr.next_3_observations[0]}
2. ${cdr.next_3_observations[1]}
3. ${cdr.next_3_observations[2]}

推翻:
- ${cdr.invalidation_conditions[0]}
- ${cdr.invalidation_conditions[1]}

${cdr.sample_limitations}
不构成交易建议。`;
    const s=sanitizeMessage(msg); if(s.clean){const r=await sendFeishuText(CHAT_ID,msg);console.log(`\n飞书: ${r.ok?"已发送":"失败"}`);}
    else{console.log(`\n飞书拦截: ${s.violations.join(", ")}`);}
  }

  // Report
  const report=[
    "# LAB 情报参谋 v3","",`生成: ${new Date().toISOString().slice(0,19).replace("T"," ")}`,
    "","## 1. 综合研判",`**${cdr.market_phase}**`,cdr.commander_summary,
    "","## 2. 五维评分","| 维度 | 得分 |","|------|------|",`| 趋势延续 | ${trend}/100 |`,`| 反转风险 | ${reversal}/100 |`,`| 重置再加速 | ${resetRebound}/100 |`,`| 流动脆弱性 | ${liqFrag}/100 |`,`| 数据置信 | ${dataConf}/100 |`,
    "","## 3. 组合信号","| ID | 名称 | 触发 | 置信度 | 分类 |","|----|------|------|--------|------|",...signals.map((s:any)=>`| ${s.id} | ${s.name} | ${s.triggered?"✓":""} | ${s.confidence} | ${s.lead_or_lag} |`),
    "","## 4. DEX微观结构",dex?`- 交易对: ${dex.total_pairs}\n- 流动性: $${(dex.total_liquidity/1e6).toFixed(2)}M\n- 24h量: $${(dex.total_volume_24h/1e6).toFixed(2)}M\n- 换手率: ${dex.volume_to_liquidity.toFixed(0)}x\n- 买入占比: ${(dex.buy_ratio*100).toFixed(0)}%\n- 状态: ${dex.microstructure_state}`:"不可用",
    "","## 5. 鲸鱼持仓",whale?`- Top5集中度: ${(whale.holderConcentration*100).toFixed(0)}%\n- CEX持仓: ${(whale.cexTotalShare*100).toFixed(1)}%\n- 非CEX鲸鱼: ${(whale.dumpPotential.whaleShareOffCex*100).toFixed(1)}% (≈$${(whale.dumpPotential.estimatedDumpableUsd/1e6).toFixed(0)}M)\n- 估算市值: $${(whale.dumpPotential.marketCap/1e6).toFixed(0)}M\n- 已标记: ${whale.labelledCount}/${whale.totalHolders}\n- 风险评级: ${cdr.whale_intel?.keyRisk||"N/A"}`:"不可用",
    "","## 6. 交易所OI",ex?`- 总OI: $${(ex.total_oi/1e6).toFixed(0)}M\n- HHI: ${ex.hhi.toFixed(3)}\n- 前3: ${(ex.top3_share*100).toFixed(0)}%\n- 1h: ${ex.growing_exchanges}所↑ ${ex.shrinking_exchanges}所↓`:"不可用",
    "","## 7. 证据链",cdr.strongest_evidence_chain,"","## 8. 推翻条件",...cdr.invalidation_conditions.map((s:string,i:number)=>`${i+1}. ${s}`),
    "","## 9. 边界",cdr.sample_limitations,"本报告仅为情报分析。",
  ];
  writeFileSync(join(REPORTS_DIR,"lab_intraday_commander_report_v3.md"),report.join("\n"), "utf-8");
  console.log(`\n报告: ${REPORTS_DIR}/lab_intraday_commander_report_v3.md`);
}

main().catch(console.error);
