// Downscale every embedded texture in a GLB to maxDim and repack the binary buffer. No extra deps
// (sharp only); geometry untouched. Run: node scripts/glb-shrink.cjs <in.glb> <out.glb> [maxDim=1024]
const fs = require("fs");
const sharp = require("sharp");

const align4 = (n) => (n + 3) & ~3;

(async () => {
  const [, , inPath, outPath, maxArg] = process.argv;
  const maxDim = parseInt(maxArg || "1024", 10);
  const buf = fs.readFileSync(inPath);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  if (!json.buffers || !json.meshes || !json.meshes.length) {
    console.error(`EMPTY GLB: ${inPath} has no geometry/buffers — re-export with the objects included.`);
    process.exit(1);
  }
  const bin = buf.subarray(20 + jsonLen + 8);
  const bv = json.bufferViews || [];

  const resized = {};
  for (const img of json.images || []) {
    if (img.bufferView == null) continue;
    const v = bv[img.bufferView];
    const src = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const isPng = (img.mimeType || "").includes("png");
    let pipe = sharp(src).resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    pipe = isPng ? pipe.png({ compressionLevel: 9 }) : pipe.jpeg({ quality: 85 });
    resized[img.bufferView] = await pipe.toBuffer();
  }

  const parts = [];
  let offset = 0;
  for (let i = 0; i < bv.length; i++) {
    const v = bv[i];
    const data = resized[i] || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const pad = align4(offset) - offset;
    if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    v.byteOffset = offset;
    v.byteLength = data.length;
    parts.push(data);
    offset += data.length;
  }
  const newBin = Buffer.concat(parts);
  json.buffers[0].byteLength = newBin.length;
  delete json.buffers[0].uri;

  let jsonStr = Buffer.from(JSON.stringify(json), "utf8");
  const jp = align4(jsonStr.length) - jsonStr.length;
  if (jp) jsonStr = Buffer.concat([jsonStr, Buffer.alloc(jp, 0x20)]);
  const bp = align4(newBin.length) - newBin.length;
  const binChunk = bp ? Buffer.concat([newBin, Buffer.alloc(bp)]) : newBin;

  const total = 12 + 8 + jsonStr.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  let p = 0;
  out.writeUInt32LE(0x46546c67, p); p += 4;
  out.writeUInt32LE(2, p); p += 4;
  out.writeUInt32LE(total, p); p += 4;
  out.writeUInt32LE(jsonStr.length, p); p += 4;
  out.writeUInt32LE(0x4e4f534a, p); p += 4;
  jsonStr.copy(out, p); p += jsonStr.length;
  out.writeUInt32LE(binChunk.length, p); p += 4;
  out.writeUInt32LE(0x004e4942, p); p += 4;
  binChunk.copy(out, p);

  fs.writeFileSync(outPath, out);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`${outPath}: ${mb(buf.length)}MB -> ${mb(out.length)}MB (maxDim ${maxDim})`);
})();
