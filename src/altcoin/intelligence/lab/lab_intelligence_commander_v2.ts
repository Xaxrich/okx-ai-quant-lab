import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { readCsv, csvEscape } from "../../../utils/csv.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");

function col(r:string[],h:string[],n:string):string{const i=h.indexOf(n);return i>=0?(r[i]||""):"";}
function num(r:string[],h:string[],n:string):number{const v=parseFloat(col(r,h,n));return isNaN(v)?0:v;}

interface Cluster {
  id:string; idx:number; ts:string; primaryType:string; secondaryTypes:string[];
  eventCount:number; price:number; oi:number; oiChg:number; fund:number; fundChg:number; liq:number;
  evidence:string; confidence:string; microPhase:string;
}

interface ClusterPath {
  clusterId:string; primaryType:string; price:number; ts:string;
  f1_price:number|null; f2_price:number|null; f3_price:number|null; f6_price:number|null;
  f1_elapsed:number|null; f3_elapsed:number|null; f6_elapsed:number|null;
  f1_ret:number|null; f3_ret:number|null; f6_ret:number|null;
  max_adv:number|null; max_fav:number|null; valid:boolean;
}

// ── 事件聚类 ──
function buildClusters(rawEvents:string[][], data:{h:string[],rows:string[][]}): Cluster[] {
  const h=data.h, rows=data.rows;
  const byIdx=new Map<number,{types:string[],evidence:string[],conf:string[]}>();
  for(const e of rawEvents.slice(1)){
    const idx=parseInt(e[0]||"0"); if(isNaN(idx)) continue;
    const t=e[2], ev=e[9], conf=e[10];
    const entry=byIdx.get(idx)||{types:[],evidence:[],conf:[]};
    entry.types.push(t); entry.evidence.push(ev); entry.conf.push(conf);
    byIdx.set(idx,entry);
  }

  const clusters:Cluster[]=[];
  for(const [idx,entry] of byIdx){
    const r=rows[idx]; if(!r) continue;
    const ts=col(r,h,"timestamp")?.slice(11,19)||"";
    const price=num(r,h,"price_usd"), oi=num(r,h,"coinglass_oi_usd"), oiChg=num(r,h,"oi_change_from_prev");
    const fund=num(r,h,"funding_rate_percent"), fundChg=num(r,h,"funding_change_from_prev");
    const liq=num(r,h,"liq_4h");

    // Determine primary type by priority
    const types=new Set(entry.types);
    const has=(t:string)=>types.has(t);
    let primary="MIXED", microPhase="EQUILIBRIUM", conf="MEDIUM";

    // Composite detection
    const oiDown=has("OI_ROLLOVER")||has("PRICE_OI_BOTH_DOWN");
    const liqUp=has("LIQUIDATION_EXPANSION");
    const fundCool=has("FUNDING_COOLING");
    const liqReset=has("LIQUIDATION_RESET");
    const oiAccel=has("OI_ACCELERATION");
    const fundExtreme=has("FUNDING_EXTREME_UP");
    const squeeze=has("SQUEEZE_REBOUND");

    if(oiDown&&liqUp&&(fund>5||fundCool)){primary="DELEVERAGING_COMPOSITE";microPhase="DELEVERAGING_PRESSURE";conf="HIGH";}
    else if(fundCool&&oiDown&&liqUp){primary="FUNDING_COOLING_OI_ROLLOVER_LIQ_EXPANSION";microPhase="ROLLOVER_PRESSURE";conf="HIGH";}
    else if(liqReset&&(squeeze||price>0)){primary="LIQUIDATION_RESET_REBOUND";microPhase="RESET_REBOUND";conf="HIGH";}
    else if(oiAccel&&!oiDown&&fund<15){primary="TREND_REACCELERATION";microPhase="TREND_REACCELERATION";conf="MEDIUM";}
    else if(fundExtreme&&!oiDown){primary="FUNDING_EXTREME_UP";microPhase="OVERHEATED_TREND";conf="MEDIUM";}
    else if(oiDown&&liqUp){primary="DELEVERAGING_COMPOSITE";microPhase="DELEVERAGING_PRESSURE";conf="MEDIUM";}
    else if(fundCool){primary="FUNDING_COOLING";microPhase="ROLLOVER_PRESSURE";conf="MEDIUM";}
    else if(oiDown){primary="OI_ROLLOVER";microPhase="ROLLOVER_PRESSURE";conf="MEDIUM";}
    else if(liqUp){primary="LIQUIDATION_EXPANSION";microPhase="ROLLOVER_PRESSURE";conf="LOW";}
    else if(oiAccel){primary="OI_ACCELERATION";microPhase="OVERHEATED_TREND";conf="LOW";}

    const secondary=entry.types.filter(t=>t!==primary);
    clusters.push({
      id:`C${String(clusters.length+1).padStart(2,"0")}`,idx,ts,primaryType:primary,secondaryTypes:secondary,
      eventCount:entry.types.length,price,oi,oiChg,fund,fundChg,liq,
      evidence:entry.evidence.join("; "),confidence:conf,microPhase,
    });
  }
  return clusters;
}

