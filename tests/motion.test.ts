import test from "node:test";
import assert from "node:assert/strict";
import { estimateMotion } from "../lib/wonderlab/motion";
import { validateScene } from "../lib/wonderlab/scene";
import heart from "../lib/wonderlab/generated-heart.json";

test("tracks a translated textured image with the correct motion direction", () => {
  const width = 160,
    height = 112,
    a = new Uint8Array(width * height),
    b = new Uint8Array(width * height);
  let seed = 31;
  for (let i = 0; i < a.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    a[i] = seed >>> 24;
  }
  for (let y = 0; y < height; y++)
    for (let x = 4; x < width; x++) b[y * width + x] = a[y * width + x - 4];
  const result = estimateMotion(a, b, width, height);
  const values = [];
  for (let y = 8; y < result.height - 8; y++)
    for (let x = 8; x < result.width - 8; x++)
      values.push(result.data[(y * result.width + x) * 4] * width);
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  assert.ok(Math.abs(median - 4) < 1.5, `Median dx ${median}`);
  assert.ok(Array.from(result.data).every(Number.isFinite));
});
test("static images produce negligible component motion", () => {
  const a = Uint8Array.from({ length: 160 * 112 }, (_, i) => (i * 37) % 256);
  const f = estimateMotion(a, a, 160, 112);
  assert.ok(f.data.every((v, i) => i % 4 === 3 || Math.abs(v) < 0.001));
});
test("pose identifiers must match every timeline phase in order", () => {
  assert.doesNotThrow(() => validateScene(heart));
  const bad = structuredClone(heart);
  bad.cutaway.poses[0].phaseId = "missing";
  assert.throws(() => validateScene(bad));
});
