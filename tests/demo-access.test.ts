import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicDemo,
  requireLiveGeneration,
} from "../lib/wonderlab/demo-access";
test("public-demo mode blocks paid model actions", () => {
  assert.equal(isPublicDemo({ PUBLIC_DEMO_MODE: "true" }), true);
  assert.throws(
    () => requireLiveGeneration({ PUBLIC_DEMO_MODE: "true" }),
    (error: any) => error.status === 403,
  );
});
test("private/local mode preserves live generation", () => {
  assert.equal(isPublicDemo({}), false);
  assert.doesNotThrow(() => requireLiveGeneration({}));
  assert.doesNotThrow(() =>
    requireLiveGeneration({ PUBLIC_DEMO_MODE: "false" }),
  );
});
test("demo flag accepts common true forms", () => {
  for (const value of ["TRUE", " true ", "1"])
    assert.equal(isPublicDemo({ PUBLIC_DEMO_MODE: value }), true);
});
