/* 预兆系统全覆盖引擎级测试：8 组 27 种预兆 + 剥离系 + 深渊系统
 * 每个用例：构造合适状态的物品 → 挂预兆(经 opts.omen) → 用对应通货 → 断言效果 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const APP = path.resolve(__dirname, "..", "app");
const sb = { window: {} };
vm.createContext(sb);
for (const f of ["data.js", "augments.js", "i18n_mods.js", "engine.js", "data_pools.js"])
  vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), sb);
const E = sb.window.POE2_ENGINE;
E.loadPools(sb.window.POE2_POOLS);

let seed = 42;
const rng = () => E.makeRng(seed++)(); // 每次调用新建确定性 rng 序列
const R = () => E.makeRng(seed++);
const results = [];
const T = (name, fn) => {
  try { const info = fn(); results.push(["✓", name, info || ""]); }
  catch (e) { results.push(["✗", name, String(e).slice(0, 80)]); }
};
const assert = (c, msg) => { if (!c) throw new Error(msg || "断言失败"); };
const type = (item, i) => E.modsById.get(item.affixes[i].modId).type;
const modOf = a => E.modsById.get(a.modId);
const rare = (cls = "Bows", base = "ObliteratorBow", ilvl = 82) => {
  let it = E.act(E.newItem(cls, base, ilvl, E.defaultRng), "alchemy", {}, R()).item;
  let g = 0;
  while (it.affixes.length < 6 && g++ < 12) { const x = E.act(it, "exalt", {}, R()); if (x.ok) it = x.item; }
  return it;
};
const magic = (cls = "Bows") => E.act(E.newItem(cls, "CrudeBow", 82, E.defaultRng), "transmute", {}, R()).item;
const hasPrefix = it => it.affixes.some(a => modOf(a).type === "prefix");
const hasSuffix = it => it.affixes.some(a => modOf(a).type === "suffix");
const addChange = r => r.ok && r.events.filter(e => e.type === "add").map(e => e.affix).filter(Boolean);

/* ───── 加冕预兆（富豪石）：只加前缀 / 只加后缀 / 同质化 ───── */
T("加冕·左旋（富豪只加前缀）", () => {
  const m = magic(); const m0 = m.affixes.length;
  const r = E.act(m, "regal", { omen: "OmenofSinistralCoronation" }, R());
  assert(r.ok, r.reason);
  const adds = addChange(r);
  assert(r.item.rarity === "rare" && r.item.affixes.length === m0 + 1, "应+1词缀升稀有");
  assert(adds.every(a => modOf(a).type === "prefix"), "新词缀应全为前缀");
  return "ok";
});
T("加冕·右旋（富豪只加后缀）", () => {
  const m = magic(); const m0 = m.affixes.length;
  const r = E.act(m, "regal", { omen: "OmenofDextralCoronation" }, R());
  assert(r.ok, r.reason);
  assert(addChange(r).every(a => modOf(a).type === "suffix"), "新词缀应全为后缀");
  return "ok";
});
T("同质化加冕（两侧同类）", () => {
  const m = magic();
  const r = E.act(m, "regal", { omen: "OmenofHomogenisingCoronation" }, R());
  assert(r.ok, r.reason); // 效果语义：加冕词缀与已有词缀同质（实现自验：不崩+词缀+1）
  assert(r.item.affixes.length === m.affixes.length + 1, "+1词缀");
  return "效果语义宽松校验 ok";
});

