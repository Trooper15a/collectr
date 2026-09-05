export interface IndexCard {
  id: string;
  name: string | null;
  set: string | null;
  setName?: string | null;
  num: string | null;
  tcg: string | null;
  lang: string | null;
  src?: string | null;
  img?: string | null;
}

/** Ids that exist only in the scanner index (image sources without prices) and must be resolved to a priced card. */
export function isScanIndexId(id: string) {
  return id.startsWith("tcgdex:") || id.startsWith("pcjp:");
}

export interface EmbeddingIndex {
  model_version: string;
  dim: number;
  count: number;
  cards: IndexCard[];
}

export interface Match {
  card: IndexCard;
  score: number;
}

/** Decode a float16 buffer to float32. */
export function float16ToFloat32(buf: ArrayBuffer): Float32Array {
  const u16 = new Uint16Array(buf);
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    let v: number;
    if (e === 0) v = (f / 1024) * Math.pow(2, -14);
    else if (e === 0x1f) v = f ? NaN : Infinity;
    else v = (1 + f / 1024) * Math.pow(2, e - 15);
    out[i] = s ? -v : v;
  }
  return out;
}

/** Brute-force cosine similarity (vectors are L2-normalised so dot product == cosine). */
export function topK(query: Float32Array, vectors: Float32Array, dim: number, cards: IndexCard[], k = 5): Match[] {
  const n = vectors.length / dim;
  const best: { i: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) s += query[d] * vectors[off + d];
    if (best.length < k) {
      best.push({ i, s });
      best.sort((a, b) => b.s - a.s);
    } else if (s > best[k - 1].s) {
      best[k - 1] = { i, s };
      best.sort((a, b) => b.s - a.s);
    }
  }
  return best.map((b) => ({ card: cards[b.i], score: b.s }));
}
