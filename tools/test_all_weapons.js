/* 全武器类引擎级做装回归测试：14 类武器各跑通用路线（点金→崇高至满→完美精华替换→精华王朝→混沌→神圣）+ 完整性校验 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const APP = path.resolve(__dirname, "..", "app");
const sb = { window: {} };
vm.createContext(sb);
for (const f of ["data.js", "augments.js", "i18n_mods.js", "engine.js", "data_pools.js"])
  vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), sb);
const E = sb.window.POE2_ENGINE;
E.loadPools(sb.window.POE2_POOLS);
const POOLS = sb.window.POE2_POOLS;

const WEAPONS = [
  ["Bows", "RuneforgedDualstringBow", "弓(视频同款双弦)"],
  ["Spears", "GrandSpear", "战矛"],
  ["Crossbows", "SiegeCrossbow", "战弩"],
  ["Quarterstaves", "AegisQuarterstaff", "节杖"],
  ["OneHand_Maces", "FortifiedHammer", "单手锤(无视频)"],
  ["TwoHand_Maces", "RuinationMaul", "双手锤"],
  ["Staves", "PermafrostStaff", "长杖"],
  ["Wands", "DuelingWand", "法杖"],
  ["Sceptres", "HallowedSceptre", "权杖"],
  ["Foci", "TasalianFocus", "法器"],
  ["Quivers", "BroadheadQuiver", "箭袋(视频同款宽矢)"],
  ["Talismans", "MajiTalisman", "魔符"],
  ["Shields", "TawhoanTowerShield", "盾牌"],
  ["Bucklers", "DesertBuckler", "轻盾(无视频)"],
];

const rng = E.makeRng(20260916);
const results = [];
for (const [cls, base, label] of WEAPONS) {
  const r = { label, cls, steps: [], ok: true };
  try {
    let item = E.newItem(cls, base, 86, E.defaultRng);
    const step = (name, res, assign) => {
      if (res.ok) { if (assign) item = res.item; r.steps.push(name + ":ok"); return true; }
      r.steps.push(name + ":" + String(res.reason).slice(0, 22)); return false;
    };
    step("点金", E.act(item, "alchemy", {}, rng), true);
    let g = 0;
    while (item.affixes.length < 6 && g++ < 10) { const x = E.act(item, "exalt", {}, rng); if (x.ok) item = x.item; }
    r.steps.push("崇高至满:" + item.affixes.length);
    const pk = E.poolKeyOf(item);
    const perf = [...new Set(POOLS.essenceModMap.filter(e => e.classId === pk && e.tier === "PERFECT").map(e => e.essence))][0];
    if (perf) {
      const p1 = E.act(item, "essence", { essence: perf, tier: "PERFECT" }, rng);
      if (p1.ok) { item = p1.item; r.steps.push("完美" + perf + ":先删后加ok"); }
      else r.steps.push("完美" + perf + ":" + p1.reason.slice(0, 20));
      const p2 = E.act(item, "essence", { essence: perf, tier: "PERFECT" }, rng);
      if (p2.ok) { item = p2.item; r.steps.push("王朝二刷:ok"); } else r.steps.push("王朝二刷:" + p2.reason.slice(0, 18));
    } else r.steps.push("完美精华:无PERFECT档");
    for (let i = 0; i < 3; i++) { const c = E.act(item, "chaos", {}, rng); if (c.ok) item = c.item; }
    r.steps.push("混沌×3:ok");
    const d = E.act(item, "divine", {}, rng);
    if (d.ok) { item = d.item; r.steps.push("神圣:ok"); } else r.steps.push("神圣:" + d.reason.slice(0, 18));
    const cnt = E.affixCounts(item), caps = E.capsFor(item, "rare");
    const fams = item.affixes.map(a => E.modsById.get(a.modId).family);
    r.valid = cnt.prefix <= caps.prefix && cnt.suffix <= caps.suffix && new Set(fams).size === fams.length && item.affixes.length >= 5;
    if (!r.valid) { r.ok = false; r.steps.push("校验失败:" + cnt.prefix + "前/" + cnt.suffix + "后 上限" + caps.prefix + "/" + caps.suffix); }
    r.final = item.affixes.length + "词缀(" + cnt.prefix + "前" + cnt.suffix + "后)";
  } catch (e) { r.ok = false; r.steps.push("异常:" + String(e).slice(0, 60)); }
  results.push(r);
}
for (const r of results)
  console.log((r.ok && r.valid ? "✓" : "✗"), r.label.padEnd(14), "|", r.final || "-", "|", r.steps.join(" → "));
console.log("通过:", results.filter(r => r.ok && r.valid).length + "/" + results.length);
