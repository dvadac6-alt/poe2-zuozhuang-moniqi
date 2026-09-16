/* 移除唯一专用基底（不可做装，误混入基底名录）：
 * - Runemastered*（符文师匠×，231 个）：符文锻造台升级传奇的产物，页面上只有 Unique 变体
 * - RunicFork*（符文之叉·投射/回魔/结界，3 个）：传奇「寻符者之唤」专属基底及其升级变体
 * 同步清理：data.js 基底名录 / assets.js 图标清单 / assets/weapons 图标文件
 * 用法：node tools/strip_unique_bases.mjs */
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dirname, "..", "app");
const UNIQUE_ONLY = (id) => /^Runemastered/.test(id) || /^RunicFork/.test(id);

const load = (f, k) => {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), sb);
  return sb.window[k];
};
import vm from "node:vm";

const D = load("data.js", "POE2_DATA");
const P = load("data_pools.js", "POE2_POOLS");

let removed = [];
for (const c of D.bases.classes) {
  const keep = c.bases.filter((b) => !UNIQUE_ONLY(b.id));
  removed.push(...c.bases.filter((b) => UNIQUE_ONLY(b.id)).map((b) => c.id + "/" + b.id));
  c.bases = keep;
}
console.log("移除唯一专用基底:", removed.length, "个");
if (!removed.length) throw new Error("没有可移除的条目（可能已处理过）");

const header = (f) => fs.readFileSync(path.join(APP, f), "utf8").split("\n")[0] + "\n";
fs.writeFileSync(path.join(APP, "data.js"),
  header("data.js") + "window.POE2_DATA = " + JSON.stringify(D) + ";\n");
fs.writeFileSync(path.join(APP, "data_pools.js"),
  header("data_pools.js") + "window.POE2_POOLS = " + JSON.stringify(P) + ";\n");

/* 图标清单 + 文件清理 */
const aSrc = fs.readFileSync(path.join(APP, "assets.js"), "utf8");
const aHeader = aSrc.slice(0, aSrc.indexOf("window.POE2_ASSETS"));
const M = JSON.parse(aSrc.slice(aSrc.indexOf("{"), aSrc.lastIndexOf("}") + 1));
let iconsRemoved = 0, filesDeleted = 0;
for (const id of removed) {
  if (M.weapons && M.weapons[id]) {
    const p = path.join(APP, M.weapons[id]);
    delete M.weapons[id];
    iconsRemoved++;
    if (fs.existsSync(p)) { fs.unlinkSync(p); filesDeleted++; }
  }
}
fs.writeFileSync(path.join(APP, "assets.js"), aHeader + "window.POE2_ASSETS = " + JSON.stringify(M) + ";\n");

const totalBases = D.bases.classes.reduce((n, c) => n + c.bases.length, 0);
const totalIcons = Object.values(M).reduce((n, items) => n + Object.keys(items).length, 0);
console.log(`剩余基底 ${totalBases} | 图标清单 -${iconsRemoved} → ${totalIcons} | 删除图标文件 ${filesDeleted}`);
