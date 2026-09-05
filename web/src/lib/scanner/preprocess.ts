/** Must match ml/model.py MEAN/STD and ml/dataset.py normalize_tf (resize to 224x224, ImageNet norm, NCHW). */
export const IMAGE_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Crop `source` to `crop` (in source pixels), resize to 224x224 and return a normalised
 * Float32Array in NCHW layout ready for the ONNX model.
 */
export function preprocess(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  crop?: { x: number; y: number; w: number; h: number },
  scratch?: HTMLCanvasElement,
): Float32Array {
  const canvas = scratch ?? document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const sw = "videoWidth" in source ? source.videoWidth : source.width;
  const sh = "videoHeight" in source ? source.videoHeight : source.height;
  const c = crop ?? { x: 0, y: 0, w: sw, h: sh };
  ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const { data } = ctx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const n = IMAGE_SIZE * IMAGE_SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = (data[i * 4] / 255 - MEAN[0]) / STD[0];
    out[n + i] = (data[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * n + i] = (data[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

/** Card-shaped guide rectangle (63x88mm aspect) centred in a viewport. */
export function cardGuide(viewW: number, viewH: number, fill = 0.78) {
  const aspect = 63 / 88;
  let w = viewW * fill;
  let h = w / aspect;
  if (h > viewH * 0.85) {
    h = viewH * 0.85;
    w = h * aspect;
  }
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}