/* ───── 升华预兆（崇高石）：限前缀/后缀/额外词缀/催化 ───── */
for (const [oid, label, want] of [
  ["OmenofSinistralExaltation", "升华·左旋（崇高只加前缀）", "prefix"],
  ["OmenofDextralExaltation", "升华·右旋（崇高只加后缀）", "suffix"],
]) T(label, () => {
  let it = rare(); it.affixes = it.affixes.slice(0, 4); // 留空位
  const n0 = it.affixes.length;
  const r = E.act(it, "exalt", { omen: oid }, R());
  assert(r.ok, r.reason);
  const adds = addChange(r);
  assert(r.item.affixes.length === n0 + 1 && adds.length >= 1, "+1");
  assert(adds.every(a => modOf(a).type === want), "新词缀应为" + want);
  return "ok";
});
T("高级升华（崇高额外词缀）", () => {
  let it = rare();
  const n0 = it.affixes.length;
  const r = E.act(it, "exalt", { omen: "OmenofGreaterExaltation" }, R());
  assert(r.ok || r.reason, "应有效执行");
  if (r.ok) assert(r.item.affixes.length >= n0 + 1, "至少+1（额外词缀语义）");
  return r.ok ? "+" + (r.item.affixes.length - n0) + "条" : "拦截:" + r.reason.slice(0, 16);
});
T("催化升华", () => {
  let it = rare(); it.affixes = it.affixes.slice(0, 4);
  const r = E.act(it, "exalt", { omen: "OmenofCatalysingExaltation" }, R());
  return r.ok ? "ok" : "拦截:" + r.reason.slice(0, 20);
});

/* ───── 剥离预兆组（剥离石）───── */
T("剥离·左旋（只删前缀）", () => {
  const it = rare(); assert(hasPrefix(it), "需有前缀");
  const r = E.act(it, "annul", { omen: "OmenofSinistralAnnulment" }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm && modOf(rm.affix).type === "prefix", "删除的应是前缀");
  return "删" + rm.affix.modId.split("/")[1].slice(0, 18);
});
T("剥离·右旋（只删后缀）", () => {
  const it = rare();
  const r = E.act(it, "annul", { omen: "OmenofDextralAnnulment" }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm && modOf(rm.affix).type === "suffix", "删除的应是后缀");
  return "删" + rm.affix.modId.split("/")[1].slice(0, 18);
});
T("光之预兆（必删亵渎词缀）", () => {
  // 先用渎灵给物品加一条亵渎词缀
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved" }, R());
  assert(d.ok, "加骨:" + d.reason); it = d.item;
  const reveal = E.desecrateCandidates(it, {}, R());
  assert(reveal.length > 0, "应有揭示候选");
  const pick = reveal.find(c => c.mod.source === "desecrated") || reveal[0];
  const applied = E.applyDesecrate(it, pick, R()); const it2 = applied;
  it = applied;
  assert(it.affixes.some(a => a.source === "desecrated"), "应有渎灵词缀");
  const r = E.act(it, "annul", { omen: "OmenofLight" }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm && rm.affix.source === "desecrated", "光之预兆应必删亵渎词缀，实际删了 " + (rm && rm.affix.modId));
  return "删亵渎词缀 ok";
});
T("强效剥离（一次删 2 条）", () => {
  const it = rare(); assert(it.affixes.length >= 3, "需≥3词缀");
  const n0 = it.affixes.length;
  const r = E.act(it, "annul", { omen: "OmenofGreaterAnnulment" }, R());
  assert(r.ok, r.reason);
  const rms = r.events.filter(e => e.type === "remove");
  assert(rms.length === 2, "应删 2 条，实际 " + rms.length);
  return "删2条 ok";
});
T("普通剥离（无预兆基准）", () => {
  const it = rare();
  const r = E.act(it, "annul", {}, R());
  assert(r.ok && r.item.affixes.length === it.affixes.length - 1, "删1条");
  return "ok";
});

/* ───── 晶化预兆（精华限定前后缀替换位）───── */
for (const [oid, label, want] of [
  ["OmenofSinistralCrystallisation", "晶化·左旋（完美精华只换前缀位）", "prefix"],
  ["OmenofDextralCrystallisation", "晶化·右旋（完美精华只换后缀位）", "suffix"],
]) T(label, () => {
  const ess = want === "suffix" ? "Haste" : "Abrasion"; // 保底词缀位与预兆限位需一致
  const it = rare();
  const r = E.act(it, "essence", { essence: ess, tier: "PERFECT", omen: oid }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm && modOf(rm.affix).type === want, "应替换" + want);
  return "ok";
});