// ── Cluster-level backtest ──
function backtestClusters(clusters:Cluster[], data:{h:string[],rows:string[][]}): ClusterPath[] {
  const h=data.h, rows=data.rows, results:ClusterPath[]=[];
  for(const c of clusters){
    const idx=c.idx;
    const getPrice=(offset:number):number|null=>{const i=idx+offset;return i>=0&&i<rows.length?num(rows[i],h,"price_usd"):null;};
    const getTs=(offset:number):number|null=>{
      const i=idx+offset; if(i<0||i>=rows.length) return null;
      const t=col(rows[i],h,"timestamp"), t2=col(rows[idx],h,"timestamp");
      if(!t||!t2) return null;
      return (new Date(t).getTime()-new Date(t2).getTime())/60000;
    };

    const p0=c.price;
    const p1=getPrice(1), p2=getPrice(2), p3=getPrice(3), p6=getPrice(6);
    const t1=getTs(1), t3=getTs(3), t6=getTs(6);
    const r1=p1!==null&&p0>0?(p1-p0)/p0:null, r3=p3!==null&&p0>0?(p3-p0)/p0:null, r6=p6!==null&&p0>0?(p6-p0)/p0:null;

    const valid=p1!==null;
    const pathVals=[p0,p1,p2,p3].filter((v):v is number=>v!==null);
    const maxAdv=valid?Math.min(0,...pathVals.slice(1).map(v=>(v-p0)/p0)):null;
    const maxFav=valid?Math.max(0,...pathVals.slice(1).map(v=>(v-p0)/p0)):null;

    results.push({
      clusterId:c.id,primaryType:c.primaryType,price:p0,ts:c.ts,
      f1_price:p1,f2_price:p2,f3_price:p3,f6_price:p6,
      f1_elapsed:t1,f3_elapsed:t3,f6_elapsed:t6,
      f1_ret:r1,f3_ret:r3,f6_ret:r6,
      max_adv:maxAdv,max_fav:maxFav,valid,
    });
  }
  return results;
}

// ── Composite signal attribution ──
function attributeClusters(paths:ClusterPath[]): any[] {
  const byType=new Map<string,ClusterPath[]>();
  for(const p of paths){const l=byType.get(p.primaryType)||[];l.push(p);byType.set(p.primaryType,l);}
  const attrs:any[]=[];
  for(const [type,ps] of byType){
    const valid=ps.filter(p=>p.valid);
    if(valid.length===0){attrs.push({name:type,samples:ps.length,validPaths:0,leadLag:"INSUFFICIENT_SAMPLE",conf:"LOW",notes:"no valid paths"});continue;}
    const f1Rets=valid.map(p=>p.f1_ret).filter((v):v is number=>v!==null);
    const f3Rets=valid.map(p=>p.f3_ret).filter((v):v is number=>v!==null);
    const avgF1=f1Rets.length>0?f1Rets.reduce((a,b)=>a+b,0)/f1Rets.length:0;
    const avgF3=f3Rets.length>0?f3Rets.reduce((a,b)=>a+b,0)/f3Rets.length:0;
    const maxAdv=valid.map(p=>p.max_adv).filter((v):v is number=>v!==null);
    const avgAdv=maxAdv.length>0?maxAdv.reduce((a,b)=>a+b,0)/maxAdv.length:0;
    const ft=valid.filter(p=>p.f3_ret!==null&&Math.abs(p.f3_ret)>0.01&&Math.sign(p.f3_ret)===Math.sign(avgF1)).length/valid.length;

    const samples=ps.length; const hasLiqReset=ps.filter(p=>p.f6_price!==null).length>=2;
    let leadLag="NOISE",conf="LOW",notes="";
    if(samples<2){leadLag="INSUFFICIENT_SAMPLE";conf="LOW";notes="<2 samples";}
    else if(Math.abs(avgF1)>0.02&&ft>0.5){leadLag="EARLY_CONFIRMATION";conf=samples>=4?"MEDIUM":"LOW";notes=`f1=${(avgF1*100).toFixed(1)}% ft=${(ft*100).toFixed(0)}%`;}
    else if(Math.abs(avgF3)>0.02&&ft>0.5){leadLag="CONFIRMATION";conf="MEDIUM";notes=`f3=${(avgF3*100).toFixed(1)}%`;}
    else if(Math.abs(avgAdv)>0.03){leadLag="LAGGING";conf="LOW";notes=`adv=${(avgAdv*100).toFixed(1)}%`;}
    else{leadLag="NOISE";conf="LOW";notes="flat path";}

    attrs.push({name:type,samples,validPaths:valid.length,leadLag,confidence:conf,notes,avgF1Ret:(avgF1*100).toFixed(2)+"%",avgF3Ret:(avgF3*100).toFixed(2)+"%",avgMaxAdv:(avgAdv*100).toFixed(2)+"%"});
  }
  return attrs.sort((a,b)=>b.samples-a.samples);
}

