import test from "node:test";
import assert from "node:assert/strict";
import { examples } from "../lib/wonderlab/examples";
import {
  validateScene,
  initialValues,
  checkedValues,
  nodeState,
  measurements,
} from "../lib/wonderlab/scene";
import { readBody } from "../lib/wonderlab/http";
import { jsonSchema } from "../lib/wonderlab/meta";
import { sceneSchema } from "../lib/wonderlab/scene";

test("all example scenes pass the same contract used for model outputs", () => {
  for (const e of examples) assert.equal(validateScene(e.scene).title, e.title);
});
test("rejects dangling connections, duplicate ids, bad image boxes, and unsupported physics", () => {
  const scene = () => structuredClone(examples[0].scene);
  const dangling = scene();
  dangling.links.push({
    from: "sun",
    to: "missing",
    style: "rod",
    color: "#ffffff",
    label: "",
  });
  assert.throws(() => validateScene(dangling));
  const duplicate = scene();
  duplicate.nodes[1].id = "sun";
  assert.throws(() => validateScene(duplicate));
  const box = scene();
  box.nodes[0].sourceBox = [0.8, 0.1, 0.2, 0.5];
  assert.throws(() => validateScene(box));
  const physics = scene();
  physics.mode = "physical";
  assert.throws(() => validateScene(physics));
});
test("controls reject invalid targets and out-of-bounds/nonfinite values", () => {
  const scene = structuredClone(examples[1].scene);
  assert.throws(() => checkedValues(scene, { length: -1 }));
  assert.throws(() => checkedValues(scene, { gravity: NaN }));
  scene.controls[0].target = "missing";
  assert.throws(() => validateScene(scene));
});
test("pendulum period follows sqrt(length/gravity), and returns to its start after one period", () => {
  const scene = examples[1].scene,
    values = initialValues(scene),
    bob = scene.nodes.find((n) => n.id === "bob")!;
  const period = measurements(scene, values)[0].periodSeconds;
  assert.ok(Math.abs(period - 3.4746) < 0.001);
  const lunar = measurements(scene, { ...values, gravity: 1.62 })[0]
    .periodSeconds;
  assert.ok(lunar > period * 2.4);
  const start = nodeState(bob, scene, values, 0),
    end = nodeState(bob, scene, values, period);
  assert.ok(Math.abs(start.position[0] - end.position[0]) < 1e-10);
  const r = Math.hypot(
    start.position[0] - bob.motion.center[0],
    start.position[1] - bob.motion.center[1],
  );
  assert.ok(Math.abs(r - values.length) < 1e-10);
});
test("orbit preserves distance to its center", () => {
  const scene = examples[0].scene,
    n = scene.nodes.find((n) => n.id === "earth")!,
    values = initialValues(scene);
  for (const t of [0, 1, 5, 100]) {
    const p = nodeState(n, scene, values, t).position;
    assert.ok(
      Math.abs(Math.hypot(...p.map((x, i) => x - n.motion.center[i])) - 2.7) <
        1e-9,
    );
  }
});
test("schema disallows extra properties and retains fixed vector lengths", () => {
  const schema = jsonSchema(sceneSchema);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.nodes.items.properties.position.minItems, 3);
});
test("rejects cross-origin requests before using a model key", async () => {
  const req = new Request("http://localhost/api/generate", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  await assert.rejects(() => readBody(req), /Cross-origin/);
});
test("rejects oversized bodies and malformed JSON", async () => {
  const req = new Request("http://localhost/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "7000000",
    },
    body: "{}",
  });
  await assert.rejects(() => readBody(req), /too large/);
  await assert.rejects(
    () =>
      readBody(
        new Request("http://localhost/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "oops",
        }),
      ),
    /Invalid request/,
  );
});
