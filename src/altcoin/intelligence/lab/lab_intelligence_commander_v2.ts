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
  const oi3Up=recent3.length>=2&&num(recent3[2],h,"coinglass_oi_usd")>num(recent3[0],h,"coinglass_oi_usd");

  // Find peak values in window
  let maxFund=fund, maxOI=oi, maxLiq=liq;
  for(const r of rows.slice(-12)){maxFund=Math.max(maxFund,num(r,h,"funding_rate_percent"));maxOI=Math.max(maxOI,num(r,h,"coinglass_oi_usd"));maxLiq=Math.max(maxLiq,num(r,h,"liq_4h"));}
  const fundFromPeak=maxFund-fund, oiFromPeak=maxOI>0?(oi-maxOI)/maxOI:0;

  const latestCluster=clusters[clusters.length-1];
  const prevPhase=clusters.length>=2?clusters[clusters.length-2].microPhase:"INITIAL";
  const lastMajor=clusters.filter(c=>c.microPhase!=="EQUILIBRIUM"&&c.microPhase!=="OVERHEATED_TREND").slice(-1)[0];

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

  // Market phase
  let phase="RANGE_EQUILIBRIUM";
  if(rev>40&&oiChg<0) phase="DELEVERAGING_PRESSURE";
  else if(rev>25&&oiChg<0) phase="ROLLOVER_WATCH";
  else if(lastMajor?.primaryType==="LIQUIDATION_RESET_REBOUND"&&trend>50) phase="RESET_REBOUND";
  else if(trend>60&&fund<10&&liq<1e6) phase="TREND_REACCELERATION";
  else if(trend>40&&fund>=10) phase="OVERHEATED_BUT_TRENDING";
  else if(dataConf<25) phase="DATA_INSUFFICIENT";
  else phase="RANGE_EQUILIBRIUM";

  // Evidence
  const strongest:string[]=[], weakest:string[]=[];
  if(trend>=rev){strongest.push(`趋势(${trend})>反转(${rev})——价格和OI仍在上升`);weakest.push(`反转风险证据不足——但资金费率仍偏高`);}
  else{strongest.push(`反转风险(${rev})>趋势(${trend})——OI回落+清算信号`);weakest.push(`趋势信号减弱`);}
  if(fund>10) strongest.push(`资金费率 ${fund.toFixed(1)}% 仍处高位（从峰值 ${maxFund.toFixed(1)}% 回落 ${fundFromPeak.toFixed(1)}%）`);
  if(liqWasHigh) strongest.push(`清算从峰值 $${(maxLiq/1e6).toFixed(1)}M 回落至 $${(liq/1e6).toFixed(2)}M`);
  if(oiFromPeak<-0.1) strongest.push(`OI 从峰值 $${(maxOI/1e6).toFixed(0)}M 回落 ${Math.abs(oiFromPeak*100).toFixed(0)}%`);

  const contradiction=`${phase}: 趋势${trend} vs 反转${rev}。${fund>8?"资金费率仍偏高，不能视为健康趋势。":"资金费率正常。"}${lastMajor?"最近关键事件: "+lastMajor.primaryType+"。"+lastMajor.ts:""}`;
  const invalidation=phase.includes("TREND")?`OI 转负且连续2次下降`:`OI 重新上升且清算回落`;

  const nextObs=[];
  if(fund>8) nextObs.push(`资金费率何时降至8%以下——当前 ${fund.toFixed(1)}%`);
  if(oiChg>0) nextObs.push(`OI 何时转负——当前 ${oiChg>=0?"+":""}$${Math.abs(oiChg/1e6).toFixed(1)}M`);
  if(liq<1e6) nextObs.push(`清算何时突破 $1M——当前 $${(liq/1e3).toFixed(0)}K`);
  if(validPaths<totalClusters*0.3) nextObs.push(`需要更多快照提升路径置信度`);

  return {
    timestamp:new Date().toISOString(),market_phase:phase,previous_market_phase:prevPhase,
    latest_cluster:latestCluster?{type:latestCluster.primaryType,ts:latestCluster.ts,evidence:latestCluster.evidence}:null,
    last_major_cluster:lastMajor?{type:lastMajor.primaryType,ts:lastMajor.ts}:null,
    trend_continuation_score:trend,reversal_risk_score:rev,squeeze_rebound_score:sq,data_confidence_score:dataConf,
    strongest_evidence:strongest.join("；"),weakest_evidence:weakest.join("；"),
    main_scenario:phase,alternative_scenario:phase.includes("TREND")?"反转风险":"趋势恢复",
    invalidation_condition:invalidation,main_contradiction:contradiction,
    next_3_observations:nextObs.slice(0,3).join(" | "),
    decision_support_grade:dataConf>=50?"REVIEW_GRADE":"OBSERVATION_ONLY",
    sample_limitations:`快照${rows.length}条|聚类${clusters.length}个|有效路径${validPaths}/${totalClusters}|单日单币`,
    commander_summary:`${phase}。趋势${trend}/100，反转风险${rev}/100。${strongest[0]||""}。${contradiction}`,
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
  console.log(`  等级: ${cdr.decision_support_grade}`);
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
    "","## 4. 事件聚类","| ID | 时间 | 主类型 | 事件数 | 微阶段 |","|----|------|--------|--------|--------|",
    ...clusters.slice(-10).map(c=>`| ${c.id} | ${c.ts} | ${c.primaryType} | ${c.eventCount} | ${c.microPhase} |`),
    "","## 5. 组合信号归因","| 信号 | 样本 | 有效路径 | 分类 | 置信度 |","|------|------|---------|------|--------|",
    ...attrs.map(a=>`| ${a.name} | ${a.samples} | ${a.validPaths} | ${a.leadLag} | ${a.confidence} |`),
    "","## 6. 证据与矛盾",`- 最强: ${cdr.strongest_evidence}`,`- 最弱: ${cdr.weakest_evidence}`,`- 矛盾: ${cdr.main_contradiction}`,
    "","## 7. 情景推演",`- 主情景: ${cdr.main_scenario}`,`- 替代: ${cdr.alternative_scenario}`,`- 推翻: ${cdr.invalidation_condition}`,
    "","## 8. 边界",`${cdr.sample_limitations} | 等级: ${cdr.decision_support_grade}`,
    "本报告仅为情报分析，不包含交易执行建议。",
  ];
  writeFileSync(join(REPORTS_DIR,"lab_intraday_commander_report_v2.md"),report.join("\n"));

  // 7. Quality check
  const checks=[
    cdr.trend_continuation_score>=0&&cdr.trend_continuation_score<=100,
    cdr.reversal_risk_score>=0&&cdr.reversal_risk_score<=100,
    cdr.squeeze_rebound_score>=0&&cdr.squeeze_rebound_score<=100,
    cdr.data_confidence_score>=0&&cdr.data_confidence_score<=100,
    cdr.strongest_evidence.length>0,cdr.weakest_evidence.length>0,
    cdr.main_contradiction.length>0,cdr.next_3_observations.length>0,
    cdr.invalidation_condition.length>0,cdr.market_phase.length>0,
    clusters.length>0,validPaths.length>0,
    cdr.trend_continuation_score<95||cdr.market_phase!=="TREND_CONTINUATION", // v1 had 95 TREND — v2 must not
    !cdr.commander_summary.includes("健康趋势")||cdr.market_phase.includes("HEALTHY"), // no false healthy label
  ];
  const allPass=checks.every(c=>c);
  console.log(`\n质量检查: ${allPass?"全部通过":`${checks.filter(c=>!c).length}项未通过`}`);
  for(let i=0;i<checks.length;i++){if(!checks[i])console.log(`  未通过: 检查项${i+1}`);}
  writeFileSync(join(OUT_DIR,"lab_commander_quality.json"),JSON.stringify({passed:allPass,checks,ts:new Date().toISOString()}));

  console.log(`\n报告: ${REPORTS_DIR}/lab_intraday_commander_report_v2.md`);
}

main();
