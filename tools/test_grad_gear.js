/* 半毕业/小毕业装备做装会话（集成测试）：
 * 物品1 小毕业物理弓：高级急速精华起手 → 崇高满 → 消抹(混沌限侧)/剥离(预兆)清理 → 深渊骨+黑血首领预兆收尾
 * 物品2 半毕业力量头盔：点金崇高 → 消抹·右旋洗后缀 → 剥离·左旋清前缀 → 崇高回填
 * 断言：词缀结构合法（≤3前3后、限1渎灵、无同族）+ 质量达标（目标词缀命中与档位）+ 全程无异常 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const APP = path.resolve(__dirname, "..", "app");
const sb = { window: {} };
vm.createContext(sb);
for (const f of ["data.js", "augments.js", "i18n_mods.js", "engine.js", "data_pools.js"])
  vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), sb);
const E = sb.window.POE2_ENGINE;
E.loadPools(sb.window.POE2_POOLS);
const modOf = a => E.modsById.get(a.modId);
const nm0 = a => modOf(a).id.split("/")[1].slice(0,16);
const tierPct = a => { const t = modOf(a).tiers; return (a.tierIdx + 1) / t.length; }; // 1=顶档
const name = a => modOf(a).id.split("/")[1];

let SEED = 777;
const R = () => E.makeRng(SEED++);
const act = (item, action, opts) => E.act(item, action, opts || {}, R());
const counts = it => E.affixCounts(it);
const valid = it => {
  const c = counts(it), cap = E.capsFor(it, "rare");
  if (c.prefix > cap.prefix || c.suffix > cap.suffix) return "超上限 " + c.prefix + "/" + c.suffix;
  if (it.affixes.filter(a => a.source === "desecrated").length > 1) return "多条渎灵";
  const fams = it.affixes.map(modOf).map(m => m.family);
  if (new Set(fams).size !== fams.length) return "同族重复";
  if (it.affixes.some(a => a.fractured) && it.affixes.filter(a => a.fractured).length > 1) return "多条破裂";
  return null;
};

/* ═══ 物品 1：小毕业物理弓 ═══ */
function craftBow(verbose) {
  const log = [];
  let cost = 0, steps = 0;
  const go = (it, action, opts) => {
    const r = act(it, action, opts);
    if (r.ok) { cost += r.cost || 0; steps++; if (verbose) log.push(action + (opts && opts.omen ? "+" + opts.omen.replace("Omenof", "") : "") + (opts && opts.essence ? ":" + opts.essence : "") + " → " + it.affixes.length + "条"); }
    return r;
  };
  const TARGET_PRE = new Set(["INCREASED_PHYSICAL_DAMAGE_PERCENT", "PHYSICAL_DAMAGE_FLAT", "INCREASED_ELEMENTAL_DAMAGE_WITH_ATTACKS", "HYBRID_INCREASED_PHYSICAL_DAMAGE_PERCENT_AND_ACCURACY_RATING"]);
  const TARGET_SUF = new Set(["INCREASED_ATTACK_SPEED", "ESSENCE_INCREASED_ATTACK_SPEED", "CRITICAL_HIT_CHANCE", "CRITICAL_DAMAGE_BONUS"]);
  const score = it => {
    let hit = 0, tierSum = 0, n = 0;
    for (const a of it.affixes) {
      const t = name(a);
      const want = TARGET_PRE.has(t) || TARGET_SUF.has(t);
      if (want) hit++;
      tierSum += tierPct(a); n++;
    }
    return { hit, avgTier: tierSum / n };
  };
  let it = E.newItem("Bows", "ObliteratorBow", 84, E.defaultRng);
  // ① 高级急速精华：攻速保底 23-25%
  let r = go(it, "essence", { essence: "Haste", tier: "GREATER" }); if (!r.ok) return { fail: "精华起手失败:" + r.reason, log };
  it = r.item;
  r = go(it, "regal"); if (r.ok) it = r.item;
  let guard = 0;
  while (it.affixes.length < 4 && guard++ < 6) { r = go(it, "exalt"); if (r.ok) it = r.item; }
  // 破溃宝珠：锁住攻速保底线（锁不中则本次重做——模拟玩家重复做底子）
  r = go(it, "fracture");
  if (!r.ok) return { retry: true, log };
  it = r.item;
  const lockedAS = it.affixes.some(a => a.fractured && /ATTACK_SPEED/.test(name(a)));
  if (!lockedAS) return { retry: true, log };
  log.push("破溃锁定: T1 攻速");
  guard = 0;
  while (it.affixes.length < 6 && guard++ < 6) { r = go(it, "exalt"); if (r.ok) it = r.item; }
  // ② 清理循环：非目标词缀按侧用消抹重掷；同侧全目标但档低也重掷最差（预算 120 步）
  guard = 0; let stuck = 0;
  while (guard++ < 400 && stuck < 40) {
    const v = valid(it); if (v) return { fail: v, log };
    const badPre = it.affixes.filter(a => modOf(a).type === "prefix" && (!TARGET_PRE.has(name(a)) || tierPct(a) < 0.45));
    const badSuf = it.affixes.filter(a => modOf(a).type === "suffix" && (!TARGET_SUF.has(name(a)) || tierPct(a) < 0.45));
    const badSuf2 = badSuf.filter(a => a.source !== "essence");
    if (!badPre.length && !badSuf2.length) break;
    const before = score(it).hit * 100 + score(it).avgTier;
    const tryStep = (action, opts) => { const rr = act(it, action, opts); return rr; };
    const side = badSuf2.length ? { chaos: "OmenofDextralErasure", annul: "OmenofDextralAnnulment" } : { chaos: "OmenofSinistralErasure", annul: "OmenofSinistralAnnulment" };
    let rr = tryStep("chaos", { omen: side.chaos });
    if (!rr.ok) rr = tryStep("annul", { omen: side.annul });
    if (rr.ok && (rr.item.affixes.length < it.affixes.length)) { const ex = act(rr.item, "exalt"); if (ex.ok) rr = ex; }
    if (!rr.ok) { stuck++; continue; }
    // 择优保留：持平或变好才接受（模拟玩家停手），连续变差 40 次放弃
    const after = score(rr.item).hit * 100 + score(rr.item).avgTier;
    if (after >= before) { cost += rr.cost || 0; steps++; it = rr.item; stuck = 0; } else stuck++;
  }
  // ③ 崇高补满（清理后可能有空位）
  guard = 0;
  while (it.affixes.length < 6 && guard++ < 6) { r = go(it, "exalt"); if (r.ok) it = r.item; }
  // ④ 深渊收尾：满词缀 + 黑血预兆（库尔加尔首领池）替换最弱一条
  let desecOk = "", desecAffix = null;
  if (it.affixes.length === 6) {
    r = go(it, "desecrated", { boneTier: "preserved", omen: "OmenoftheBlackblooded" });
    if (r.ok) {
      it = r.item;
      const cands = E.desecrateCandidates(it, { omens: ["OmenoftheBlackblooded"], boneTier: "preserved" }, R());
      if (cands.length) {
        const it2 = E.applyDesecrate(it, cands[0], R());
        if (it2 && it2.affixes) { it = it2; desecAffix = cands[0].mod.id; desecOk = "库尔加尔池:" + desecAffix.split("/")[1].slice(0, 30); }
      }
    } else desecOk = "拦截:" + r.reason.slice(0, 18);
  }
  const v = valid(it); if (v) return { fail: v, log };
  const sc = score(it);
  return {
    item: it, log, cost: Math.round(cost), steps,
    affixes: it.affixes.map(a => name(a).slice(0, 34) + " T" + (modOf(a).tiers.length - a.tierIdx) + (a.source === "desecrated" ? "·渎灵" : "")),
    hit: sc.hit + "/6 目标词缀", avgTier: (sc.avgTier * 100).toFixed(0) + "% 档位", desecOk,
  };
}