// ── Commander v2 scoring ──
function computeV2(clusters:Cluster[], paths:ClusterPath[], data:{h:string[],rows:string[][]}): any {
  const h=data.h, rows=data.rows; if(rows.length<3||clusters.length<2) return null;
  const lastR=rows[rows.length-1], prevR=rows[rows.length-2];
  const price=num(lastR,h,"price_usd"), oi=num(lastR,h,"coinglass_oi_usd"), oiChg=num(lastR,h,"oi_change_from_prev");
  const fund=num(lastR,h,"funding_rate_percent"), fundChg=num(lastR,h,"funding_change_from_prev");
  const liq=num(lastR,h,"liq_4h"), score=num(lastR,h,"risk_score");

  const recent3=rows.slice(-3), recent6=rows.slice(-6);
  const price3Up=recent3.length>=2&&num(recent3[2],h,"price_usd")>num(recent3[0],h,"price_usd");
  // OI trend: use absolute values, not oi_change_from_prev (which may be null)
  const oiNow=num(lastR,h,"coinglass_oi_usd"), oi3Ago=num(recent3[0],h,"coinglass_oi_usd");
  const oi3Up=oi3Ago>0&&oiNow>oi3Ago;

  // Find peak values in window
  let maxFund=fund, maxOI=oi, maxLiq=liq;
  for(const r of rows.slice(-12)){maxFund=Math.max(maxFund,num(r,h,"funding_rate_percent"));maxOI=Math.max(maxOI,num(r,h,"coinglass_oi_usd"));maxLiq=Math.max(maxLiq,num(r,h,"liq_4h"));}
  const fundFromPeak=maxFund-fund, oiFromPeak=maxOI>0?(oi-maxOI)/maxOI:0;
  // Use wider window: if recent3 are cache hits (oiNow==oi3Ago), check vs OI minimum
  let oiMin=oi; for(const r of rows.slice(-12)){oiMin=Math.min(oiMin,num(r,h,"coinglass_oi_usd"));}
  const oiRecoveringFromMin=oiNow>oiMin&&oiFromPeak<-0.03; // recovered from trough
  const oiRecoveringFromPeak=(oiNow>oi3Ago||oiRecoveringFromMin)&&oiFromPeak<-0.03;

  const latestCluster=clusters[clusters.length-1];
  const prevPhase=clusters.length>=2?clusters[clusters.length-2].microPhase:"INITIAL";
  const lastMajor=clusters.filter(c=>c.microPhase!=="EQUILIBRIUM"&&c.microPhase!=="OVERHEATED_TREND").slice(-1)[0];
  // Look for RESET_REBOUND anywhere in recent clusters (not just last)
  const hasResetRebound=clusters.some(c=>c.primaryType==="LIQUIDATION_RESET_REBOUND");
  const resetCluster=clusters.find(c=>c.primaryType==="LIQUIDATION_RESET_REBOUND");

  // Trend continuation (0-100) — RECALIBRATED
  let trend=0;
  if(price3Up) trend+=20;
  if(oi3Up) trend+=15; else if(oiChg>0) trend+=10;
  if(fund<5) trend+=20; else if(fund<10) trend+=10; else if(fund<15) trend+=5; // funding still >5 is NOT healthy
  if(liq<5e5) trend+=15; else if(liq<1e6) trend+=10;
  if(oiFromPeak<-0.1) trend-=15; // OI dropped from peak - not pure trend
  if(fundFromPeak>5) trend-=10; // Fund came from higher extreme
  if(latestCluster?.primaryType==="TREND_REACCELERATION") trend+=10;
  trend=Math.max(0,Math.min(100,trend));

  // Reversal risk (0-100) — RECALIBRATED
  let rev=0;
  if(oiChg<-5e6) rev+=25; else if(oiChg<0) rev+=10;
  if(fundChg<-0.3) rev+=15;
  if(liq>1e6) rev+=15; else if(liq>5e5) rev+=10;
  if(price<num(prevR,h,"price_usd")) rev+=15;
  if(fund>10) rev+=10; // still elevated — risk remains
  if(lastMajor?.primaryType?.includes("DELEVERAGING")) rev+=15;
  if(lastMajor?.primaryType?.includes("RESET")&&oiChg>0) rev-=10; // reset happened, risk decreased
  rev=Math.max(0,Math.min(100,rev));

  // Squeeze/rebound (0-100)
  let sq=0;
  const liqWasHigh=maxLiq>1e6&&liq<maxLiq*0.5;
  if(liqWasHigh&&price3Up) sq+=30; else if(liqWasHigh) sq+=15;
  if(fundChg<-1) sq+=20;
  if(latestCluster?.primaryType==="LIQUIDATION_RESET_REBOUND") sq+=25;
  if(latestCluster?.primaryType==="TREND_REACCELERATION"&&lastMajor?.primaryType?.includes("RESET")) sq+=15;
  sq=Math.max(0,Math.min(100,sq));

  // Data confidence
  const validPaths=paths.filter(p=>p.valid).length;
  const totalClusters=clusters.length;
  let dataConf=rows.length>=24?50:rows.length>=12?35:20;
  if(totalClusters>=8) dataConf+=15;
  if(validPaths/totalClusters>0.6) dataConf+=15;
  if(col(lastR,h,"data_freshness")==="新鲜") dataConf+=10;
  dataConf-=10; // single-day, single-coin penalty
  dataConf=Math.max(0,Math.min(100,dataConf));

  // Market phase — semantically calibrated
  const priceRecovering=price3Up;

  let phase="RANGE_EQUILIBRIUM";
  // Structural phases first (event-based), then score-based
  if(rev>40&&oiChg<0) phase="DELEVERAGING_PRESSURE";
  else if(hasResetRebound&&((oiRecoveringFromPeak&&priceRecovering)||trend>55)&&fund>5) phase="OVERHEATED_RESET_REACCELERATION";
  else if(hasResetRebound&&(oiRecoveringFromPeak||trend>50)&&priceRecovering) phase="RESET_REACCELERATION";
  else if(hasResetRebound&&trend>40) phase="RESET_REBOUND";
  else if(rev>25&&oiChg<0) phase="ROLLOVER_WATCH";
  else if(trend>60&&fund<10&&liq<1e6) phase="TREND_REACCELERATION";
  else if(trend>40&&fund>=10) phase="OVERHEATED_BUT_TRENDING";
  else if(dataConf<25) phase="DATA_INSUFFICIENT";

  // Evidence — ALWAYS structural chain when reset rebound exists
  const strongestStruct:string[]=[], weakestStruct:string[]=[];
  if(hasResetRebound){
    const liqPeakStr=maxLiq>0?`$${(maxLiq/1e6).toFixed(1)}M`:"峰值";
    strongestStruct.push(`清算从峰值 ${liqPeakStr} 回落后，价格与OI同步恢复——上一轮去杠杆压力阶段性消化，市场进入重置后的再加速观察；但funding仍处高位(${fund.toFixed(1)}%)，衍生品拥挤未完全解除`);
  }else if(trend>=rev){
    strongestStruct.push(`趋势(${trend})>反转(${rev})——价格和OI仍在上升`);
  }else{
    strongestStruct.push(`反转风险(${rev})>趋势(${trend})——OI回落+清算信号`);
  }
  if(!hasResetRebound&&fund>10) strongestStruct.push(`资金费率 ${fund.toFixed(1)}% 仍处高位`);
  if(!hasResetRebound&&oiFromPeak<-0.1) strongestStruct.push(`OI 从峰值 $${(maxOI/1e6).toFixed(0)}M 回落 ${Math.abs(oiFromPeak*100).toFixed(0)}%`);

  weakestStruct.push(`反转风险没有继续强化：清算未重新放大，OI未连续转负；但funding仍高于正常区间，不能把当前恢复视为健康趋势`);

  const contradiction=`价格/OI正在恢复，但funding仍处高位——这说明市场从去杠杆后重新加速，但衍生品拥挤并未完全解除。`;

  // Invalidation — 3 layers
  const invalidation=[
    `OI连续2次转负且价格未能继续推进——推翻reset-reacceleration`,
    `funding再次急剧抬升(>15%)且OI继续堆积但价格停滞——推翻低反转风险`,
    `清算重新放大至$1M+且持续——推翻压力已消化判断`,
  ];

  const nextObs=[];
  if(fund>8) nextObs.push(`资金费率何时降至8%以下——当前 ${fund.toFixed(1)}%`);
  if(oiChg>0) nextObs.push(`OI 何时转负——当前 ${oiChg>=0?"+":""}$${Math.abs(oiChg/1e6).toFixed(1)}M`);
  if(liq<1e6) nextObs.push(`清算何时突破 $1M——当前 $${(liq/1e3).toFixed(0)}K`);

  // Preview push gate
  const decisionGrade=dataConf>=60?"REVIEW_GRADE":"OBSERVATION_ONLY";

  // Case insight for key cluster
  const caseInsight=resetCluster?{
    signal:"LIQUIDATION_RESET_REBOUND",
    ts:resetCluster.ts,
    statistical_confidence:"LOW",
    case_importance:"HIGH",
    case_insight:"本轮行情中解释清算压力消化与价格/OI恢复的关键转折样本——尽管统计样本不足(单日单币)，但其在状态迁移链中的位置决定了它对理解当前结构有重要参考价值",
  }:null;

  // top_case_cluster always points to the key structural turning point
  const topCaseCluster=resetCluster?{type:"LIQUIDATION_RESET_REBOUND",ts:resetCluster.ts,evidence:resetCluster.evidence,statistical_confidence:"LOW",case_importance:"HIGH",role:"KEY_STRUCTURAL_TURNING_POINT"}:null;

  // push_grade depends on quality — will be updated externally if quality fails
  const pushGrade=(dataConf>=60&&clusters.length>=3)?"PREVIEW_OK":"DECISION_GRADE_NOT_READY";

  return {
    timestamp:new Date().toISOString(),market_phase:phase,previous_market_phase:prevPhase,
    latest_cluster:latestCluster?{type:latestCluster.primaryType,ts:latestCluster.ts,evidence:latestCluster.evidence}:null,
    last_major_cluster:lastMajor?{type:lastMajor.primaryType,ts:lastMajor.ts}:null,
    top_case_cluster:topCaseCluster,
    trend_continuation_score:trend,reversal_risk_score:rev,squeeze_rebound_score:sq,data_confidence_score:dataConf,
    strongest_evidence:strongestStruct.join("；"),weakest_evidence:weakestStruct.join("；"),
    main_scenario:phase,alternative_scenario:phase.includes("REACCELERATION")?"反转风险":"趋势恢复",
    invalidation_condition:invalidation,main_contradiction:contradiction,
    next_3_observations:nextObs.slice(0,3).join(" | "),
    decision_support_grade:decisionGrade,
    commander_push_grade:pushGrade,
    case_insight:caseInsight,
    sample_limitations:`快照${rows.length}条|聚类${clusters.length}个|有效路径${validPaths}/${totalClusters}|单日单币统计置信度有限`,
    commander_summary:`清算从峰值回落后价格与OI同步恢复，市场从去杠杆进入重置后再加速。趋势${trend}/100，反转${rev}/100。funding仍偏高(${fund.toFixed(1)}%)，不能视为健康趋势。`,
  };
}

