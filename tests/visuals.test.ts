import test from "node:test";
import assert from "node:assert/strict";
import { geometryFor, surfaceFor, spaceScene } from "../lib/wonderlab/visuals";
import { examples } from "../lib/wonderlab/examples";
import { validateScene, type SceneNode } from "../lib/wonderlab/scene";

test("all supported geometry yields finite vertices and nonempty bounds", () => {
  const node = {
    ...examples[0].scene.nodes[0],
    profile: [
      [0, -0.5],
      [0.4, -0.4],
      [0.3, 0.4],
      [0, 0.5],
    ],
    path: [
      [-0.5, -0.5, 0],
      [0, 0, 0.3],
      [0.5, 0.5, 0],
    ],
  } as SceneNode;
  for (const shape of [
    "sphere",
    "box",
    "cylinder",
    "cone",
    "torus",
    "ellipsoid",
    "gear",
    "tube",
    "capsule",
    "cloud",
    "leaf",
    "lathe",
    "path",
  ] as const) {
    const g = geometryFor(shape, node);
    const values = g.getAttribute("position").array;
    assert.ok(values.length > 0, shape);
    assert.ok(Array.from(values).every(Number.isFinite), shape);
    g.computeBoundingBox();
    assert.ok(!g.boundingBox!.isEmpty(), shape);
    g.dispose();
  }
});
test("rejects unsupported material and missing custom shape definitions", () => {
  const s = structuredClone(examples[0].scene);
  s.nodes[0].shape = "path";
  assert.throws(() => validateScene(s));
  s.nodes[0].path = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  assert.throws(() => validateScene(s));
  s.nodes[0].shape = "lathe";
  assert.throws(() => validateScene(s));
  s.nodes[0].profile = [
    [0, -0.5],
    [0, 0],
    [0, 0.5],
  ];
  assert.throws(() => validateScene(s));
});
test("old scenes retain suitable appearances and explicit model choices take precedence", () => {
  assert.equal(spaceScene(examples[0].scene), true);
  assert.equal(spaceScene(examples[1].scene), false);
  assert.equal(surfaceFor(examples[0].scene.nodes[0]), "star");
  assert.equal(
    surfaceFor({ ...examples[0].scene.nodes[0], surface: "glass" }),
    "glass",
  );
});