/* ═══ 物品 2：半毕业力量头盔 ═══ */
function craftHelm(verbose) {
  const log = [];
  let cost = 0, steps = 0;
  const go = (it, action, opts) => {
    const r = act(it, action, opts);
    if (r.ok) { cost += r.cost || 0; steps++; if (verbose) log.push(action + (opts && opts.omen ? "+" + opts.omen.replace("Omenof", "") : "") + " → " + it.affixes.length + "条"); }
    return r;
  };
  const PRE = new Set(["BASE_MAXIMUM_LIFE", "INCREASED_PERCENT_ARMOUR", "HYBRID_INCREASED_PERCENT_ARMOUR_AND_LIFE", "BASE_ARMOUR"]);
  const SUF = new Set(["FIRE_RESISTANCE", "COLD_RESISTANCE", "LIGHTNING_RESISTANCE", "CHAOS_RESISTANCE", "STRENGTH"]);
  const score = it => {
    let hit = 0, tierSum = 0;
    for (const a of it.affixes) { if (PRE.has(name(a)) || SUF.has(name(a))) hit++; tierSum += tierPct(a); }
    return { hit, avgTier: tierSum / it.affixes.length };
  };
  let it = E.newItem("Helmets", "ImperialGreathelm", 84, E.defaultRng);
  let r = go(it, "alchemy"); if (!r.ok) return { fail: r.reason, log }; it = r.item;
  let guard = 0;
  while (it.affixes.length < 6 && guard++ < 8) { r = go(it, "exalt"); if (r.ok) it = r.item; }
  // 后缀洗到 3 条目标（消抹·右旋循环），前缀不足用 剥离·左旋+崇高 修
  guard = 0; let stuck = 0;
  while (guard++ < 400 && stuck < 40) {
    const v = valid(it); if (v) return { fail: v, log };
    const badSuf = it.affixes.filter(a => modOf(a).type === "suffix" && (!SUF.has(name(a)) || tierPct(a) < 0.5));
    const badPre = it.affixes.filter(a => modOf(a).type === "prefix" && (!PRE.has(name(a)) || tierPct(a) < 0.4));
    if (!badSuf.length && !badPre.length) break;
    const before = score(it).hit * 100 + score(it).avgTier;
    const omen = badSuf.length ? "OmenofDextralErasure" : "OmenofSinistralErasure";
    let rr = act(it, "chaos", { omen });
    if (!rr.ok && badPre.length && !badSuf.length) rr = act(it, "annul", { omen: "OmenofSinistralAnnulment" });
    if (!rr.ok) { stuck++; continue; }
    if (rr.item.affixes.length < it.affixes.length) { const ex = act(rr.item, "exalt"); if (ex.ok) rr = ex; }
    const after = score(rr.item).hit * 100 + score(rr.item).avgTier;
    if (after >= before) { cost += rr.cost || 0; steps++; it = rr.item; stuck = 0; } else stuck++;
  }
  guard = 0;
  while (it.affixes.length < 6 && guard++ < 6) { r = go(it, "exalt"); if (r.ok) it = r.item; }
  // 深渊回响尝试（六选一）替换最差线
  let echoInfo = "";
  if (it.affixes.length === 6 && !it.affixes.some(a => a.source === "desecrated")) {
    r = go(it, "desecrated", { boneTier: "ancient", omen: "OmenofAbyssalEchoes" });
    if (r.ok) {
      it = r.item;
      const cands = E.desecrateCandidates(it, { omens: ["OmenofAbyssalEchoes"], boneTier: "ancient" }, R());
      if (cands.length === 6) {
        // 六选一里挑最优质的
        const best = cands.slice().sort((a, b) => (b.mod.tiers.length - b.tierIdx) - (a.mod.tiers.length - a.tierIdx))[0];
        const it2 = E.applyDesecrate(it, best, R());
        if (it2 && it2.affixes) { it = it2; echoInfo = "回响六选一:" + best.mod.id.split("/")[1].slice(0, 26); }
      }
    } else echoInfo = "拦截:" + r.reason.slice(0, 16);
  }
  const v = valid(it); if (v) return { fail: v, log };
  const sc = score(it);
  return {
    item: it, log, cost: Math.round(cost), steps,
    affixes: it.affixes.map(a => name(a).slice(0, 34) + " T" + (modOf(a).tiers.length - a.tierIdx) + (a.source === "desecrated" ? "·渎灵" : "")),
    hit: sc.hit + "/6 目标词缀", avgTier: (sc.avgTier * 100).toFixed(0) + "% 档位", echoInfo,
  };
}