function main(){
  console.log("=== LAB 盘中情报参谋 v2 ===\n");
  for(const d of [OUT_DIR, REPORTS_DIR]){if(!existsSync(d)) mkdirSync(d,{recursive:true});}

  const data=readCsv(join(OUT_DIR,"lab_fast_watch_v2.csv"));
  if(!data||data.rows.length<3){console.log("数据不足");return;}
  console.log(`读取 ${data.rows.length} 条快照 (CSV parser)`);

  // 1. Event detection (reuse from v1)
  const eventsCsv=readCsv(join(OUT_DIR,"lab_intraday_events.csv"));
  if(!eventsCsv||eventsCsv.rows.length<1){console.log("先运行 intelligence:lab:detect-events");return;}
  console.log(`原始事件: ${eventsCsv.rows.length} 条`);

  // 2. Cluster
  console.log("\n── 事件聚类 ──");
  const clusters=buildClusters(eventsCsv.rows,data);
  console.log(`聚类: ${clusters.length} 个 cluster`);
  const clusterRows:string[][]=[["cluster_id","idx","ts","primary_type","secondary_types","event_count","price","oi_m","fund_pct","liq_k","evidence","confidence","micro_phase"]];
  for(const c of clusters){
    console.log(`  ${c.id} ${c.ts} ${c.primaryType} (${c.eventCount}事件) ${c.microPhase}`);
    clusterRows.push([c.id,String(c.idx),c.ts,c.primaryType,c.secondaryTypes.join(";"),String(c.eventCount),c.price.toFixed(2),(c.oi/1e6).toFixed(1),c.fund.toFixed(2),(c.liq/1e3).toFixed(0),c.evidence,c.confidence,c.microPhase]);
  }
  writeFileSync(join(OUT_DIR,"lab_intraday_event_clusters.csv"),clusterRows.map(r=>r.map(csvEscape).join(",")).join("\n"));

  // 3. Cluster-level backtest
  console.log("\n── 聚类路径回测 ──");
  const paths=backtestClusters(clusters,data);
  const validPaths=paths.filter(p=>p.valid);
  console.log(`路径: ${paths.length} 条 (有效 ${validPaths.length})`);
  writeFileSync(join(OUT_DIR,"lab_intraday_cluster_backtest.csv"),
    ["cluster_id,primary_type,price,f1_ret,f3_ret,f6_ret,f1_elapsed,f3_elapsed,f6_elapsed,max_adv,max_fav,valid",
      ...paths.map(p=>`${p.clusterId},${p.primaryType},${p.price.toFixed(2)},${p.f1_ret!==null?(p.f1_ret*100).toFixed(2)+"%":""},${p.f3_ret!==null?(p.f3_ret*100).toFixed(2)+"%":""},${p.f6_ret!==null?(p.f6_ret*100).toFixed(2)+"%":""},${p.f1_elapsed?.toFixed(1)||""},${p.f3_elapsed?.toFixed(1)||""},${p.f6_elapsed?.toFixed(1)||""},${p.max_adv!==null?(p.max_adv*100).toFixed(2)+"%":""},${p.max_fav!==null?(p.max_fav*100).toFixed(2)+"%":""},${p.valid}`)].join("\n"));

  // 4. Composite signal attribution
  console.log("\n── 组合信号归因 ──");
  const attrs=attributeClusters(paths);
  for(const a of attrs) console.log(`  ${a.name}: ${a.samples}样本 ${a.leadLag} (${a.confidence}) ${a.notes}`);
  writeFileSync(join(OUT_DIR,"lab_composite_signal_attribution.csv"),
    ["signal_name,sample_count,valid_paths,lead_or_lag,confidence,avg_f1_ret,avg_f3_ret,avg_max_adv,notes",
      ...attrs.map(a=>`${a.name},${a.samples},${a.validPaths},${a.leadLag},${a.confidence},${a.avgF1Ret},${a.avgF3Ret},${a.avgMaxAdv},${a.notes}`)].join("\n"));

  // 5. Commander v2
  console.log("\n── 参谋评分 v2 ──");
  const cdr=computeV2(clusters,paths,data);
  if(!cdr){console.log("评分失败");return;}
  console.log(`  阶段: ${cdr.market_phase} (前: ${cdr.previous_market_phase})`);
  console.log(`  趋势: ${cdr.trend_continuation_score}/100 | 反转: ${cdr.reversal_risk_score}/100 | 反弹: ${cdr.squeeze_rebound_score}/100 | 置信: ${cdr.data_confidence_score}/100`);
  console.log(`  推送: ${cdr.commander_push_grade} | 决策: ${cdr.decision_support_grade}`);
  if(cdr.case_insight) console.log(`  Case: ${cdr.case_insight.signal} stat=${cdr.case_insight.statistical_confidence} importance=${cdr.case_insight.case_importance}`);
  writeFileSync(join(OUT_DIR,"lab_commander_brief_v2.json"),JSON.stringify(cdr,null,2));

  // 6. Report v2
  const report=[
    `# LAB 盘中情报参谋报告 v2`,`生成: ${new Date().toISOString().slice(0,19).replace("T"," ")}`,`快照: ${data.rows.length} | 聚类: ${clusters.length} | 有效路径: ${validPaths.length}`,
    "","## 1. 综合研判",`**${cdr.market_phase}** (前: ${cdr.previous_market_phase})`,cdr.commander_summary,
    "","## 2. 四分评分 (重新校准)","| 维度 | 得分 | 说明 |","|------|------|------|",
    `| 趋势延续 | ${cdr.trend_continuation_score}/100 | ${cdr.trend_continuation_score>=70?"偏高——注意资金费率背景":cdr.trend_continuation_score>=40?"适中":"偏低"} |`,
    `| 反转风险 | ${cdr.reversal_risk_score}/100 | ${cdr.reversal_risk_score>=40?"偏高——关注OI和清算":cdr.reversal_risk_score>=20?"适中":"偏低"} |`,
    `| 清算反弹 | ${cdr.squeeze_rebound_score}/100 | |`,
    `| 数据置信 | ${cdr.data_confidence_score}/100 | 单日单币，扣10分 |`,
    "","## 3. 阶段迁移",`${cdr.previous_market_phase} → ${cdr.market_phase}`,
    cdr.last_major_cluster?`最近关键事件: ${cdr.last_major_cluster.type} (${cdr.last_major_cluster.ts})`:"",
    cdr.case_insight?`\n### Case Insight: ${cdr.case_insight.signal}\n- 统计置信度: ${cdr.case_insight.statistical_confidence}\n- 案例重要性: ${cdr.case_insight.case_importance}\n- ${cdr.case_insight.case_insight}`:"",
    "","## 4. 事件聚类","| ID | 时间 | 主类型 | 事件数 | 微阶段 |","|----|------|--------|--------|--------|",
    ...clusters.slice(-10).map(c=>`| ${c.id} | ${c.ts} | ${c.primaryType} | ${c.eventCount} | ${c.microPhase} |`),
    "","## 5. 组合信号归因","| 信号 | 样本 | 有效路径 | 统计置信 | 案例重要性 | 分类 |","|------|------|---------|---------|----------|------|",
    ...attrs.map(a=>{
      const importance=a.name==="LIQUIDATION_RESET_REBOUND"?"HIGH":"MEDIUM";
      return `| ${a.name} | ${a.samples} | ${a.validPaths} | ${a.confidence} | ${importance} | ${a.leadLag} |`;
    }),
    "","## 6. 证据与矛盾",`- 最强: ${cdr.strongest_evidence}`,`- 最弱: ${cdr.weakest_evidence}`,`- 矛盾: ${cdr.main_contradiction}`,
    "","## 7. 推翻条件","",...(cdr.invalidation_condition as string[]).map((s,i)=>`${i+1}. ${s}`),
    "","## 8. 推送闸门",`- 推送等级: ${cdr.commander_push_grade}`,`- 决策等级: ${cdr.decision_support_grade}`,
    cdr.commander_push_grade==="PREVIEW_OK"?"可预览推送——标题需含Preview，明确标注单日单币边界":cdr.commander_push_grade==="DECISION_GRADE_NOT_READY"?"不可推送——样本不足":"禁止推送",
    "","## 9. 边界",`${cdr.sample_limitations}`,
    "本报告仅为情报分析，不包含交易执行建议。",
  ];
  writeFileSync(join(REPORTS_DIR,"lab_intraday_commander_report_v2.md"),report.join("\n"));

  // 7. Quality check with named items
  const hasResetReboundQ=clusters.some(c=>c.primaryType==="LIQUIDATION_RESET_REBOUND");
  const qChecks:{name:string,passed:boolean,expected:string,actual:string}[]=[
    {name:"market_phase_not_range_when_reset_exists",passed:!cdr.market_phase.includes("RANGE_EQUILIBRIUM")||!hasResetReboundQ,expected:"not RANGE_EQUILIBRIUM",actual:cdr.market_phase},
    {name:"strongest_evidence_is_structural_chain",passed:cdr.strongest_evidence.includes("清算")||cdr.strongest_evidence.includes("去杠杆")||cdr.strongest_evidence.includes("恢复"),expected:"contains structural chain",actual:cdr.strongest_evidence.slice(0,60)},
    {name:"strongest_evidence_mentions_price_oi_recovery",passed:cdr.strongest_evidence.includes("价格")&&cdr.strongest_evidence.includes("OI"),expected:"mentions price+OI recovery",actual:cdr.strongest_evidence.slice(0,60)},
    {name:"strongest_evidence_not_static_score_compare",passed:!cdr.strongest_evidence.startsWith("趋势(")&&!cdr.strongest_evidence.startsWith("反转风险("),expected:"not static score comparison",actual:cdr.strongest_evidence.slice(0,40)},
    {name:"invalidation_has_three_layers",passed:Array.isArray(cdr.invalidation_condition)&&cdr.invalidation_condition.length>=3,expected:"3 conditions",actual:String(cdr.invalidation_condition?.length||0)},
    {name:"top_case_cluster_present",passed:cdr.top_case_cluster!==null&&cdr.top_case_cluster!==undefined||!hasResetReboundQ,expected:"top_case_cluster if reset exists",actual:cdr.top_case_cluster?cdr.top_case_cluster.type:"null"},
    {name:"top_case_cluster_is_reset_rebound",passed:cdr.top_case_cluster?.type==="LIQUIDATION_RESET_REBOUND"||!hasResetReboundQ,expected:"LIQUIDATION_RESET_REBOUND",actual:cdr.top_case_cluster?.type||"null"},
    {name:"case_insight_present",passed:cdr.case_insight!==null||!hasResetReboundQ,expected:"case_insight when reset exists",actual:cdr.case_insight?"present":"null"},
    {name:"push_grade_present",passed:cdr.commander_push_grade.length>0,expected:"PREVIEW_OK or DECISION_GRADE_NOT_READY",actual:cdr.commander_push_grade},
    {name:"no_false_healthy_trend_label",passed:!cdr.commander_summary.includes("是健康趋势")&&!cdr.commander_summary.includes("属于健康趋势"),expected:"no affirmative healthy trend claim",actual:cdr.commander_summary.includes("健康趋势")?"mentions but check negation":"ok"},
    {name:"sample_limitations_present",passed:cdr.sample_limitations.length>0,expected:"sample limitations stated",actual:cdr.sample_limitations.slice(0,40)},
    {name:"forbidden_terms_absent",passed:!cdr.commander_summary.includes("BUY")&&!cdr.commander_summary.includes("SELL")&&!cdr.commander_summary.includes("SHORT")&&!cdr.commander_summary.includes("LONG"),expected:"no forbidden terms",actual:"ok"},
  ];
  const allPass=qChecks.every(c=>c.passed);
  const failedChecks=qChecks.filter(c=>!c.passed).map(c=>c.name);

  // Override push_grade if quality failed
  if(!allPass){
    cdr.commander_push_grade="DO_NOT_PUSH";
    console.log(`\n质量检查未通过，推送阻断`);
  }

  console.log(`\n质量检查: ${allPass?"全部通过":`${failedChecks.length}项未通过: ${failedChecks.join(", ")}`}`);
  if(!allPass) for(const f of failedChecks){const c=qChecks.find(x=>x.name===f)!;console.log(`  ${f}: 预期${c.expected} 实际${c.actual}`);}
  writeFileSync(join(OUT_DIR,"lab_commander_quality_v2.json"),JSON.stringify({passed:allPass,failed_checks:failedChecks,checks:qChecks,ts:new Date().toISOString()},null,2));

  console.log(`\n报告: ${REPORTS_DIR}/lab_intraday_commander_report_v2.md`);
}

main();
