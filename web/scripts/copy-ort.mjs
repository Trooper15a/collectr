// Copies onnxruntime-web WASM/JSEP binaries into public/ort so the scanner works offline.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
const src = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const dst = join(process.cwd(), "public", "ort");
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (/\.(wasm|mjs)$/.test(f) && /ort-wasm/.test(f)) {
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`copied ${n} onnxruntime-web files to public/ort`);
