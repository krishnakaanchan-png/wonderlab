import * as THREE from "three";
import motionWorkerUrl from "./motion.worker.ts?worker&url";
import type { Cutaway } from "@/lib/wonderlab/cutaway-schema";

export async function preparePoses(cutaway: Cutaway, signal: AbortSignal) {
  const sources = cutaway.poses!;
  const urls = sources.map((p) => p.image);
  const load = async (url: string) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return image;
  };
  const base = await load(cutaway.image!),
    images = await Promise.all(urls.map(load));
  const width = Math.min(1600, base.naturalWidth),
    height = Math.round((width * base.naturalHeight) / base.naturalWidth);
  const regions = cutaway.regions.filter(
    (r) =>
      cutaway.phases.some((p) =>
        (p.movingParts || p.contractions.map((c) => c.regionId)).includes(r.id),
      ) || /valve/i.test(r.label),
  );
  const moving = regions.length ? regions : cutaway.regions;
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const ctx = mask.getContext("2d")!;
  for (const r of moving) {
    ctx.save();
    ctx.translate(r.center[0] * width, r.center[1] * height);
    ctx.scale(r.radius[0] * width * 1.7, r.radius[1] * height * 1.7);
    const gradient = ctx.createRadialGradient(0, 0, 0.45, 0, 0, 1);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const smallW = 256,
    smallH = Math.round((smallW * height) / width),
    small = document.createElement("canvas");
  small.width = smallW;
  small.height = smallH;
  const smallCtx = small.getContext("2d", { willReadFrequently: true })!;
  const grays: Uint8Array[] = [],
    textures: THREE.CanvasTexture[] = [];
  for (const image of images) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const paint = canvas.getContext("2d")!;
    paint.drawImage(image, 0, 0, width, height);
    paint.globalCompositeOperation = "destination-in";
    paint.drawImage(mask, 0, 0);
    paint.globalCompositeOperation = "destination-over";
    paint.drawImage(base, 0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    smallCtx.drawImage(canvas, 0, 0, smallW, smallH);
    const rgba = smallCtx.getImageData(0, 0, smallW, smallH).data,
      gray = new Uint8Array(smallW * smallH);
    for (let i = 0; i < gray.length; i++)
      gray[i] = Math.round(
        0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2],
      );
    grays.push(gray);
  }
  const worker = new Worker(new URL(motionWorkerUrl, window.location.href), {
    type: "module",
  });
  type Field = { data: Float32Array; width: number; height: number };
  try {
    const result = await new Promise<{
      pairs: { forward: Field; backward: Field }[];
    }>((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (e) => {
        signal.removeEventListener("abort", abort);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data);
      };
      worker.onerror = (event) => {
        signal.removeEventListener("abort", abort);
        reject(new Error(event.message || "Motion worker could not start."));
      };
      worker.postMessage(
        { images: grays, width: smallW, height: smallH },
        grays.map((g) => g.buffer),
      );
    });
    const pairs = result.pairs.map((pair) => {
      const create = (field: Field) => {
        const t = new THREE.DataTexture(
          field.data,
          field.width,
          field.height,
          THREE.RGBAFormat,
          THREE.FloatType,
        );
        t.minFilter = t.magFilter = THREE.NearestFilter;
        t.needsUpdate = true;
        return t;
      };
      return {
        forward: create(pair.forward),
        backward: create(pair.backward),
        size: new THREE.Vector2(pair.forward.width, pair.forward.height),
      };
    });
    return {
      textures,
      pairs,
      dispose() {
        textures.forEach((t) => t.dispose());
        pairs.forEach((p) => {
          p.forward.dispose();
          p.backward.dispose();
        });
      },
    };
  } catch (e) {
    textures.forEach((t) => t.dispose());
    throw e;
  } finally {
    worker.terminate();
  }
}
