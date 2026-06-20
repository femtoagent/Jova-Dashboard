// Inspect a GLB: per-node name + WORLD center/size (applies node TRS), overall world bbox, triangles,
// and embedded image dimensions. Run: node scripts/inspect-glb.cjs path/to/model.glb
const fs = require("fs");
let sharp = null;
try { sharp = require("sharp"); } catch {}

const path = process.argv[2];
if (!path) throw new Error("usage: node scripts/inspect-glb.cjs <file.glb>");
const buf = fs.readFileSync(path);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
const bin = buf.subarray(20 + jsonLen + 8);
const acc = json.accessors || [];
const bv = json.bufferViews || [];

function xform(n) {
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const r = [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
  return (p) => [
    t[0] + r[0] * s[0] * p[0] + r[1] * s[1] * p[1] + r[2] * s[2] * p[2],
    t[1] + r[3] * s[0] * p[0] + r[4] * s[1] * p[1] + r[5] * s[2] * p[2],
    t[2] + r[6] * s[0] * p[0] + r[7] * s[1] * p[1] + r[8] * s[2] * p[2],
  ];
}
function meshBox(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const p of mesh.primitives || []) {
    const pos = p.attributes && p.attributes.POSITION;
    if (p.indices != null) tris += acc[p.indices].count / 3;
    if (pos != null) { const a = acc[pos]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); } }
  }
  return { lo, hi, tris };
}

(async () => {
  const sLo = [Infinity, Infinity, Infinity], sHi = [-Infinity, -Infinity, -Infinity];
  let total = 0;
  console.log("== " + path + " (" + (buf.length / 1024 / 1024).toFixed(1) + " MB)");
  for (const n of json.nodes || []) {
    if (n.mesh == null) continue;
    const { lo, hi, tris } = meshBox(json.meshes[n.mesh]);
    total += tris;
    const xf = xform(n);
    const wlo = [Infinity, Infinity, Infinity], whi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const w = xf([i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
      for (let k = 0; k < 3; k++) { wlo[k] = Math.min(wlo[k], w[k]); whi[k] = Math.max(whi[k], w[k]); }
    }
    for (let k = 0; k < 3; k++) { sLo[k] = Math.min(sLo[k], wlo[k]); sHi[k] = Math.max(sHi[k], whi[k]); }
    const c = wlo.map((v, k) => ((v + whi[k]) / 2).toFixed(2));
    const sz = whi.map((v, k) => (v - wlo[k]).toFixed(2));
    console.log(`  "${n.name}" tris ${Math.round(tris)} | center ${c.join(",")} | size ${sz.join(" x ")}`);
  }
  console.log("overall world size:", sHi.map((v, k) => (v - sLo[k]).toFixed(2)).join(" x "),
    "| min", sLo.map((v) => v.toFixed(2)).join(","), "max", sHi.map((v) => v.toFixed(2)).join(","));
  console.log("total tris:", Math.round(total), "| materials:", (json.materials || []).length, "| images:", (json.images || []).length);
  if (sharp) for (const img of json.images || []) {
    if (img.bufferView == null) continue;
    const v = bv[img.bufferView];
    try { const m = await sharp(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)).metadata(); console.log(`  img ${img.mimeType || ""} ${m.width}x${m.height}`); } catch {}
  }
})();