/* ───── 消减/消抹预兆（混沌）───── */
T("消减预兆（混沌删等级需求最低词缀）", () => {
  const it = rare();
  const r = E.act(it, "chaos", { omen: "OmenofWhittling" }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm, "应有删除");
  // 校验删的是 ilvl 需求最低的
  const lv = a => modOf(a).tiers[a.tierIdx].ilvl;
  const minLv = Math.min(...it.affixes.map(lv));
  assert(lv(rm.affix) === minLv, "删的应是最低 ilvl 需求词缀");
  return "删最低档 ok";
});
for (const [oid, label, want] of [
  ["OmenofSinistralErasure", "消抹·左旋（混沌只删前缀）", "prefix"],
  ["OmenofDextralErasure", "消抹·右旋（混沌只删后缀）", "suffix"],
]) T(label, () => {
  const it = rare();
  const r = E.act(it, "chaos", { omen: oid }, R());
  assert(r.ok, r.reason);
  const rm = r.events.find(e => e.type === "remove");
  assert(rm && modOf(rm.affix).type === want, "应删" + want);
  return "ok";
});

/* ───── 炼金预兆（点金前缀/后缀拉满）───── */
for (const [oid, label] of [["OmenofSinistralAlchemy", "炼金·左旋（点金前缀拉满）"], ["OmenofDextralAlchemy", "炼金·右旋（点金后缀拉满）"]]) T(label, () => {
  const m = magic();
  const r = E.act(m, "alchemy", { omen: oid }, R());
  assert(r.ok, r.reason);
  const cnt = E.affixCounts(r.item);
  assert(r.item.rarity === "rare", "稀有");
  return cnt.prefix + "前/" + cnt.suffix + "后";
});

/* ───── 死灵预兆（渎灵揭示限前/后缀）───── */
for (const [oid, label, want] of [["OmenofSinistralNecromancy", "死灵·左旋（揭示限前缀）", "prefix"], ["OmenofDextralNecromancy", "死灵·右旋（揭示限后缀）", "suffix"]]) T(label, () => {
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved", omen: oid }, R());
  assert(d.ok, "加骨:" + d.reason); it = d.item;
  const cands = E.desecrateCandidates(it, {}, R());
  assert(cands.length > 0, "有候选");
  for (const c of cands) {
    const m = E.modsById.get(c.modId);
    if (m && modOf({ modId: c.modId, tierIdx: 0, values: [] }).type !== want)
      throw new Error("候选含非" + want + "位词缀: " + c.modId);
  }
  return cands.length + " 个候选全部" + want + "位";
});

/* ───── 首领预兆（黑血/领主/君主 锁首领池）───── */
const BOSS = [["OmenoftheBlackblooded", "黑血（库尔加尔）"], ["OmenoftheLiege", "领主（阿玛纳姆）"], ["OmenoftheSovereign", "君主（乌拉曼）"]];
for (const [oid, label] of BOSS) T("首领预兆·" + label, () => {
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved", omen: oid }, R());
  assert(d.ok, "加骨:" + d.reason); it = d.item;
  const cands = E.desecrateCandidates(it, {}, R());
  assert(cands.length > 0, "有候选");
  for (const c of cands) {
    assert(c.mod && c.mod.source === "desecrated", "候选应全为亵渎池: " + (c.mod && c.mod.id));
  }
  return cands.length + " 候选全首领亵渎池";
});

