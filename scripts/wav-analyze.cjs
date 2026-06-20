// Decode a WAV and print a sound-design profile: format, envelope shape, spectral band balance,
// brightness (centroid), dominant low frequency, and amplitude-wobble rate.
// Run: node scripts/wav-analyze.cjs "path/to/file.wav"
const fs = require("fs");

const p = process.argv[2];
const buf = fs.readFileSync(p);
if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV");

// ---- parse chunks ----
const chunks = {};
let off = 12;
while (off + 8 <= buf.length) {
  const id = buf.toString("ascii", off, off + 4);
  const size = buf.readUInt32LE(off + 4);
  chunks[id] = { off: off + 8, size };
  off += 8 + size + (size % 2);
}
const fmt = chunks["fmt "];
const audioFormat = buf.readUInt16LE(fmt.off);
const channels = buf.readUInt16LE(fmt.off + 2);
const sampleRate = buf.readUInt32LE(fmt.off + 4);
const bits = buf.readUInt16LE(fmt.off + 14);
const data = chunks["data"];
const bps = bits / 8;
const frame = bps * channels;
const n = Math.floor(data.size / frame);
const x = new Float32Array(n);
for (let i = 0; i < n; i++) {
  let sum = 0;
  for (let c = 0; c < channels; c++) {
    const pos = data.off + i * frame + c * bps;
    let v = 0;
    if (audioFormat === 3 && bits === 32) v = buf.readFloatLE(pos);
    else if (bits === 16) v = buf.readInt16LE(pos) / 32768;
    else if (bits === 24) { let val = buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16); if (val & 0x800000) val -= 0x1000000; v = val / 8388608; }
    else if (bits === 32) v = buf.readInt32LE(pos) / 2147483648;
    sum += v;
  }
  x[i] = sum / channels;
}

const dur = n / sampleRate;
let peak = 0, sq = 0;
for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sq += x[i] * x[i]; }
const rms = Math.sqrt(sq / n);
const dB = (v) => (20 * Math.log10(v || 1e-9)).toFixed(1);

// ---- envelope (RMS per hop) ----
const hop = 512;
const env = [];
for (let i = 0; i + hop <= n; i += hop) {
  let s = 0;
  for (let k = 0; k < hop; k++) s += x[i + k] * x[i + k];
  env.push(Math.sqrt(s / hop));
}
const envRate = sampleRate / hop;
let ep = 0, epi = 0;
env.forEach((v, i) => { if (v > ep) { ep = v; epi = i; } });
const third = Math.floor(env.length / 3);
const mean = (arr, a, b) => { let s = 0; for (let i = a; i < b; i++) s += arr[i]; return s / Math.max(1, b - a); };
const e1 = mean(env, 0, third), e2 = mean(env, third, 2 * third), e3 = mean(env, 2 * third, env.length);

// envelope wobble: autocorrelation of the de-meaned envelope
const em = mean(env, 0, env.length);
const ec = env.map((v) => v - em);
let best = { lag: 0, val: 0 };
for (let lag = Math.floor(envRate / 20); lag < Math.floor(envRate / 0.7) && lag < ec.length / 2; lag++) {
  let s = 0;
  for (let i = 0; i + lag < ec.length; i++) s += ec[i] * ec[i + lag];
  if (s > best.val) best = { lag, val: s };
}
let zero = 0; for (let i = 0; i < ec.length; i++) zero += ec[i] * ec[i];
const wobbleStrength = best.val / (zero || 1);
const wobbleHz = best.lag ? envRate / best.lag : 0;

// sparkline
const spark = "▁▂▃▄▅▆▇█";
const cols = 48;
let line = "";
for (let c = 0; c < cols; c++) {
  const v = env[Math.floor((c / cols) * env.length)] / (ep || 1);
  line += spark[Math.min(7, Math.max(0, Math.floor(v * 8)))];
}

// ---- spectrum via FFT over the loudest region ----
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const SZ = 16384;
const center = Math.min(Math.max(epi * hop, SZ / 2), n - SZ / 2 - 1);
const re = new Float64Array(SZ), im = new Float64Array(SZ);
for (let i = 0; i < SZ; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SZ - 1)); re[i] = (x[center - SZ / 2 + i] || 0) * w; }
fft(re, im);
const mag = new Float64Array(SZ / 2);
for (let k = 0; k < SZ / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
const binHz = sampleRate / SZ;
const bands = [["sub", 20, 60], ["bass", 60, 250], ["lowmid", 250, 800], ["mid", 800, 2500], ["highmid", 2500, 6000], ["high", 6000, 16000]];
let total = 0; for (let k = 1; k < SZ / 2; k++) total += mag[k] * mag[k];
const bandPct = bands.map(([name, lo, hi]) => { let s = 0; for (let k = Math.floor(lo / binHz); k <= Math.min(SZ / 2 - 1, Math.floor(hi / binHz)); k++) s += mag[k] * mag[k]; return [name, (100 * s / (total || 1)).toFixed(1)]; });
let cen = 0, den = 0; for (let k = 1; k < SZ / 2; k++) { cen += k * binHz * mag[k]; den += mag[k]; }
const centroid = cen / (den || 1);
let domK = 1; for (let k = Math.floor(20 / binHz); k < Math.floor(400 / binHz); k++) if (mag[k] > mag[domK]) domK = k;

console.log("== " + p);
console.log(`format: ${audioFormat === 3 ? "float" : "pcm"} ${bits}bit ${channels}ch ${sampleRate}Hz | dur ${dur.toFixed(2)}s | peak ${dB(peak)}dB rms ${dB(rms)}dB`);
console.log(`envelope: ${line}`);
console.log(`  attack-to-peak ${(epi / envRate).toFixed(2)}s | thirds(rms) start ${dB(e1)} mid ${dB(e2)} end ${dB(e3)}  => ${e3 < e1 - 3 ? "DECAYS (impact/hit)" : e2 > e1 + 3 ? "RISES (riser/swell)" : "SUSTAINS (drone)"}`);
console.log(`  wobble: ${wobbleHz ? wobbleHz.toFixed(2) + "Hz" : "none"} (strength ${(wobbleStrength).toFixed(2)})`);
console.log(`spectrum bands (% energy): ${bandPct.map(([nm, v]) => nm + " " + v).join("  ")}`);
console.log(`  centroid(brightness) ${centroid.toFixed(0)}Hz | dominant-low ~${(domK * binHz).toFixed(1)}Hz`);
