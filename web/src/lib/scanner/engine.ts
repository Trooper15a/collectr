"use client";

import type { InferenceSession } from "onnxruntime-web";
import { type EmbeddingIndex, float16ToFloat32, type Match, topK } from "./matcher";
import { IMAGE_SIZE } from "./preprocess";

export type EngineStatus = "idle" | "loading" | "ready" | "missing" | "error";

export interface ScanEngine {
  status: EngineStatus;
  error?: string;
  index?: EmbeddingIndex;
  embed(input: Float32Array): Promise<Float32Array>;
  match(input: Float32Array, k?: number): Promise<Match[]>;
  backend?: string;
}

const MODEL_URL = "/model/card_embedder.onnx";
const INDEX_URL = "/model/index.json";
const EMB_URL = "/model/embeddings.bin";

let enginePromise: Promise<ScanEngine> | null = null;

/** Lazily load ONNX Runtime Web + the model + the embedding index. Cached across the session. */
export function getScanEngine(): Promise<ScanEngine> {
  if (!enginePromise) enginePromise = load();
  return enginePromise;
}

async function load(): Promise<ScanEngine> {
  const head = await fetch(MODEL_URL, { method: "HEAD" }).catch(() => null);
  if (!head || !head.ok || !(head.headers.get("content-type") ?? "").match(/octet|onnx|protobuf/)) {
    return missing("Model not found. Run the ML pipeline (train.py, embed.py, export.py) to create web/public/model/.");
  }
  try {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/"; // copied from node_modules/onnxruntime-web/dist by scripts/copy-ort.mjs
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    let session: InferenceSession;
    let backend = "wasm";
    try {
      session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "all" });
      backend = "webgpu";
    } catch {
      session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    }
    const [index, embBuf] = await Promise.all([
      fetch(INDEX_URL).then((r) => r.json() as Promise<EmbeddingIndex>),
      fetch(EMB_URL).then((r) => r.arrayBuffer()),
    ]);
    const vectors = float16ToFloat32(embBuf);
    if (vectors.length !== index.count * index.dim) {
      return missing(`Embedding file size mismatch (${vectors.length} floats vs ${index.count}x${index.dim}). Re-run embed.py.`);
    }
    const inputName = session.inputNames[0];
    const embed = async (input: Float32Array) => {
      const tensor = new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
      const out = await session.run({ [inputName]: tensor });
      return out[session.outputNames[0]].data as Float32Array;
    };
    return {
      status: "ready",
      index,
      backend,
      embed,
      match: async (input, k = 5) => topK(await embed(input), vectors, index.dim, index.cards, k),
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err), embed: fail, match: fail };
  }
}

function missing(msg: string): ScanEngine {
  return { status: "missing", error: msg, embed: fail, match: fail };
}
async function fail(): Promise<never> {
  throw new Error("scan engine not ready");
}