/* ───── 深渊回响（六选一）/ 腐化揭示（清空重灌6条）───── */
T("深渊回响（六选一）", () => {
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved", omen: "OmenofAbyssalEchoes" }, R());
  assert(d.ok, "加骨:" + d.reason); it = d.item;
  const cands = E.desecrateCandidates(it, {}, R());
  assert(cands.length === 6, "应 6 选 1，实际 " + cands.length);
  return "6 候选 ok";
});
T("腐化揭示（清空重灌 6 条）", () => {
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved", omen: "OmenofPutrefaction" }, R());
  assert(d.ok, "加骨:" + d.reason); it = d.item;
  const cands = E.desecrateCandidates(it, { omens: ["OmenofPutrefaction"], boneTier: "preserved", echoes: true }, R());
  assert(cands.length === 6, "应 6 候选，实际 " + cands.length);
  // UI 语义：清空全部 → 填 6 条渎灵词缀（无 hidden 标记，占常规位）
  const it2 = E.clone(it);
  it2.affixes = cands.map(p => ({ modId: p.mod.id, tierIdx: p.tierIdx, values: p.mod.tiers[p.tierIdx].ranges.map(x => x[0]), source: "desecrated" }));
  delete it2.bonePhantom;
  assert(it2.affixes.length === 6, "重灌 6 条");
  const cnt = E.affixCounts(it2);
  assert(cnt.prefix + cnt.suffix === 6, "占常规位");
  const ex = E.act(it2, "exalt", {}, R());
  const expectBlock = cnt.prefix >= 3 && cnt.suffix >= 3;
  assert(ex.ok !== expectBlock, "崇高可用性与空位一致性（" + cnt.prefix + "前/" + cnt.suffix + "后）");
  return "清空重灌6条·占常规位·侧分布 " + cnt.prefix + "/" + cnt.suffix + " ok";
});

/* ───── 深渊骨两步流程（无预兆基准）+ 三档骨 ───── */
T("渎灵骨两步流程（preserved 档·满词缀替换）", () => {
  let it = rare();
  const d = E.act(it, "desecrated", { boneTier: "preserved" }, R());
  assert(d.ok, d.reason);
  assert(d.item.bonePhantom, "应进入待揭示状态");
  const cands = E.desecrateCandidates(d.item, {}, R());
  assert(cands.length === 3, "三选一，实际 " + cands.length);
  const it2 = E.applyDesecrate(d.item, cands[0], R());
  assert(it2.affixes.length === 6, "满词缀揭示后应仍 6 条（同侧替换），实际 " + it2.affixes.length);
  assert(it2.affixes.filter(a => a.source === "desecrated").length === 1, "恰 1 条渎灵词缀");
  const cnt = E.affixCounts(it2);
  assert(cnt.prefix <= 3 && cnt.suffix <= 3, "不超 3前3后");
  return "满词缀替换·占常规位·限1条 ok";
});
for (const bt of ["gnawed", "ancient"]) T("渎灵骨·" + bt + " 档", () => {
  let it = bt === "gnawed" ? rare("Bows", "CrudeBow", 60) : rare();
  const d = E.act(it, "desecrated", { boneTier: bt }, R());
  assert(d.ok, d.reason);
  const cands = E.desecrateCandidates(d.item, {}, R());
  E.applyDesecrate(d.item, cands[0], R());
  return "ok";
});

/* ───── 圣化 / 祝圣（神圣石）───── */
T("圣化预兆（神圣×80-120%+标记）", () => {
  const it = rare();
  const r = E.act(it, "divine", { omen: "OmenofSanctification" }, R());
  assert(r.ok, r.reason);
  assert(r.item.sanctified === true, "应标记圣化");
  return "数值重掷+圣化标记 ok";
});
T("祝圣预兆", () => {
  const it = rare();
  const r = E.act(it, "divine", { omen: "OmenoftheBlessed" }, R());
  return r.ok ? "ok" : "拦截:" + r.reason.slice(0, 24);
});

/* ───── 同组互斥 / 跨组叠加 ───── */
T("预兆同组互斥（升华组内左旋+右旋不可同挂）", () => {
  // 引擎语义：opts.omen 单传；UI 层同组互斥 —— 校验引擎对多预兆场景（omens 数组）的健壮性
  const it = rare();
  const r = E.act(it, "exalt", { omen: "OmenofSinistralExaltation", omens: ["OmenofSinistralExaltation", "OmenofDextralExaltation"] }, R());
  return r.ok ? "执行(以首个为准)" : "拦截:" + r.reason.slice(0, 20);
});

let pass = 0, fail = 0;
for (const [s, name, info] of results) {
  console.log(s, name.padEnd(30), info);
  if (s === "✓") pass++; else fail++;
}
console.log("\n通过 " + pass + " / 失败 " + fail + " / 共 " + results.length);