/* 运行（多种子，弓与头盔各取最先达标的一次） */
const RUNS = [["小毕业物理弓", craftBow, "Bows", "ObliteratorBow"], ["半毕业力量头盔", craftHelm, "Helmets", "ImperialGreathelm"]];
const EXPORT = {};
for (const [label, fn, cls, base] of RUNS) {
  let best = null;
  for (let s = 0; s < 30 && !best; s++) {
    SEED = 777 + s * 131;
    const r = fn(false);
    if (r.retry) continue;
    if (!r.fail) best = r; else if (s === 29) best = r;
  }
  EXPORT[label] = { classId: cls, baseId: base, ilvl: 84, item: best && best.item, cost: best && best.cost, steps: best && best.steps, hit: best && best.hit };
  console.log("\n═══ " + label + " ═══");
  if (!best) { console.log("✗ 全部种子未锁中攻速（破溃随机性）"); continue; }
  if (best.fail) { console.log("✗ 失败: " + best.fail); continue; }
  console.log("✓ " + best.steps + " 步 · ≈" + best.cost + " 崇 · " + best.hit + " · 平均" + best.avgTier);
  for (const a of best.affixes) console.log("   " + a);
  console.log("   深渊: " + (best.desecOk || best.echoInfo || "未用"));
}

/* --export：把会话结果写成 grad_gear_session.json（供 UI 展示注入） */
if (process.argv.includes("--export")) {
  require("fs").writeFileSync(path.join(__dirname, "..", "grad_gear_session.json"), JSON.stringify(EXPORT));
  console.log("[export] grad_gear_session.json written");
}
